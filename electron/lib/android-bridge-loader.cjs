"use strict";
/**
 * Isolated Node ESM Worker Loader for P0002 Android Stealth Bridge (`ok 3`).
 * Prevents Electron Prod (:6003) from holding a stale in-process Node ESM module graph
 * across `android-stealth-bridge-slices/*.mjs` edits during Zero-Restart Hot-Patch.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const SHARED_KEY = "__p0003AndroidBridgeWorkerState_v1";

function getSharedState() {
  if (!globalThis[SHARED_KEY]) {
    globalThis[SHARED_KEY] = {
      worker: null,
      workerVer: "",
      readyPromise: null,
      pendingCalls: new Map(),
      sseStreams: new Map(),
      exportsList: [],
      mobileVaultRoot: "",
      bridgeFile: "",
    };
  }
  return globalThis[SHARED_KEY];
}

function resolveBridgeFilePath(electronDir) {
  const candidates = [
    "E:/Dev/Tool/P0002-Social-Hub/server/android-stealth-bridge.mjs",
    electronDir ? path.resolve(electronDir, "../../P0002-Social-Hub/server/android-stealth-bridge.mjs") : "",
    path.resolve(__dirname, "../../../P0002-Social-Hub/server/android-stealth-bridge.mjs"),
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function computeAndroidBridgeVersion(bridgeFile) {
  let maxMs = fs.statSync(bridgeFile).mtimeMs;
  let count = 1;
  try {
    const sliceDir = path.join(path.dirname(bridgeFile), "android-stealth-bridge-slices");
    if (fs.existsSync(sliceDir)) {
      for (const f of fs.readdirSync(sliceDir)) {
        if (!f.endsWith(".mjs")) continue;
        count += 1;
        const ms = fs.statSync(path.join(sliceDir, f)).mtimeMs;
        if (ms > maxMs) maxMs = ms;
      }
    }
  } catch {
    /* ignore */
  }
  return `${Math.round(maxMs)}:${count}`;
}

function resolveSystemNodeExecutable() {
  const explicit = String(process.env.P0003_NODE_EXE || "").trim();
  if (explicit && fs.existsSync(explicit)) return { exe: explicit, isElectronNode: false };
  const candidates = [
    "C:\\Program Files\\nodejs\\node.exe",
    "C:\\Program Files (x86)\\nodejs\\node.exe",
    "E:\\Dev\\.tools\\node.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { exe: c, isElectronNode: false };
  }
  const pathEnv = String(process.env.PATH || "");
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, process.platform === "win32" ? "node.exe" : "node");
    if (fs.existsSync(candidate)) return { exe: candidate, isElectronNode: false };
  }
  return { exe: process.execPath, isElectronNode: true };
}

function rejectAllPending(state, reason) {
  for (const [id, pending] of state.pendingCalls.entries()) {
    clearTimeout(pending.timer);
    pending.reject(new Error(reason));
    state.pendingCalls.delete(id);
  }
  for (const [sseId, res] of state.sseStreams.entries()) {
    try {
      if (!res.writableEnded) res.end();
    } catch {
      /* ignore */
    }
    state.sseStreams.delete(sseId);
  }
}

function invalidateAndroidStealthBridgeWorker() {
  const state = getSharedState();
  const prev = state.worker;
  state.worker = null;
  state.workerVer = "";
  state.readyPromise = null;
  rejectAllPending(state, "android_bridge_worker_reloaded");
  if (prev && !prev.killed) {
    try {
      prev.kill();
    } catch {
      /* ignore */
    }
  }
}

async function ensureBridgeWorker(bridgeFile, versionTag) {
  const state = getSharedState();
  if (state.worker && state.workerVer === versionTag && state.readyPromise) {
    await state.readyPromise;
    return state;
  }

  invalidateAndroidStealthBridgeWorker();

  const workerScript = path.join(__dirname, "android-bridge-worker.mjs");
  const { exe, isElectronNode } = resolveSystemNodeExecutable();
  const env = { ...process.env, P0003_ANDROID_BRIDGE_FILE: bridgeFile };
  if (isElectronNode) env.ELECTRON_RUN_AS_NODE = "1";

  const child = spawn(exe, [workerScript], {
    cwd: path.dirname(bridgeFile),
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  state.worker = child;
  state.workerVer = versionTag;
  state.bridgeFile = bridgeFile;

  state.readyPromise = new Promise((resolve, reject) => {
    const bootTimer = setTimeout(() => {
      if (state.worker === child) {
        invalidateAndroidStealthBridgeWorker();
      }
      reject(new Error("android_bridge_worker_boot_timeout"));
    }, 12_000);
    if (typeof bootTimer.unref === "function") bootTimer.unref();

    let settled = false;
    let errTail = "";
    child.stderr?.on("data", (d) => {
      errTail = (errTail + d.toString()).slice(-1200);
    });

    child.on("message", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "ready" && !settled) {
        settled = true;
        clearTimeout(bootTimer);
        state.exportsList = Array.isArray(msg.exports) ? msg.exports : [];
        state.mobileVaultRoot =
          msg.mobileVaultRoot || path.resolve(path.dirname(bridgeFile), "..", "data", "mobile-vault");
        resolve(state);
        return;
      }
      if (msg.type === "result") {
        const pending = state.pendingCalls.get(msg.id);
        if (!pending) return;
        state.pendingCalls.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.ok) pending.resolve(msg.value);
        else pending.reject(new Error(msg.error || "android_bridge_worker_call_failed"));
        return;
      }
      if (msg.type === "sse-head") {
        const res = state.sseStreams.get(msg.sseId);
        if (res && !res.headersSent) {
          res.writeHead(msg.status || 200, msg.headers || {});
        }
        return;
      }
      if (msg.type === "sse-write") {
        const res = state.sseStreams.get(msg.sseId);
        if (res && !res.writableEnded) {
          const data = msg.isB64 ? Buffer.from(msg.chunk || "", "base64") : String(msg.chunk || "");
          res.write(data);
        }
        return;
      }
      if (msg.type === "sse-end" || msg.type === "sse-error") {
        const res = state.sseStreams.get(msg.sseId);
        state.sseStreams.delete(msg.sseId);
        if (res && !res.writableEnded) {
          if (!res.headersSent && msg.type === "sse-error") {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: msg.error || "sse_error" }));
          } else {
            res.end();
          }
        }
      }
    });

    child.on("exit", (code) => {
      if (state.worker === child) {
        state.worker = null;
        state.workerVer = "";
        state.readyPromise = null;
      }
      rejectAllPending(state, `android_bridge_worker_exited:${code}`);
      if (!settled) {
        settled = true;
        clearTimeout(bootTimer);
        reject(new Error(`android_bridge_worker_exited:${code}:${errTail}`));
      }
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(bootTimer);
        reject(err);
      }
    });
  });

  await state.readyPromise;
  return state;
}

async function loadAndroidStealthBridge(electronDir) {
  const bridgeFile = resolveBridgeFilePath(electronDir);
  if (!bridgeFile) return null;
  const versionTag = computeAndroidBridgeVersion(bridgeFile);
  const state = await ensureBridgeWorker(bridgeFile, versionTag);

  const callWorker = (method, args, timeoutMs = 120_000) =>
    new Promise((resolve, reject) => {
      if (!state.worker || !state.worker.connected) {
        return reject(new Error("android_bridge_worker_disconnected"));
      }
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        if (state.pendingCalls.has(id)) {
          state.pendingCalls.delete(id);
          reject(new Error(`android_bridge_call_timeout:${method}`));
        }
      }, timeoutMs);
      if (typeof timer.unref === "function") timer.unref();
      state.pendingCalls.set(id, { resolve, reject, timer });
      state.worker.send({ type: "call", id, method, args });
    });

  const subscribeH264Stream = (req, res, opts = {}) =>
    new Promise((resolve) => {
      if (!state.worker || !state.worker.connected) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "android_bridge_worker_disconnected" }));
        }
        return resolve();
      }
      const sseId = crypto.randomUUID();
      state.sseStreams.set(sseId, res);
      const cleanup = () => {
        if (state.sseStreams.has(sseId)) {
          state.sseStreams.delete(sseId);
          try {
            if (state.worker && state.worker.connected) {
              state.worker.send({ type: "sse-close", sseId });
            }
          } catch {
            /* ignore */
          }
        }
        resolve();
      };
      req?.on?.("close", cleanup);
      res?.on?.("close", cleanup);
      state.worker.send({
        type: "sse-sub",
        sseId,
        method: "subscribeAndroidH264Stream",
        args: [opts],
        url: req?.url || "/",
        headers: req?.headers || {},
      });
    });

  const baseTarget = {
    MOBILE_VAULT_ROOT:
      state.mobileVaultRoot || path.resolve(path.dirname(bridgeFile), "..", "data", "mobile-vault"),
    subscribeAndroidH264Stream: subscribeH264Stream,
  };

  return new Proxy(baseTarget, {
    get(target, prop) {
      if (typeof prop === "symbol") return target[prop];
      if (prop === "then") return undefined;
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      return (...args) => callWorker(String(prop), args);
    },
  });
}

module.exports = {
  loadAndroidStealthBridge,
  invalidateAndroidStealthBridgeWorker,
  computeAndroidBridgeVersion,
};
