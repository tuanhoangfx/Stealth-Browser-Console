"use strict";
/**
 * Dedicated Worker Thread (`ok 1`) for background P0020 disk cookie / LevelDB / DPAPI reconciliation
 * (`reconcileAllProfilesDiskCookiesToP0020`, `healStaleChallengedAndErrorP0020Rows`,
 * `harvestDiskSqliteToEcosystemVaults`, `batchWriteBackAllVaultCookiesToProfilesDisk`).
 *
 * Isolates heavy synchronous Dual-ABI SQLite (`better-sqlite3`), LevelDB scans, and native DPAPI decryption from
 * the Electron main thread and user-interactive browser sessions.
 */
const { isMainThread, parentPort, Worker } = require("node:worker_threads");

if (!isMainThread && parentPort) {
  try {
    require("./ensure-packaged-module-paths.cjs");
  } catch {
    /* dev workspace already resolves packaged deps */
  }
  parentPort.on("message", async (msg) => {
    const { id, task, payload = {} } = msg || {};
    try {
      let result = null;
      if (task === "reconcileAllProfilesDiskCookiesToP0020") {
        const { reconcileAllProfilesDiskCookiesToP0020 } = require("./stealth-multiplatform-sync.cjs");
        result = await reconcileAllProfilesDiskCookiesToP0020({
          baseDir: payload.baseDir,
          sinceHours: payload.sinceHours,
          dryRun: Boolean(payload.dryRun),
          runningCodes: Array.isArray(payload.runningCodes) ? payload.runningCodes : [],
          catalogProfiles: Array.isArray(payload.catalogProfiles) ? payload.catalogProfiles : null,
        });
      } else if (task === "healStaleChallengedAndErrorP0020Rows") {
        const { healStaleChallengedAndErrorP0020Rows } = require("./stealth-multiplatform-sync.cjs");
        result = await healStaleChallengedAndErrorP0020Rows({
          baseDir: payload.baseDir,
          cleanStaleLiveCdp: payload.cleanStaleLiveCdp !== false,
        });
      } else if (task === "harvestDiskSqliteToEcosystemVaults") {
        const { harvestDiskSqliteToEcosystemVaults } = require("./profile-cookie-guard.cjs");
        result = harvestDiskSqliteToEcosystemVaults({
          baseDir: payload.baseDir,
          skipProfileCodes: Array.isArray(payload.skipProfileCodes) ? payload.skipProfileCodes : undefined,
        });
      } else if (task === "batchWriteBackAllVaultCookiesToProfilesDisk") {
        const { batchWriteBackAllVaultCookiesToProfilesDisk } = require("./profile-cookie-guard.cjs");
        result = batchWriteBackAllVaultCookiesToProfilesDisk({
          baseDir: payload.baseDir,
          injectSqlite: Boolean(payload.injectSqlite),
          skipProfileCodes: Array.isArray(payload.skipProfileCodes) ? payload.skipProfileCodes : undefined,
        });
      } else {
        throw new Error(`Unsupported worker task: ${String(task)}`);
      }
      parentPort.postMessage({ id, ok: true, result });
    } catch (error) {
      parentPort.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

let _sharedWorker = null;
let _seq = 0;
const _pending = new Map();

function getOrCreateWorker() {
  if (_sharedWorker) return _sharedWorker;
  const worker = new Worker(__filename);
  worker.on("message", (msg) => {
    const entry = _pending.get(msg?.id);
    if (!entry) return;
    _pending.delete(msg.id);
    if (_pending.size === 0 && typeof worker.unref === "function") worker.unref();
    clearTimeout(entry.timer);
    if (msg.ok) {
      entry.resolve(msg.result);
    } else {
      entry.reject(new Error(msg.error || "Worker task failed"));
    }
  });
  worker.on("error", (err) => {
    for (const [, entry] of _pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    _pending.clear();
    _sharedWorker = null;
  });
  worker.on("exit", () => {
    for (const [, entry] of _pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Worker exited"));
    }
    _pending.clear();
    _sharedWorker = null;
  });
  if (typeof worker.unref === "function") worker.unref();
  _sharedWorker = worker;
  return worker;
}

/**
 * Dispatches a heavy disk/LevelDB/DPAPI task to the background Worker Thread (`ok 1`).
 */
function runP0020ReconcileInWorker(task, payload = {}, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = getOrCreateWorker();
    } catch (err) {
      reject(err);
      return;
    }
    const id = ++_seq;
    const timer = setTimeout(() => {
      _pending.delete(id);
      if (_pending.size === 0 && typeof worker.unref === "function") worker.unref();
      reject(new Error(`Worker task timeout (${task})`));
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();
    _pending.set(id, { resolve, reject, timer });
    if (typeof worker.ref === "function") worker.ref();
    worker.postMessage({ id, task, payload });
  });
}

async function terminateP0020ReconcileWorker() {
  const w = _sharedWorker;
  _sharedWorker = null;
  if (!w) return;
  try {
    await w.terminate();
  } catch {
    /* ignore */
  }
}

module.exports = {
  runP0020ReconcileInWorker,
  terminateP0020ReconcileWorker,
};
