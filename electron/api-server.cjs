"use strict";
/**
 * BrowserHub API Server — cấp CDP/profile/automation cho các tool trong workspace.
 * Port: 6003 (bind 127.0.0.1).
 *
 * Dispatcher mỏng: auth → match route registry (api-routes.cjs) → handler.
 * Thêm endpoint = thêm descriptor trong api-routes.cjs / automation/plugins.cjs.
 */
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let _stealthBridgePromise = null;
let _cachedStealthBridge = null;
function getStealthBridge() {
  if (_cachedStealthBridge) return Promise.resolve(_cachedStealthBridge);
  if (!_stealthBridgePromise) {
    const bridgePath = pathToFileURL(path.join(__dirname, "lib", "desktop-runtime-bridge.mjs")).href;
    _stealthBridgePromise = import(bridgePath)
      .then((mod) => {
        _cachedStealthBridge = mod.createSovereignRuntimeBridge({
          productRoot: path.resolve(__dirname, ".."),
          homeDirName: ".stealth_console",
        });
        return _cachedStealthBridge;
      })
      .catch(() => null);
  }
  return _stealthBridgePromise;
}

const { checkAuth, getConfiguredToken } = require("./lib/api-auth.cjs");
const { JobQueue } = require("./lib/job-queue.cjs");
const { buildRoutes } = require("./api-routes.cjs");
const {
  runWithAgentSmokeRequest,
  parseAgentSmokeFlag,
  parseAgentCallerId,
} = require("./lib/agent-smoke-context.cjs");
const { onStealthLiveSyncEvent } = require("./lib/stealth-multiplatform-sync.cjs");
const {
  ensureAgentWorkerDaemonRunning,
  shouldOffloadAgentRequestToWorker,
  proxyRequestToWorker,
} = require("./lib/agent-worker-proxy.cjs");
const { verifyPackagedRuntime } = require("./lib/packaged-runtime-check.cjs");

const HEALTH_RUNTIME_CACHE_TTL_MS = 15_000;
let cachedRuntimeVerify = { value: null, at: 0 };

function buildHealthPayload({
  apiPort = DEFAULT_API_PORT,
  authRequired = false,
  verifyRuntime,
} = {}) {
  const customVerify = typeof verifyRuntime === "function";
  const verifier = customVerify ? verifyRuntime : verifyPackagedRuntime;
  const now = Date.now();
  let packagedRuntime = !customVerify && cachedRuntimeVerify.value && now - cachedRuntimeVerify.at < HEALTH_RUNTIME_CACHE_TTL_MS
    ? cachedRuntimeVerify.value
    : null;
  if (!packagedRuntime) {
    try {
      packagedRuntime = verifier();
      if (!customVerify) cachedRuntimeVerify = { value: packagedRuntime, at: now };
    } catch (err) {
      packagedRuntime = {
        ok: false,
        isPackaged: false,
        missing: [],
        root: "",
        cloakbrowserUnpacked: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return {
    ok: true,
    product: "P0003",
    apiPort,
    authRequired: Boolean(authRequired),
    authTelemetry: _cachedStealthBridge?.readHubAuthTelemetry ? _cachedStealthBridge.readHubAuthTelemetry() : null,
    features: ["cdp", "jobs", "plugins", "live-events"],
    packagedRuntime,
  };
}

const DEFAULT_API_PORT = 6003;
const API_HOST = "127.0.0.1";
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const BODY_READ_TIMEOUT_MS = 30_000;

function abortRequestStreamAfterReply(req) {
  try {
    if (typeof req.pause === "function") req.pause();
  } catch {
    /* ignore */
  }
  const destroyReq = () => {
    try {
      if (typeof req.destroy === "function" && !req.destroyed) req.destroy();
    } catch {
      /* ignore */
    }
  };
  const res = req?.res || req?.socket?._httpMessage;
  if (res && typeof res.once === "function" && !res.writableEnded) {
    res.once("finish", destroyReq);
    const fallback = setTimeout(destroyReq, 1000);
    if (typeof fallback.unref === "function") fallback.unref();
  } else {
    destroyReq();
  }
}

function readBody(req, { maxBytes = MAX_BODY_BYTES, timeoutMs = BODY_READ_TIMEOUT_MS } = {}) {
  if (req && req.__stealthReadBodyPromise) {
    return req.__stealthReadBodyPromise;
  }
  const promise = new Promise((resolve, reject) => {
    const contentLength = Number(req?.headers?.["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      abortRequestStreamAfterReply(req);
      const err = new Error(`Request body exceeds limit (${maxBytes} bytes)`);
      err.statusCode = 413;
      reject(err);
      return;
    }

    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
    };

    const fail = (message, statusCode) => {
      if (settled) return;
      settled = true;
      cleanup();
      chunks.length = 0;
      abortRequestStreamAfterReply(req);
      const err = new Error(message);
      err.statusCode = statusCode;
      reject(err);
    };

    const timer = setTimeout(() => {
      fail(`Request body read timed out after ${timeoutMs}ms`, 408);
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();

    req.on("data", (chunk) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        fail(`Request body exceeds limit (${maxBytes} bytes)`, 413);
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      cleanup();
      const raw = chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : "";
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({});
    });
  });
  if (req) req.__stealthReadBodyPromise = promise;
  return promise;
}

function sendJson(res, statusCode, data) {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(data);
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
  if (statusCode === 413 || statusCode === 408) {
    headers.Connection = "close";
  }
  res.writeHead(statusCode, headers);
  res.end(body);
}

function sendSse(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
    Connection: "keep-alive"
  });
  return {
    send(data) { res.write(`data: ${JSON.stringify(data)}\n\n`); },
    end() { res.end(); }
  };
}

const send = { json: sendJson, sse: sendSse };

function startApiServer({ sessionManager, profileService, userDataRoot = "", port }) {
  const API_PORT = Number(port) || Number(process.env.STEALTH_API_PORT) || DEFAULT_API_PORT;
  const concurrency = Number(process.env.STEALTH_JOB_CONCURRENCY) || 1;
  const jobQueue = new JobQueue({ concurrency });

  let routes = [];
  let util = {};
  const services = {
    sessionManager,
    profileService,
    jobQueue,
    userDataRoot,
    send,
    rebuildRoutes() {
      const freshBuildRoutes = require("./api-routes.cjs").buildRoutes;
      const built = freshBuildRoutes(services);
      routes = built.routes;
      util = built.util;
      return routes.length;
    },
  };
  services.rebuildRoutes();
  void getStealthBridge();

  // Auto-Sync Cookie on PC Close (`ok 3`): push updated PC cookies to Mobile Vault when a browser session closes
  try {
    onStealthLiveSyncEvent(async (payload) => {
      try {
        const rawCode = String(payload?.profileCode || payload?.browser || payload?.profileName || "").trim();
        const m = /(\d{4})/.exec(rawCode);
        if (!m) return;
        const code = m[1];
        const path = require("node:path");
        const fs = require("node:fs");
        const { loadAndroidStealthBridge } = require("./lib/android-bridge-loader.cjs");
        const bridge = await loadAndroidStealthBridge(__dirname);
        if (!bridge) return;
        const identityFile = path.join(bridge.MOBILE_VAULT_ROOT, `${code}.identity.json`);
        if (!fs.existsSync(identityFile)) return;
        const prefFile = path.join(bridge.MOBILE_VAULT_ROOT, "auto-sync-prefs.json");
        let autoSync = false;
        if (fs.existsSync(prefFile)) {
          const prefs = JSON.parse(fs.readFileSync(prefFile, "utf8")) || {};
          if (prefs[code] !== undefined) autoSync = Boolean(prefs[code]);
        }
        if (autoSync) {
          await bridge.pushBrowserCookiesToMobileDevice(code).catch(() => undefined);
        }
      } catch {
        /* ignore background sync errors */
      }
    });
  } catch {
    /* ignore */
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Api-Token, X-Stealth-Agent-Smoke"
      });
      res.end();
      return;
    }

    let urlPath;
    let query = new URLSearchParams();
    try {
      const parsed = new URL(req.url ?? "/", "http://localhost");
      urlPath = parsed.pathname;
      query = parsed.searchParams;
    } catch {
      urlPath = "/";
    }

    // GET /api/health — luôn mở (probe + báo có cần auth không).
    if (req.method === "GET" && urlPath === "/api/health") {
      await getStealthBridge();
      return sendJson(
        res,
        200,
        buildHealthPayload({
          apiPort: API_PORT,
          authRequired: Boolean(getConfiguredToken()),
        }),
      );
    }

    if (urlPath === "/api/hub-auth/telemetry" && (req.method === "GET" || req.method === "POST")) {
      const bridge = await getStealthBridge();
      if (req.method === "GET") {
        return sendJson(res, 200, {
          ok: true,
          telemetry: bridge?.readHubAuthTelemetry ? bridge.readHubAuthTelemetry() : null,
        });
      }
      const body = await readBody(req).catch(() => ({}));
      const saved = bridge?.saveHubAuthTelemetry ? bridge.saveHubAuthTelemetry(body) : null;
      return sendJson(res, 200, { ok: true, telemetry: saved });
    }

    // GET /api/stealth/live-events — Real-time SSE stream (`ok 3`) for P0020 2FA Manager (<100ms sync).
    if (req.method === "GET" && urlPath === "/api/stealth/live-events") {
      const sse = sendSse(res);
      sse.send({ type: "connected", product: "P0003", timestamp: new Date().toISOString() });
      const unsub = onStealthLiveSyncEvent((payload) => {
        try {
          sse.send({ type: "stealth-sync", ...payload });
        } catch {
          /* ignore */
        }
      });
      const heartbeat = setInterval(() => {
        try {
          res.write(": ping\n\n");
        } catch {
          /* ignore */
        }
      }, 25000);
      if (typeof heartbeat.unref === "function") heartbeat.unref();
      req.on("close", () => {
        unsub();
        clearInterval(heartbeat);
      });
      return;
    }

    // Mobile Stealth Bridge direct fallback on :6003 / :6004 (`📱 Android` tab in P0003)
    if (urlPath.startsWith("/api/mobile-stealth/")) {
      try {
        if (req.method === "GET" && urlPath === "/api/mobile-stealth/execution-board") {
          const boardModPath = require.resolve("./lib/mobile-farm-execution-board.cjs");
          delete require.cache[boardModPath];
          const { collectMobileFarmExecutionBoard } = require(boardModPath);
          return sendJson(res, 200, collectMobileFarmExecutionBoard());
        }
        if (req.method === "POST" && urlPath === "/api/mobile-stealth/daemon-control") {
          const body = await readBody(req);
          const boardModPath = require.resolve("./lib/mobile-farm-execution-board.cjs");
          delete require.cache[boardModPath];
          const { controlMobileFarmDaemon } = require(boardModPath);
          const out = controlMobileFarmDaemon({ daemonId: body?.daemonId, action: body?.action || "start" });
          return sendJson(res, out?.ok ? 200 : 400, out);
        }
        const { loadAndroidStealthBridge } = require("./lib/android-bridge-loader.cjs");
        const iosBridge = require("./lib/ios-stealth-bridge.cjs");
        const bridge = await loadAndroidStealthBridge(__dirname);
        if (bridge) {
          if (req.method === "GET" && urlPath === "/api/mobile-stealth/profiles") {
            const out = await bridge.listMobileVaultProfiles();
            const augmented = await iosBridge.augmentMobileProfilesResponse(out).catch(() => out);
            return sendJson(res, 200, augmented);
          }
          if (req.method === "GET" && urlPath === "/api/mobile-stealth/status") {
            const profileCode = query.get("profile") || query.get("code") || "0001";
            const status = await bridge.getMobileVaultProfileStatus(profileCode);
            const aug = await iosBridge.augmentMobileProfilesResponse({ device: status?.device || {} }).catch(() => null);
            if (aug?.device && status) status.device = aug.device;
            return sendJson(res, 200, { ok: true, status });
          }
          const inlineMobilePostPaths = new Set([
            "/api/mobile-stealth/create",
            "/api/mobile-stealth/delete",
            "/api/mobile-stealth/switch",
            "/api/mobile-stealth/push-cookies",
            "/api/mobile-stealth/pull-cookies",
            "/api/mobile-stealth/snapshot",
            "/api/mobile-stealth/crane-offload",
            "/api/mobile-stealth/crane-restore",
            "/api/mobile-stealth/restore",
            "/api/mobile-stealth/crane-mount",
            "/api/mobile-stealth/mirror",
            "/api/mobile-stealth/auto-sync",
            "/api/mobile-stealth/update-profile",
            "/api/mobile-stealth/sync-p0020",
          ]);
          if (req.method === "POST" && inlineMobilePostPaths.has(urlPath)) {
            const body = await readBody(req);
            const profileCode = String(body.profileCode || body.profile || body.code || "0001");
            if (urlPath === "/api/mobile-stealth/create") {
              const out = await bridge.createMobileVaultProfile({
                profileCode: body.profileCode || "",
                manufacturer: body.manufacturer || "",
                model: body.model || "",
                customNote: body.customNote || "",
                autoSync: body.autoSync !== false,
              });
              return sendJson(res, 200, out);
            }
            if (urlPath === "/api/mobile-stealth/delete") {
              const out = await bridge.deleteMobileVaultProfiles({
                codes: Array.isArray(body.codes) ? body.codes : [profileCode],
              });
              return sendJson(res, 200, out);
            }
            const targetIsIos = iosBridge.isIosSerial(body.serial) || (!body.serial && Boolean(iosBridge.getActiveIosDeviceSerial()));
            if (urlPath === "/api/mobile-stealth/switch") {
              const swRes = targetIsIos
                ? await iosBridge.switchIosDeviceProfile(profileCode, {
                    serial: String(body.serial || ""),
                    proxy: String(body.proxy || ""),
                    clearPackages: Boolean(body.clearPackages),
                    restoreIfAvailable: body.restoreIfAvailable !== false,
                  })
                : await bridge.switchAndroidDeviceProfile(profileCode, {
                    proxy: String(body.proxy || ""),
                    clearPackages: Boolean(body.clearPackages),
                    restoreIfAvailable: body.restoreIfAvailable !== false,
                  });
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...swRes, status });
            }
            if (urlPath === "/api/mobile-stealth/push-cookies") {
              const pushRes = targetIsIos
                ? await iosBridge.pushBrowserCookiesToIosDevice(profileCode, {
                    serial: String(body.serial || ""),
                    cookies: Array.isArray(body.cookies) ? body.cookies : null,
                  })
                : await bridge.pushBrowserCookiesToMobileDevice(profileCode, {
                    serial: String(body.serial || ""),
                  });
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...pushRes, status });
            }
            if (urlPath === "/api/mobile-stealth/pull-cookies") {
              const pullRes = targetIsIos
                ? await iosBridge.extractIosCookiesToBrowserProfile(profileCode, {
                    serial: String(body.serial || ""),
                  })
                : await bridge.extractMobileCookiesToBrowserProfile(profileCode, {
                    serial: String(body.serial || ""),
                  });
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...pullRes, status });
            }
            if (urlPath === "/api/mobile-stealth/snapshot") {
              const wantCrane = body?.target === "crane" || Boolean(body?.craneContainer);
              const snapRes = targetIsIos
                ? wantCrane
                  ? await iosBridge.offloadCraneLiteContainer(profileCode, {
                      serial: String(body.serial || ""),
                      containerName: String(body.craneContainer || ""),
                      bundleId: String(body.bundleId || "com.facebook.Facebook"),
                      removeFromDevice: body.removeFromDevice !== false,
                    })
                  : await iosBridge.backupIosProfileSnapshot(profileCode, {
                      serial: String(body.serial || ""),
                    })
                : await bridge.backupAndroidProfileSnapshot(profileCode);
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...snapRes, status });
            }
            if (urlPath === "/api/mobile-stealth/crane-offload") {
              const offRes = targetIsIos
                ? await iosBridge.offloadCraneLiteContainer(profileCode, {
                    serial: String(body.serial || ""),
                    containerName: String(body.craneContainer || ""),
                    bundleId: String(body.bundleId || "com.facebook.Facebook"),
                    removeFromDevice: body.removeFromDevice !== false,
                  })
                : await bridge.backupAndroidProfileSnapshot(profileCode);
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...offRes, status });
            }
            if (urlPath === "/api/mobile-stealth/crane-restore" || urlPath === "/api/mobile-stealth/restore") {
              const wantCrane =
                urlPath === "/api/mobile-stealth/crane-restore" ||
                body?.target === "crane" ||
                Boolean(body?.craneContainer);
              const resOut = targetIsIos
                ? wantCrane
                  ? await iosBridge.restoreCraneLiteContainer(profileCode, {
                      serial: String(body.serial || ""),
                      containerName: String(body.craneContainer || ""),
                      activate: body.activate !== false,
                    })
                  : await iosBridge.restoreIosProfileSnapshot(profileCode, {
                      serial: String(body.serial || ""),
                    })
                : await bridge.restoreAndroidProfileSnapshot(profileCode);
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...resOut, status });
            }
            if (urlPath === "/api/mobile-stealth/crane-mount") {
              const mountRes = targetIsIos
                ? await iosBridge.mountCraneLiteProfile(profileCode, {
                    serial: String(body.serial || ""),
                    containerName: String(body.craneContainer || ""),
                    bundleId: String(body.bundleId || "com.facebook.Facebook"),
                    minFreeGb: Number.isFinite(Number(body.minFreeGb)) ? Number(body.minFreeGb) : 10,
                    maxOnDevice: Number.isFinite(Number(body.maxOnDevice)) ? Number(body.maxOnDevice) : 0,
                    autoOffloadLru: body.autoOffloadLru !== false,
                    activate: body.activate !== false,
                    proxy: String(body.proxy || ""),
                    rotateProxy: Boolean(body.rotateProxy),
                  })
                : await bridge.switchAndroidDeviceProfile(profileCode, {
                    proxy: String(body.proxy || ""),
                    restoreIfAvailable: body.restoreIfAvailable !== false,
                  });
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...mountRes, status });
            }
            if (urlPath === "/api/mobile-stealth/mirror") {
              const mirRes = targetIsIos
                ? await iosBridge.launchIosScreenMirror(profileCode, {
                    serial: String(body.serial || ""),
                  })
                : await bridge.launchMobileScreenMirror(profileCode);
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...mirRes, status });
            }
            if (urlPath === "/api/mobile-stealth/auto-sync") {
              const out = await bridge.toggleMobileProfileAutoSync(profileCode, {
                enabled: body.enabled,
              });
              return sendJson(res, 200, out);
            }
            if (urlPath === "/api/mobile-stealth/update-profile") {
              const out = await bridge.updateMobileProfileHardwareOverride(profileCode, {
                manufacturer: body.manufacturer,
                model: body.model,
                glRenderer: body.glRenderer,
                customNote: body.customNote,
                autoSync: body.autoSync,
              });
              return sendJson(res, 200, out);
            }
            if (urlPath === "/api/mobile-stealth/sync-p0020") {
              const out = await bridge.syncMobileVaultTagToP0020(profileCode, {
                hasSnapshot: body.hasSnapshot !== false,
                promoteChallengedMail: Boolean(body.promoteChallengedMail),
              });
              return sendJson(res, 200, out);
            }
          }
        }
      } catch (err) {
        const status = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
        return sendJson(res, status, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Auth gate.
    const auth = checkAuth(req, urlPath);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

    try {
      const route = routes.find((r) => r.method === req.method && r.pattern.test(urlPath));
      if (!route) return sendJson(res, 404, { ok: false, error: "Not found" });

      const params = urlPath.match(route.pattern) || [];
      const profileIdMatch = urlPath.match(/^\/api\/profiles\/([^/]+)/);
      if (profileIdMatch?.[1]) {
        try {
          const { touchWorkerSessionActivity } = require("./lib/agent-worker-memory-guard.cjs");
          touchWorkerSessionActivity(decodeURIComponent(profileIdMatch[1]));
        } catch {
          /* ignore */
        }
      }
      const body = req.method === "POST" || req.method === "PATCH" ? await readBody(req) : {};
      const ctx = { req, res, urlPath, params, query, body, send, util, services };

      const agentSmoke = parseAgentSmokeFlag(req, body);
      const agentCallerId = parseAgentCallerId(req, body);
      if (
        shouldOffloadAgentRequestToWorker({
          apiPort: API_PORT,
          agentSmoke,
          method: req.method,
          urlPath,
          params,
          body,
          sessionManager,
        })
      ) {
        const workerReady = await ensureAgentWorkerDaemonRunning();
        if (workerReady) {
          const proxied = await proxyRequestToWorker({ req, res, urlPath, query, body });
          if (proxied) return;
        }
      }
      try {
        await runWithAgentSmokeRequest(agentSmoke, () => route.handler(ctx), agentCallerId);
      } catch (routeErr) {
        const { isCorruptSqliteError, recoverCorruptDatabase } = require("./db/init.cjs");
        if (userDataRoot && isCorruptSqliteError(routeErr)) {
          const recovered = await recoverCorruptDatabase(userDataRoot).catch(() => ({ ok: false }));
          if (recovered?.ok) {
            await runWithAgentSmokeRequest(agentSmoke, () => route.handler(ctx), agentCallerId);
            return;
          }
        }
        throw routeErr;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
      try { sendJson(res, status, { ok: false, error: msg }); }
      catch { res.end(); }
    }
  });
  server.headersTimeout = 60_000;
  server.keepAliveTimeout = 15_000;

  let androidWatchdogTimer = null;
  let androidWatchdogStarted = false;
  let peerProxyTimer = null;
  const ensureLocalAndroidWatchdog = async () => {
    if (androidWatchdogStarted) return true;
    try {
      const { loadAndroidStealthBridge } = require("./lib/android-bridge-loader.cjs");
      const bridge = await loadAndroidStealthBridge(__dirname);
      if (bridge && typeof bridge.startMobileHotplugWatcher === "function") {
        const res = await bridge
          .startMobileHotplugWatcher({
            intervalMs: 60_000,
            hardwareWatchdogIntervalMs: 5 * 60_000,
            autoProvision: false,
          })
          .catch(() => null);
        if (res?.running) {
          androidWatchdogStarted = true;
          if (androidWatchdogTimer) {
            clearInterval(androidWatchdogTimer);
            androidWatchdogTimer = null;
          }
          return true;
        }
      }
    } catch {
      /* ignore when bridge unavailable */
    }
    return false;
  };

  const resolveWorkspaceScript = (relPath) => {
    const candidates = [
      path.resolve(__dirname, "..", "..", relPath),
      path.join("E:\\Dev\\Tool", relPath),
    ];
    return candidates.find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    }) || "";
  };

  const EXPECTED_PEER_PROXY_VERSION = 2;

  const probePeerProxyHealth = (host, port) =>
    new Promise((resolve) => {
      const req = http.request(
        { hostname: host, port, path: "/api/health", method: "GET", timeout: 1_200 },
        (r) => {
          let raw = "";
          r.on("data", (c) => (raw += c));
          r.on("end", () => {
            try {
              const parsed = JSON.parse(raw);
              resolve({
                ok: r.statusCode === 200 && Boolean(parsed?.ok),
                proxyVersion: Number(parsed?.proxyVersion || 0),
              });
            } catch {
              resolve({ ok: r.statusCode === 200 && raw.includes('"ok":true'), proxyVersion: 0 });
            }
          });
        },
      );
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, proxyVersion: 0 });
      });
      req.on("error", () => resolve({ ok: false, proxyVersion: 0 }));
      req.end();
    });

  const triggerPeerProxyReload = (host, port, peerToken) =>
    new Promise((resolve) => {
      const req = http.request(
        {
          hostname: host,
          port,
          path: "/_proxy/reload",
          method: "POST",
          timeout: 1_500,
          headers: peerToken
            ? { "X-Stealth-Peer-Token": peerToken, Authorization: `Bearer ${peerToken}` }
            : {},
        },
        (r) => {
          r.resume();
          r.on("end", () => resolve(r.statusCode === 200));
        },
      );
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
      req.on("error", () => resolve(false));
      req.end();
    });

  const ensureLocalTailscalePeerProxy = async () => {
    try {
      const proxyHost = String(process.env.P0003_STEALTH_PROXY_HOST || "100.64.234.45").trim();
      const proxyPort = Number(process.env.P0003_STEALTH_PROXY_PORT || DEFAULT_API_PORT) || DEFAULT_API_PORT;
      const readEnvLib = resolveWorkspaceScript("scripts\\lib\\read-env-file.cjs");
      const proxyScript = resolveWorkspaceScript("scripts\\p0003-stealth-tailscale-proxy.mjs");
      const winShellLib = resolveWorkspaceScript("scripts\\lib\\win-shell-env.cjs");
      if (!proxyScript || !winShellLib) return false;

      const devRoot = path.resolve(proxyScript, "..", "..", "..");
      let peerTok = String(process.env.P0003_STEALTH_PEER_TOKEN || process.env.STEALTH_API_TOKEN || "").trim();
      if (!peerTok && readEnvLib) {
        try {
          const { readSharedEnv } = require(readEnvLib);
          const sharedEnv = readSharedEnv(devRoot);
          peerTok = String(sharedEnv.P0003_STEALTH_PEER_TOKEN || sharedEnv.STEALTH_API_TOKEN || "").trim();
        } catch {}
      }

      const health = await probePeerProxyHealth(proxyHost, proxyPort);
      if (health.ok) {
        if (health.proxyVersion > 0 && health.proxyVersion < EXPECTED_PEER_PROXY_VERSION && peerTok) {
          await triggerPeerProxyReload(proxyHost, proxyPort, peerTok).catch(() => {});
        }
        return true;
      }

      if (!peerTok && process.env.P0003_STEALTH_PROXY_ALLOW_OPEN !== "1") return false;

      const { ensureHiddenNodew, startHiddenDetachedProcess } = require(winShellLib);
      const nodew = ensureHiddenNodew();
      startHiddenDetachedProcess(nodew, [proxyScript], {
        cwd: devRoot,
        logFile: path.join(devRoot, ".cache", "p0003-stealth-tailscale-proxy.log"),
      });
      return true;
    } catch {
      return false;
    }
  };

  server.listen(API_PORT, API_HOST, () => {
    const mode = getConfiguredToken() ? "auth=token" : "auth=open";
    console.log(`[BrowserHub] API running → http://${API_HOST}:${API_PORT} (${mode}, concurrency=${concurrency})`);
    if (API_PORT === DEFAULT_API_PORT && !process.env.NODE_TEST_CONTEXT) {
      if (process.env.STEALTH_DISABLE_ANDROID_WATCHDOG !== "1") {
        const bootDelay = setTimeout(() => void ensureLocalAndroidWatchdog(), 15_000);
        if (typeof bootDelay.unref === "function") bootDelay.unref();
        androidWatchdogTimer = setInterval(() => void ensureLocalAndroidWatchdog(), 5 * 60_000);
        if (typeof androidWatchdogTimer.unref === "function") androidWatchdogTimer.unref();
      }
      if (process.env.STEALTH_DISABLE_PEER_PROXY !== "1") {
        const peerBoot = setTimeout(() => void ensureLocalTailscalePeerProxy(), 3_000);
        if (typeof peerBoot.unref === "function") peerBoot.unref();
        peerProxyTimer = setInterval(() => void ensureLocalTailscalePeerProxy(), 5 * 60_000);
        if (typeof peerProxyTimer.unref === "function") peerProxyTimer.unref();
      }
    }
  });

  server.on("close", () => {
    if (androidWatchdogTimer) {
      clearInterval(androidWatchdogTimer);
      androidWatchdogTimer = null;
    }
    if (peerProxyTimer) {
      clearInterval(peerProxyTimer);
      peerProxyTimer = null;
    }
  });

  server.on("error", (err) => {
    console.error("[BrowserHub] Server error:", err.message);
    if (process.env.STEALTH_AGENT_WORKER === "1" && err?.code === "EADDRINUSE") {
      process.exit(1);
    }
  });

  return server;
}

module.exports = { startApiServer, buildHealthPayload, readBody };
