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
  // Enforce CREATE_NO_WINDOW on all child spawns + hide any inherited Win32 console on direct node.exe runs.
  require("../../scripts/lib/preload-windows-hide.cjs");
  import("../../scripts/lib/ensure-hidden-console.mjs")
    .then((m) => m?.ensureHiddenConsoleOnWin32?.())
    .catch(() => {});
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

if (!process.env.STEALTH_WORKER_MAX_RAM_MB) {
  const totalSysMemMb = Math.round(require("node:os").totalmem() / (1024 * 1024));
  process.env.STEALTH_WORKER_MAX_RAM_MB = String(
    totalSysMemMb >= 98304 ? 12288 : totalSysMemMb >= 49152 ? 8192 : 4096,
  );
}

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

function isPortAlreadyListening(port, timeoutMs = 600) {
  return new Promise((resolve) => {
    const net = require("node:net");
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const done = (listening) => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(listening);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function acquireWorkerSingletonLock(userDataRoot, port) {
  const os = require("node:os");
  const lockDir = path.join(userDataRoot || os.tmpdir(), "data");
  fs.mkdirSync(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, `stealth-agent-worker-${port}.lock`);
  try {
    if (fs.existsSync(lockPath)) {
      const prevPid = Number.parseInt(String(fs.readFileSync(lockPath, "utf8") || "").trim(), 10);
      if (Number.isInteger(prevPid) && prevPid > 0 && prevPid !== process.pid) {
        try {
          process.kill(prevPid, 0);
          return { acquired: false, lockPath, holderPid: prevPid };
        } catch (err) {
          if (err?.code === "EPERM") return { acquired: false, lockPath, holderPid: prevPid };
        }
      }
    }
    fs.writeFileSync(lockPath, `${process.pid}\n`, "utf8");
    return { acquired: true, lockPath, holderPid: process.pid };
  } catch {
    return { acquired: true, lockPath: "", holderPid: process.pid };
  }
}

async function main() {
  const userDataRoot = resolveStealthUserDataRoot({ packaged: false });
  process.env.STEALTH_USER_DATA = userDataRoot;

  if (await isPortAlreadyListening(WORKER_PORT)) {
    console.log(`[StealthAgentWorker] Port ${WORKER_PORT} already active — exiting duplicate spawn.`);
    process.exit(0);
  }
  const lock = acquireWorkerSingletonLock(userDataRoot, WORKER_PORT);
  if (!lock.acquired) {
    // Wait briefly in case lock holder is still initializing HTTP server; if so exit cleanly.
    await new Promise((r) => setTimeout(r, 1500));
    if (await isPortAlreadyListening(WORKER_PORT)) {
      console.log(`[StealthAgentWorker] Holder pid=${lock.holderPid} bound port ${WORKER_PORT} — exiting duplicate spawn.`);
      process.exit(0);
    }
  }

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
  const prodRoot = path.join(path.dirname(userDataRoot), "stealth-browser-console");
  const prodKnownGood = path.join(prodRoot, "data", "stealth-console.db.known-good.bak");
  const mtimeMarkerPath = path.join(userDataRoot, "data", `worker-${WORKER_PORT}-known-good.mtime`);
  let lastSyncedKnownGoodMtimeMs = 0;
  try {
    if (fs.existsSync(mtimeMarkerPath)) {
      lastSyncedKnownGoodMtimeMs = Number(fs.readFileSync(mtimeMarkerPath, "utf8").trim()) || 0;
    }
  } catch {
    /* ignore */
  }
  function syncCatalogFromProdKnownGood() {
    try {
      if (!fs.existsSync(prodKnownGood)) return;
      const st = fs.statSync(prodKnownGood);
      const { getDb } = require("../electron/db/init.cjs");
      const db = getDb();
      const rowCount = Number(db.prepare("SELECT COUNT(*) AS cnt FROM main.profiles").get()?.cnt || 0);
      if (rowCount > 0 && st.mtimeMs <= lastSyncedKnownGoodMtimeMs) return;
      const escapedPath = prodKnownGood.replace(/'/g, "''");
      db.exec(`ATTACH DATABASE '${escapedPath}' AS prod_kg;`);
      try {
        // Delta upsert instead of rewriting all 7k+ rows and 6 indexes on every boot/tick.
        db.exec("BEGIN IMMEDIATE;");
        try {
          db.exec(`
            INSERT INTO main.profiles
            SELECT kg.*
            FROM prod_kg.profiles kg
            WHERE NOT EXISTS (
              SELECT 1 FROM main.profiles cur
              WHERE cur.id = kg.id AND cur.updated_at >= kg.updated_at
            )
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              group_id = excluded.group_id,
              proxy = excluded.proxy,
              static_ip = excluded.static_ip,
              fingerprint_seed = excluded.fingerprint_seed,
              note = excluded.note,
              platform = excluded.platform,
              timezone = excluded.timezone,
              locale = excluded.locale,
              user_agent = excluded.user_agent,
              viewport_w = excluded.viewport_w,
              viewport_h = excluded.viewport_h,
              color_scheme = excluded.color_scheme,
              device_preset = excluded.device_preset,
              headless = excluded.headless,
              humanize = excluded.humanize,
              window_mode = excluded.window_mode,
              startup_url = excluded.startup_url,
              extension_overrides = excluded.extension_overrides,
              updated_at = excluded.updated_at;
          `);
          db.exec("COMMIT;");
        } catch (txErr) {
          try { db.exec("ROLLBACK;"); } catch {}
          throw txErr;
        }
        lastSyncedKnownGoodMtimeMs = st.mtimeMs;
        try {
          fs.writeFileSync(mtimeMarkerPath, String(st.mtimeMs), "utf8");
        } catch {}
      } finally {
        try {
          db.exec(`DETACH DATABASE prod_kg;`);
        } catch {}
      }
    } catch {
      /* non-fatal */
    }
  }
  syncCatalogFromProdKnownGood();
  const catalogSyncTimer = setInterval(syncCatalogFromProdKnownGood, 60_000);
  if (typeof catalogSyncTimer.unref === "function") catalogSyncTimer.unref();
  try {
    profileService.ensureSeedProfiles?.();
  } catch {
    /* ignore */
  }

  const os = require("node:os");
  const totalSysMemMb = Math.round(os.totalmem() / (1024 * 1024));
  const defaultWorkerMaxRamMb = Number(
    process.env.STEALTH_WORKER_MAX_RAM_MB ||
      (totalSysMemMb >= 98304 ? 12288 : totalSysMemMb >= 49152 ? 8192 : 4096),
  );
  const sessionManager = new SessionManager();
  sessionManager.setUserDataRoot(userDataRoot);
  startAgentWorkerMemoryGuard({
    sessionManager,
    maxRamMb: defaultWorkerMaxRamMb,
  });

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
      if (lock?.lockPath && fs.existsSync(lock.lockPath)) fs.unlinkSync(lock.lockPath);
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
