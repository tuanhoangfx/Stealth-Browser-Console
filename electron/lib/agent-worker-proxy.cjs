"use strict";
/**
 * Transparent Agent Worker Offload Proxy (`:6003` -> `:6004`)
 *
 * Keeps the user's Desktop UI process (`:6003`) 100% responsive by offloading
 * heavy headless agent browser sessions (`X-Stealth-Agent-Smoke: 1` / `agentTask: true`)
 * to the standalone background worker daemon on `:6004` whenever the target profile
 * is not already open inside `:6003`.
 */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const DEFAULT_WORKER_PORT = Number(process.env.STEALTH_AGENT_WORKER_PORT || 6004);
const WORKER_HOST = "127.0.0.1";

let lastSpawnAttemptAt = 0;
const workerHealthyCacheByPort = new Map();
const inFlightStartByPort = new Map();

function resolveWorkerDaemonScriptPath() {
  const candidates = [
    path.resolve(__dirname, "..", "..", "scripts", "stealth-agent-worker-daemon.cjs"),
    "E:\\Dev\\Tool\\P0003-Stealth-Browser-Console\\scripts\\stealth-agent-worker-daemon.cjs",
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "";
}

function resolveElectronBinaryForWorker() {
  const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\CzP\\AppData\\Local";
  const prodExe = path.join(
    localAppData,
    "Programs",
    "stealth-browser-console",
    "Stealth Browser Console.exe",
  );
  try {
    if (fs.existsSync(prodExe)) return prodExe;
  } catch {
    /* ignore */
  }
  const devElectronExe = path.resolve(
    __dirname,
    "..",
    "..",
    "node_modules",
    "electron",
    "dist",
    "electron.exe",
  );
  try {
    if (fs.existsSync(devElectronExe)) return devElectronExe;
  } catch {
    /* ignore */
  }
  return process.execPath;
}

function probeWorkerHealth(port = DEFAULT_WORKER_PORT, timeoutMs = 1500) {
  const now = Date.now();
  const cached = workerHealthyCacheByPort.get(port);
  if (cached && cached.ok && now - cached.checkedAt < 3000) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: WORKER_HOST,
        port,
        path: "/api/health",
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          const ok = res.statusCode === 200 && raw.includes('"ok":true');
          workerHealthyCacheByPort.set(port, { ok, checkedAt: Date.now() });
          resolve(ok);
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      workerHealthyCacheByPort.set(port, { ok: false, checkedAt: Date.now() });
      resolve(false);
    });
    req.on("error", () => {
      workerHealthyCacheByPort.set(port, { ok: false, checkedAt: Date.now() });
      resolve(false);
    });
    req.end();
  });
}

async function ensureAgentWorkerDaemonRunning(port = DEFAULT_WORKER_PORT, { maxWaitAttempts = 30 } = {}) {
  if (process.env.STEALTH_ENABLE_SPLIT_WORKER_6004 !== "1") return false;
  if (await probeWorkerHealth(port, 1200)) return true;

  const existingInFlight = inFlightStartByPort.get(port);
  if (existingInFlight) {
    return existingInFlight;
  }

  const startPromise = (async () => {
    const rounds = Number.isInteger(maxWaitAttempts) && maxWaitAttempts >= 0 ? maxWaitAttempts : 30;
    if (rounds > 1) {
      await new Promise((r) => setTimeout(r, 200));
      if (await probeWorkerHealth(port, 1200)) return true;
    }

    const now = Date.now();
    if (now - lastSpawnAttemptAt < 5000) {
      for (let i = 0; i < Math.min(rounds, 10); i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (await probeWorkerHealth(port, 1000)) return true;
      }
      return false;
    }
    lastSpawnAttemptAt = now;

    const scriptPath = resolveWorkerDaemonScriptPath();
    if (!scriptPath) return false;

    const exePath = resolveElectronBinaryForWorker();
    const os = require("node:os");
    const childEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      STEALTH_ENABLE_SPLIT_WORKER_6004: "1",
      STEALTH_API_PORT: String(port),
      STEALTH_AGENT_WORKER_PORT: String(port),
      STEALTH_AGENT_WORKER: "1",
      STEALTH_AGENT_SMOKE: "1",
      STEALTH_HEADLESS_SMOKE: "1",
    };
    try {
      const winShellCandidate = path.resolve(__dirname, "..", "..", "..", "scripts", "lib", "win-shell-env.cjs");
      const fallbackWinShell = "E:\\Dev\\Tool\\scripts\\lib\\win-shell-env.cjs";
      const winShellPath = fs.existsSync(winShellCandidate)
        ? winShellCandidate
        : fs.existsSync(fallbackWinShell)
          ? fallbackWinShell
          : "";
      if (winShellPath) {
        const winShell = require(winShellPath);
        const launchOpts = {
          command: exePath,
          args: [scriptPath],
          cwd: path.dirname(scriptPath),
          pidFile: path.join(os.tmpdir(), `stealth-agent-worker-${port}.pid`),
          logFile: path.join(os.tmpdir(), `stealth-agent-worker-${port}.log`),
          env: childEnv,
        };
        if (typeof winShell.startHiddenDetachedProcessAsync === "function") {
          await winShell.startHiddenDetachedProcessAsync(launchOpts);
        } else if (typeof winShell.startHiddenDetachedProcess === "function") {
          winShell.startHiddenDetachedProcess(launchOpts);
        }
      } else {
        const child = spawn(exePath, [scriptPath], {
          detached: process.platform !== "win32",
          stdio: "ignore",
          windowsHide: true,
          env: childEnv,
        });
        child.unref();
      }
    } catch {
      return false;
    }

    for (let i = 0; i < rounds; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await probeWorkerHealth(port, 1000)) return true;
    }
    return false;
  })();

  inFlightStartByPort.set(port, startPromise);
  try {
    return await startPromise;
  } finally {
    if (inFlightStartByPort.get(port) === startPromise) {
      inFlightStartByPort.delete(port);
    }
  }
}

function extractTargetProfileId({ urlPath, params, body }) {
  if (
    Array.isArray(params) &&
    params[1] &&
    /^\/api\/profiles\/([^/]+)\/(open|launch|close|cdp)$/.test(urlPath)
  ) {
    try {
      return decodeURIComponent(params[1]);
    } catch {
      return String(params[1]);
    }
  }
  if (body && typeof body === "object") {
    const candidate = body.profileId ?? body.id ?? body.payload?.profileId;
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  return "";
}

function shouldOffloadAgentRequestToWorker({
  apiPort,
  agentSmoke,
  method,
  urlPath,
  params,
  body,
  sessionManager,
}) {
  if (process.env.STEALTH_ENABLE_SPLIT_WORKER_6004 !== "1") return false;
  if (!agentSmoke) return false;
  if (process.env.STEALTH_AGENT_WORKER === "1") return false;
  if (Number(apiPort) !== 6003) return false;

  // Read-only /api/profiles list queries are served directly by :6003 local SQLite WAL so UI/agent
  // catalog lookups never stall behind :6004 worker startup or browser launches.
  const isGetOffloadRoute =
    method === "GET" &&
    /^\/api\/profiles\/[^/]+\/cdp$/.test(urlPath);
  if (method !== "POST" && !isGetOffloadRoute) return false;

  const isOffloadRoute =
    isGetOffloadRoute ||
    urlPath === "/api/profiles/open" ||
    urlPath === "/api/automation/open-url" ||
    urlPath === "/api/jobs" ||
    /^\/api\/profiles\/[^/]+\/(open|launch|close|cdp)$/.test(urlPath);

  if (!isOffloadRoute) return false;

  // Standing order guard (2026-10-22): never offload a profile that is already open on :6003
  // (especially User Headed profiles). Let :6003 handle it via its deferred-user-headed queue.
  const targetProfileId = extractTargetProfileId({ urlPath, params, body });
  if (targetProfileId && sessionManager) {
    try {
      const existing =
        typeof sessionManager.getSession === "function"
          ? sessionManager.getSession(targetProfileId)
          : sessionManager.sessions?.get?.(targetProfileId);
      if (existing) return false;
    } catch {
      /* ignore lookup failure */
    }
  }
  return true;
}

function proxyRequestToWorker({ req, res, urlPath, query, body, port = DEFAULT_WORKER_PORT }) {
  return new Promise((resolve) => {
    const qs = query && query.toString() ? `?${query.toString()}` : "";
    const isGet = String(req.method || "").toUpperCase() === "GET";
    const payload = isGet ? "" : JSON.stringify(body || {});
    const headers = {
      "X-Stealth-Agent-Smoke": "1",
      ...(isGet
        ? {}
        : {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          }),
    };
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    if (req.headers["x-api-token"]) headers["X-Api-Token"] = req.headers["x-api-token"];
    const forwardedCaller =
      req.headers["x-stealth-caller-id"] ||
      req.headers["x-agent-caller"] ||
      req.headers["x-daemon-id"];
    if (forwardedCaller) headers["X-Stealth-Caller-Id"] = String(forwardedCaller);

    const proxyReq = http.request(
      {
        hostname: WORKER_HOST,
        port,
        path: `${urlPath}${qs}`,
        method: req.method || "POST",
        headers,
        timeout: 45000,
      },
      (proxyRes) => {
        let respBody = "";
        proxyRes.on("data", (chunk) => (respBody += chunk));
        proxyRes.on("end", () => {
          const status = proxyRes.statusCode || 200;
          if (status >= 500) {
            workerHealthyCacheByPort.set(port, { ok: false, checkedAt: Date.now() });
            resolve(false);
            return;
          }
          try {
            res.writeHead(status, {
              "Content-Type": proxyRes.headers["content-type"] || "application/json",
              "Access-Control-Allow-Origin": "*",
              "X-Stealth-Offloaded-Worker": String(port),
            });
            res.end(respBody);
            resolve(true);
          } catch {
            resolve(false);
          }
        });
      },
    );

    proxyReq.on("timeout", () => {
      proxyReq.destroy();
      resolve(false);
    });
    proxyReq.on("error", () => {
      workerHealthyCacheByPort.set(port, { ok: false, checkedAt: Date.now() });
      resolve(false);
    });

    if (!isGet && payload) {
      proxyReq.write(payload);
    }
    proxyReq.end();
  });
}

module.exports = {
  DEFAULT_WORKER_PORT,
  probeWorkerHealth,
  ensureAgentWorkerDaemonRunning,
  shouldOffloadAgentRequestToWorker,
  proxyRequestToWorker,
};
