"use strict";
/**
 * BrowserHub API Server — cấp CDP/profile/automation cho các tool trong workspace.
 * Port: 6003 (bind 127.0.0.1).
 *
 * Dispatcher mỏng: auth → match route registry (api-routes.cjs) → handler.
 * Thêm endpoint = thêm descriptor trong api-routes.cjs / automation/plugins.cjs.
 */
const http = require("node:http");

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

const DEFAULT_API_PORT = 6003;
const API_HOST = "127.0.0.1";

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
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

  // Auto-Sync Cookie on PC Close (`ok 3`): push updated PC cookies to Mobile Vault when a browser session closes
  try {
    onStealthLiveSyncEvent(async (payload) => {
      try {
        const rawCode = String(payload?.profileCode || payload?.browser || payload?.profileName || "").trim();
        const m = /(\d{4})/.exec(rawCode);
        if (!m) return;
        const code = m[1];
        const fs = require("node:fs");
        const path = require("node:path");
        const { pathToFileURL } = require("node:url");
        const bridgeCandidates = [
          path.resolve(__dirname, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
          "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
        ];
        const bridgeFile = bridgeCandidates.find((p) => fs.existsSync(p));
        if (!bridgeFile) return;
        const bridgeVer = fs.statSync(bridgeFile).mtimeMs;
        const bridge = await import(`${pathToFileURL(bridgeFile).href}?v=${bridgeVer}`);
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
      return sendJson(res, 200, {
        ok: true,
        product: "P0003",
        apiPort: API_PORT,
        authRequired: Boolean(getConfiguredToken()),
        features: ["cdp", "jobs", "plugins", "live-events"],
      });
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
        const fs = require("node:fs");
        const path = require("node:path");
        const { pathToFileURL } = require("node:url");
        const bridgeCandidates = [
          path.resolve(__dirname, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
          "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
        ];
        const bridgeFile = bridgeCandidates.find((p) => fs.existsSync(p));
        if (bridgeFile) {
          const bridgeVer = fs.statSync(bridgeFile).mtimeMs;
          const bridge = await import(`${pathToFileURL(bridgeFile).href}?v=${bridgeVer}`);
          if (req.method === "GET" && urlPath === "/api/mobile-stealth/profiles") {
            const out = await bridge.listMobileVaultProfiles();
            return sendJson(res, 200, out);
          }
          if (req.method === "GET" && urlPath === "/api/mobile-stealth/status") {
            const profileCode = query.get("profile") || query.get("code") || "0001";
            const status = await bridge.getMobileVaultProfileStatus(profileCode);
            return sendJson(res, 200, { ok: true, status });
          }
          if (req.method === "POST") {
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
            if (urlPath === "/api/mobile-stealth/switch") {
              const swRes = await bridge.switchAndroidDeviceProfile(profileCode, {
                proxy: String(body.proxy || ""),
                clearPackages: Boolean(body.clearPackages),
                restoreIfAvailable: body.restoreIfAvailable !== false,
              });
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...swRes, status });
            }
            if (urlPath === "/api/mobile-stealth/push-cookies") {
              const pushRes = await bridge.pushBrowserCookiesToMobileDevice(profileCode, {
                serial: String(body.serial || ""),
              });
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...pushRes, status });
            }
            if (urlPath === "/api/mobile-stealth/pull-cookies") {
              const pullRes = await bridge.extractMobileCookiesToBrowserProfile(profileCode, {
                serial: String(body.serial || ""),
              });
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...pullRes, status });
            }
            if (urlPath === "/api/mobile-stealth/snapshot") {
              const snapRes = await bridge.backupAndroidProfileSnapshot(profileCode);
              const status = await bridge.getMobileVaultProfileStatus(profileCode);
              return sendJson(res, 200, { ...snapRes, status });
            }
            if (urlPath === "/api/mobile-stealth/mirror") {
              const mirRes = await bridge.launchMobileScreenMirror(profileCode);
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
        return sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
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
      try { sendJson(res, 500, { ok: false, error: msg }); }
      catch { res.end(); }
    }
  });

  server.listen(API_PORT, API_HOST, () => {
    const mode = getConfiguredToken() ? "auth=token" : "auth=open";
    console.log(`[BrowserHub] API running → http://${API_HOST}:${API_PORT} (${mode}, concurrency=${concurrency})`);
  });

  server.on("error", (err) => {
    console.error("[BrowserHub] Server error:", err.message);
  });

  return server;
}

module.exports = { startApiServer };
