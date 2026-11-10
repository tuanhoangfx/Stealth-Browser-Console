"use strict";
/**
 * Standalone Headless Agent Worker Daemon (`:6004`)
 *
 * Runs completely isolated from the user's interactive Desktop UI process (`:6003`),
 * using `ELECTRON_RUN_AS_NODE=1` with `Stealth Browser Console.exe` so `better-sqlite3`
 * runs in incremental WAL mode with zero GUI/BrowserWindow/GPU overhead.
 *
 * All agent headless sessions (`X-Stealth-Agent-Smoke: 1` / `agentTask: true`) execute
 * in this worker process so agent automation never blocks or lags the user's desktop app.
 */
const fs = require("node:fs");
const path = require("node:path");

if (process.env.STEALTH_ENABLE_SPLIT_WORKER_6004 !== "1") {
  process.exit(0);
}

try {
  const { ensureHiddenConsoleOnWin32 } = require("../../../scripts/lib/ensure-hidden-console.cjs");
  if (typeof ensureHiddenConsoleOnWin32 === "function") {
    ensureHiddenConsoleOnWin32();
  }
} catch {
  /* ignore if helper not found */
}

const PROD_RESOURCES = path.join(
  process.env.LOCALAPPDATA || "C:\\Users\\CzP\\AppData\\Local",
  "Programs",
  "stealth-browser-console",
  "resources",
);
const UNPACKED_NM = path.join(PROD_RESOURCES, "app.asar.unpacked", "node_modules");
const WORKSPACE_NM = path.resolve(__dirname, "..", "node_modules");

const Module = require("node:module");
const extraPaths = [UNPACKED_NM, WORKSPACE_NM].filter((p) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
});
if (extraPaths.length > 0) {
  const sep = process.platform === "win32" ? ";" : ":";
  const cur = process.env.NODE_PATH ? process.env.NODE_PATH.split(sep) : [];
  for (const p of extraPaths) {
    if (!cur.includes(p)) cur.unshift(p);
  }
  process.env.NODE_PATH = cur.join(sep);
  Module._initPaths();
}

require("../electron/lib/ensure-packaged-module-paths.cjs");

const { resolveStealthUserDataRoot } = require("../electron/lib/user-data-root.cjs");
const { openDatabase, closeDatabase } = require("../electron/db/init.cjs");
const profileService = require("../electron/db/profile-service.cjs");
const { SessionManager } = require("../electron/engine/session-manager.cjs");
const { startApiServer } = require("../electron/api-server.cjs");
const {
  warmCookieBridgeStoreCache,
} = require("../electron/lib/cookie-bridge-store.cjs");
const { getBinaryInfoCached } = require("../electron/engine/cloak-browser-engine.cjs");
const { startAgentWorkerMemoryGuard } = require("../electron/lib/agent-worker-memory-guard.cjs");

const WORKER_PORT = Number(process.env.STEALTH_AGENT_WORKER_PORT || process.env.STEALTH_API_PORT || 6004);
process.env.STEALTH_API_PORT = String(WORKER_PORT);
process.env.STEALTH_DEV_ISOLATED = "1";
process.env.STEALTH_AGENT_WORKER = "1";
process.env.STEALTH_AGENT_SMOKE = "1";
process.env.STEALTH_HEADLESS_SMOKE = "1";

async function main() {
  const userDataRoot = resolveStealthUserDataRoot({ packaged: false });
  process.env.STEALTH_USER_DATA = userDataRoot;

  // Seed isolated worker catalog (`stealth-browser-console-dev/data/stealth-console.db`)
  // from Prod's `stealth-console.db.known-good.bak` so :6004 has the full 7,116-profile catalog
  // while NEVER opening or locking Prod's active SQLite WAL (`stealth-browser-console/data/stealth-console.db`).
  try {
    const prodRoot = path.join(path.dirname(userDataRoot), "stealth-browser-console");
    const prodKnownGood = path.join(prodRoot, "data", "stealth-console.db.known-good.bak");
    const prodDb = path.join(prodRoot, "data", "stealth-console.db");
    const srcDb = fs.existsSync(prodKnownGood) ? prodKnownGood : prodDb;
    const workerDataDir = path.join(userDataRoot, "data");
    const workerDb = path.join(workerDataDir, "stealth-console.db");
    fs.mkdirSync(workerDataDir, { recursive: true });
    if (fs.existsSync(srcDb)) {
      const srcSize = fs.statSync(srcDb).size;
      const dstSize = fs.existsSync(workerDb) ? fs.statSync(workerDb).size : 0;
      if (dstSize < srcSize * 0.5) {
        for (const suf of ["-wal", "-shm"]) {
          try {
            if (fs.existsSync(`${workerDb}${suf}`)) fs.unlinkSync(`${workerDb}${suf}`);
          } catch {}
        }
        fs.copyFileSync(srcDb, workerDb);
      }
    }
  } catch {
    /* non-fatal */
  }

  await openDatabase(userDataRoot);
  try {
    // Sync any newly added profiles from Prod's known-good catalog into the worker catalog (read-only attach, zero WAL lock)
    const prodRoot = path.join(path.dirname(userDataRoot), "stealth-browser-console");
    const prodKnownGood = path.join(prodRoot, "data", "stealth-console.db.known-good.bak");
    if (fs.existsSync(prodKnownGood)) {
      const { getDb } = require("../electron/db/init.cjs");
      const db = getDb();
      const escapedPath = prodKnownGood.replace(/'/g, "''");
      db.exec(`ATTACH DATABASE '${escapedPath}' AS prod_kg;`);
      try {
        db.exec(`INSERT OR IGNORE INTO main.profiles SELECT * FROM prod_kg.profiles;`);
      } finally {
        try {
          db.exec(`DETACH DATABASE prod_kg;`);
        } catch {}
      }
    }
  } catch {
    /* non-fatal */
  }
  try {
    profileService.ensureSeedProfiles?.();
  } catch {
    /* ignore */
  }

  const sessionManager = new SessionManager();
  sessionManager.setUserDataRoot(userDataRoot);
  startAgentWorkerMemoryGuard({ sessionManager });

  const server = startApiServer({
    sessionManager,
    profileService,
    userDataRoot,
    port: WORKER_PORT,
  });

  setImmediate(async () => {
    try {
      const info = getBinaryInfoCached();
      const cb = info?.found ? info.binaryPath : null;
      await warmCookieBridgeStoreCache(userDataRoot, cb);
    } catch {
      /* non-fatal */
    }
  });

  const shutdown = () => {
    try {
      server.close();
    } catch {
      /* ignore */
    }
    try {
      closeDatabase();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[StealthAgentWorker] Fatal startup error:", err);
  process.exit(1);
});
