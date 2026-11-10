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

function probeWorkerHealth(port = DEFAULT_WORKER_PORT, timeoutMs = 600) {
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

async function ensureAgentWorkerDaemonRunning(port = DEFAULT_WORKER_PORT) {
  if (process.env.STEALTH_ENABLE_SPLIT_WORKER_6004 !== "1") return false;
  if (await probeWorkerHealth(port, 500)) return true;

  const now = Date.now();
  if (now - lastSpawnAttemptAt < 5000) {
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
    const winShellCandidate = "E:\\Dev\\Tool\\scripts\\lib\\win-shell-env.cjs";
    if (fs.existsSync(winShellCandidate)) {
      const { startHiddenDetachedProcess } = require(winShellCandidate);
      startHiddenDetachedProcess({
        command: exePath,
        args: [scriptPath],
        cwd: path.dirname(scriptPath),
        pidFile: path.join(os.tmpdir(), `stealth-agent-worker-${port}.pid`),
        logFile: path.join(os.tmpdir(), `stealth-agent-worker-${port}.log`),
        env: childEnv,
      });
    } else {
      const child = spawn(exePath, [scriptPath], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: childEnv,
      });
      child.unref();
    }
  } catch {
    return false;
  }

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await probeWorkerHealth(port, 500)) return true;
  }
  return false;
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

  const isGetOffloadRoute =
    method === "GET" &&
    (urlPath === "/api/profiles" || /^\/api\/profiles\/[^/]+(\/cdp)?$/.test(urlPath));
  if (method !== "POST" && !isGetOffloadRoute) return false;

  const isOffloadRoute =
    isGetOffloadRoute ||
    urlPath === "/api/profiles/open" ||
    urlPath === "/api/automation/open-url" ||
    urlPath === "/api/jobs" ||
    /^\/api\/profiles\/[^/]+\/(open|launch|close|cdp)$/.test(urlPath);

  if (!isOffloadRoute) return false;

  // With Dual-Lane Shadow Isolation (%TEMP%/p0003-agent-shadow/<id>), even if the User has
  // this profile open in Headed mode on :6003, Agent requests still offload to :6004 Shadow Lane.
  void params;
  void body;
  void sessionManager;
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
