const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

let dbInstance = null;
let sqlDb = null;
let nativeDb = null;
let dbFilePath = null;
let initPromise = null;
let persistTimer = null;
let dbBackend = "unknown";

const PERSIST_DEBOUNCE_MS = 300;

function schemaPath() {
  return path.join(__dirname, "schema.sql");
}

function wasmPath() {
  return path.join(path.dirname(require.resolve("sql.js/package.json")), "dist", "sql-wasm.wasm");
}

function loadBetterSqliteCtor() {
  try {
    return require("better-sqlite3");
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    const isAbiMismatch =
      /NODE_MODULE_VERSION|was compiled against|not a valid Win32 application/i.test(hint);
    if (isAbiMismatch) {
      console.warn(
        `[db] better-sqlite3 ABI mismatch — run: node scripts/ensure-better-sqlite3.mjs (${hint.slice(0, 80)})`,
      );
    } else {
      console.warn(`[db] better-sqlite3 unavailable (${hint.slice(0, 120)}) — using sql.js fallback`);
    }
    return null;
  }
}

/** Additive migration — add device columns to pre-0.2 `profiles` tables. */
function migrateProfilesTable(database) {
  const existing = new Set();
  const pragmaStmt = database.prepare("PRAGMA table_info(profiles)");
  if (typeof pragmaStmt.all === "function") {
    for (const row of pragmaStmt.all()) existing.add(row.name);
  } else {
    try {
      while (pragmaStmt.step()) existing.add(pragmaStmt.getAsObject().name);
    } finally {
      pragmaStmt.free();
    }
  }
  const additions = [
    ["platform", "TEXT DEFAULT 'windows'"],
    ["timezone", "TEXT"],
    ["locale", "TEXT"],
    ["user_agent", "TEXT"],
    ["viewport_w", "INTEGER DEFAULT 0"],
    ["viewport_h", "INTEGER DEFAULT 0"],
    ["color_scheme", "TEXT"],
    ["device_preset", "TEXT DEFAULT 'custom'"],
    ["headless", "INTEGER DEFAULT 0"],
    ["humanize", "INTEGER DEFAULT 1"],
    ["window_mode", "TEXT DEFAULT 'host-maximized'"],
    ["startup_url", "TEXT"],
    ["last_opened_at", "INTEGER"],
    ["extension_overrides", "TEXT"],
  ];
  let addedWindowMode = false;
  for (const [name, decl] of additions) {
    if (!existing.has(name)) {
      database.exec(`ALTER TABLE profiles ADD COLUMN ${name} ${decl}`);
      if (name === "window_mode") addedWindowMode = true;
    }
  }

  if (addedWindowMode || existing.has("window_mode")) {
    database.exec(`
      UPDATE profiles
      SET window_mode = CASE
        WHEN COALESCE(viewport_w, 0) > 0 OR COALESCE(viewport_h, 0) > 0
          OR (device_preset IS NOT NULL AND device_preset != '' AND device_preset != 'custom')
        THEN 'preset-viewport'
        ELSE 'host-maximized'
      END
      WHERE window_mode IS NULL OR window_mode = ''
    `);
  }
}

function backfillEmptyStartupUrls(database) {
  const { DEFAULT_BROWSER_HOME_URL } = require("../lib/browser-home.cjs");
  const flag = database.prepare("SELECT value FROM settings WHERE key = ?").get("startup_url_backfill_v1");
  if (flag?.value === "1") return;
  database
    .prepare(`UPDATE profiles SET startup_url = ? WHERE startup_url IS NULL OR TRIM(startup_url) = ''`)
    .run(DEFAULT_BROWSER_HOME_URL);
  database
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
    .run("startup_url_backfill_v1", "1");
}

const { dropLegacyProfileChromeColumns } = require("./init-drop-legacy-chrome.cjs");

function backfillLastOpenedAt(database) {
  const flag = database.prepare("SELECT value FROM settings WHERE key = ?").get("last_opened_at_backfill_v1");
  if (flag?.value === "1") return;
  database.exec(`
    UPDATE profiles
    SET last_opened_at = CAST((julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER)
    WHERE (last_opened_at IS NULL OR last_opened_at = 0)
      AND updated_at IS NOT NULL
      AND TRIM(updated_at) != ''
  `);
  database
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
    .run("last_opened_at_backfill_v1", "1");
}

function flushSqlJsDatabase() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!sqlDb || !dbFilePath) return;
  const { shouldBlockCatalogShrinkFlush } = require("../lib/catalog-persist-guard.cjs");
  if (shouldBlockCatalogShrinkFlush(sqlDb, dbFilePath)) return;
  const data = sqlDb.export();
  fs.writeFileSync(dbFilePath, Buffer.from(data));
}

function persistSqlJsDatabase() {
  if (!sqlDb || !dbFilePath) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushSqlJsDatabase();
  }, PERSIST_DEBOUNCE_MS);
}

function bindStatement(stmt, params) {
  if (!params.length) return;
  const first = params[0];
  if (first && typeof first === "object" && !Array.isArray(first)) {
    const mapped = {};
    for (const [key, value] of Object.entries(first)) {
      const normalized = key.startsWith("@") || key.startsWith(":") || key.startsWith("$") ? key : `@${key}`;
      mapped[normalized] = value;
    }
    stmt.bind(mapped);
    return;
  }
  stmt.bind(params);
}

function createBetterSqliteAdapter(database) {
  return {
    pragma(sql) {
      database.pragma(sql);
    },
    exec(sql) {
      database.exec(sql);
    },
    prepare(sql) {
      const stmt = database.prepare(sql);
      return {
        all(...params) {
          return stmt.all(...params);
        },
        get(...params) {
          return stmt.get(...params);
        },
        run(...params) {
          return stmt.run(...params);
        },
      };
    },
    close() {
      database.close();
    },
  };
}

function createSqlJsAdapter(database) {
  return {
    pragma() {},
    exec(sql) {
      database.exec(sql);
      persistSqlJsDatabase();
    },
    prepare(sql) {
      return {
        all(...params) {
          const stmt = database.prepare(sql);
          try {
            bindStatement(stmt, params);
            const rows = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally {
            stmt.free();
          }
        },
        get(...params) {
          const rows = this.all(...params);
          return rows[0];
        },
        run(...params) {
          if (params.length === 1 && params[0] && typeof params[0] === "object" && !Array.isArray(params[0])) {
            const stmt = database.prepare(sql);
            try {
              bindStatement(stmt, params);
              stmt.step();
              const changes = database.getRowsModified();
              persistSqlJsDatabase();
              return { changes };
            } finally {
              stmt.free();
            }
          }
          database.run(sql, params);
          const changes = database.getRowsModified();
          persistSqlJsDatabase();
          return { changes };
        },
      };
    },
    close() {
      flushSqlJsDatabase();
      database.close();
    },
  };
}

function removeWalSidecars(filePath) {
  if (!filePath) return;
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${filePath}${suffix}`;
    try {
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    } catch {
      // best-effort
    }
  }
}

/**
 * Rename a broken DB out of the way so the next open creates a clean catalog.
 * Prefer this over opening the same corrupt bytes with sql.js (which still fails on writes).
 */
function rotateCorruptDatabaseFile(filePath, { userDataPath = "" } = {}) {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, reason: "missing" };

  const root = userDataPath || path.dirname(path.dirname(filePath));
  const { trySyncRestoreCatalogIfEmpty } = require("../lib/catalog-backup-recovery.cjs");
  const restored = trySyncRestoreCatalogIfEmpty(root, { currentProfiles: 0 });
  if (restored.restored) {
    return { ok: true, backup: restored.backup, restored: true };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${filePath}.corrupt.${stamp}.bak`;
  try {
    try {
      fs.renameSync(filePath, dest);
    } catch {
      fs.copyFileSync(filePath, dest);
      fs.unlinkSync(filePath);
    }
    removeWalSidecars(filePath);
    console.warn(`[db] rotated corrupt database → ${dest} (fresh DB next open)`);
    return { ok: true, backup: dest };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[db] rotate failed (${message})`);
    return { ok: false, reason: message };
  }
}

function verifyBetterSqliteIntegrity(db) {
  const rows = db.pragma("integrity_check");
  return rows.every((row) => String(row.integrity_check || "").toLowerCase() === "ok");
}

function verifySqlJsIntegrity(database) {
  try {
    const result = database.exec("PRAGMA integrity_check");
    const value = result[0]?.values?.[0]?.[0];
    return String(value || "").toLowerCase() === "ok";
  } catch {
    return false;
  }
}

async function openBetterSqliteDatabase(DatabaseCtor, userDataPath) {
  const dbDir = path.join(userDataPath, "data");
  fs.mkdirSync(dbDir, { recursive: true });
  dbFilePath = path.join(dbDir, "stealth-console.db");

  nativeDb = new DatabaseCtor(dbFilePath);
  nativeDb.pragma("journal_mode = WAL");
  nativeDb.pragma("foreign_keys = ON");
  if (!verifyBetterSqliteIntegrity(nativeDb)) {
    nativeDb.close();
    nativeDb = null;
    throw Object.assign(new Error("database disk image is malformed"), { code: "SQLITE_CORRUPT" });
  }
  nativeDb.exec(fs.readFileSync(schemaPath(), "utf8"));
  migrateProfilesTable(nativeDb);
  dropLegacyProfileChromeColumns(nativeDb);
  backfillEmptyStartupUrls(nativeDb);
  backfillLastOpenedAt(nativeDb);
  if (!verifyBetterSqliteIntegrity(nativeDb)) {
    nativeDb.close();
    nativeDb = null;
    throw Object.assign(new Error("database disk image is malformed"), { code: "SQLITE_CORRUPT" });
  }

  dbBackend = "better-sqlite3";
  console.info("[db] backend=better-sqlite3 (incremental WAL)");
  return createBetterSqliteAdapter(nativeDb);
}

/** Re-export corrupt file via sql.js — fixes SQLITE_CORRUPT for better-sqlite3 open. */
async function repairDatabaseFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, reason: "missing" };
  const BetterSqlite = loadBetterSqliteCtor();
  if (BetterSqlite) {
    try {
      const preRepair = new BetterSqlite(filePath, { readonly: false });
      preRepair.pragma("wal_checkpoint(TRUNCATE)");
      preRepair.close();
    } catch (error) {
      console.warn(
        "[db] pre-repair WAL checkpoint:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  const initSqlJs = require("sql.js/dist/sql-wasm.js");
  const SQL = await initSqlJs({ locateFile: () => wasmPath() });
  const backup = `${filePath}.corrupt.bak`;
  try {
    fs.copyFileSync(filePath, backup);
    const source = new SQL.Database(fs.readFileSync(filePath));
    const rebuilt = source.export();
    source.close();
    fs.writeFileSync(filePath, Buffer.from(rebuilt));
    removeWalSidecars(filePath);
    console.info(`[db] repaired corrupt database — backup ${backup}`);
    return { ok: true, backup };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[db] repair failed (${message}) — keeping backup ${backup}`);
    return { ok: false, reason: message, backup };
  }
}

function isCorruptSqliteError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === "object" ? error.code : "";
  return code === "SQLITE_CORRUPT" || /malformed|database disk image is corrupt/i.test(message);
}

async function openSqlJsDatabase(userDataPath) {
  const initSqlJs = require("sql.js/dist/sql-wasm.js");
  const SQL = await initSqlJs({ locateFile: () => wasmPath() });
  const dbDir = path.join(userDataPath, "data");
  fs.mkdirSync(dbDir, { recursive: true });
  dbFilePath = path.join(dbDir, "stealth-console.db");

  const loadFreshOrRestored = () => {
    if (fs.existsSync(dbFilePath)) {
      sqlDb = new SQL.Database(fs.readFileSync(dbFilePath));
      return;
    }
    sqlDb = new SQL.Database();
  };

  if (fs.existsSync(dbFilePath)) {
    try {
      sqlDb = new SQL.Database(fs.readFileSync(dbFilePath));
      if (!verifySqlJsIntegrity(sqlDb)) {
        sqlDb.close();
        sqlDb = null;
        rotateCorruptDatabaseFile(dbFilePath, { userDataPath });
        loadFreshOrRestored();
      }
    } catch (error) {
      if (sqlDb) {
        try {
          sqlDb.close();
        } catch {
          // ignore
        }
        sqlDb = null;
      }
      if (isCorruptSqliteError(error) || /malformed|corrupt/i.test(String(error))) {
        rotateCorruptDatabaseFile(dbFilePath, { userDataPath });
      } else {
        console.warn("[db] sql.js open failed — starting empty", error);
        rotateCorruptDatabaseFile(dbFilePath, { userDataPath });
      }
      loadFreshOrRestored();
    }
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.exec(fs.readFileSync(schemaPath(), "utf8"));
  migrateProfilesTable(sqlDb);
  dropLegacyProfileChromeColumns(sqlDb);
  backfillEmptyStartupUrls(sqlDb);
  backfillLastOpenedAt(sqlDb);
  flushSqlJsDatabase();

  dbBackend = "sql.js";
  console.info("[db] backend=sql.js (full export on write)");
  return createSqlJsAdapter(sqlDb);
}

async function openDatabase(userDataPath) {
  if (dbInstance) return dbInstance;
  if (!initPromise) {
    initPromise = (async () => {
      const forced = String(process.env.STEALTH_DB_BACKEND || "").toLowerCase();
      if (forced === "sql.js") {
        dbInstance = await openSqlJsDatabase(userDataPath);
        return dbInstance;
      }

      const BetterSqlite = loadBetterSqliteCtor();
      if (BetterSqlite) {
        try {
          dbInstance = await openBetterSqliteDatabase(BetterSqlite, userDataPath);
          return dbInstance;
        } catch (error) {
          if (isCorruptSqliteError(error)) {
            const dbDir = path.join(userDataPath, "data");
            const file = path.join(dbDir, "stealth-console.db");
            const repaired = await repairDatabaseFile(file);
            if (repaired.ok) {
              try {
                dbInstance = await openBetterSqliteDatabase(BetterSqlite, userDataPath);
                return dbInstance;
              } catch (retryError) {
                console.warn("[db] better-sqlite3 retry after repair failed — rotating corrupt DB", retryError);
                rotateCorruptDatabaseFile(file, { userDataPath });
              }
            } else {
              console.warn("[db] sql.js repair failed — rotating corrupt DB");
              rotateCorruptDatabaseFile(file, { userDataPath });
            }
          } else {
            console.warn("[db] better-sqlite3 open failed — falling back to sql.js", error);
          }
        }
      }

      dbInstance = await openSqlJsDatabase(userDataPath);
      return dbInstance;
    })();
  }
  const instance = await initPromise;
  try {
    const row = instance.prepare("SELECT COUNT(*) AS c FROM profiles").get();
    const currentProfiles = Number(row?.c) || 0;
    const { setCatalogProfileBaseline } = require("../lib/catalog-persist-guard.cjs");
    const { pinKnownGoodCatalogCopy } = require("../lib/catalog-known-good.cjs");
    if (currentProfiles <= 1) {
      const { tryAutoRestoreCatalogIfEmpty } = require("../lib/catalog-backup-recovery.cjs");
      const recovery = await tryAutoRestoreCatalogIfEmpty(userDataPath, { currentProfiles });
      if (recovery.restored) {
        closeDatabase();
        return openDatabase(userDataPath);
      }
    } else {
      setCatalogProfileBaseline(currentProfiles);
      if (dbBackend === "better-sqlite3" && nativeDb) {
        nativeDb.pragma("wal_checkpoint(TRUNCATE)");
      }
      pinKnownGoodCatalogCopy(userDataPath, currentProfiles);
    }
  } catch (error) {
    console.warn("[db] catalog recovery probe failed:", error instanceof Error ? error.message : error);
  }
  return instance;
}

function getDb() {
  if (!dbInstance) throw new Error("Database not initialized.");
  return dbInstance;
}

function isDatabaseReady() {
  return Boolean(dbInstance);
}

function getDbBackend() {
  return dbBackend;
}

function getNativeDb() {
  return nativeDb;
}

function flushDatabase() {
  if (dbBackend === "better-sqlite3" && nativeDb) {
    nativeDb.pragma("wal_checkpoint(PASSIVE)");
    return;
  }
  flushSqlJsDatabase();
}

/** Checkpoint WAL into main db file — call on quit and after critical writes (last_opened_at). */
function checkpointDatabase({ truncate = false } = {}) {
  if (dbBackend === "better-sqlite3" && nativeDb) {
    nativeDb.pragma(truncate ? "wal_checkpoint(TRUNCATE)" : "wal_checkpoint(PASSIVE)");
    return;
  }
  flushSqlJsDatabase();
}

function closeDatabase() {
  if (dbInstance) {
    checkpointDatabase({ truncate: true });
    dbInstance.close();
    dbInstance = null;
    sqlDb = null;
    nativeDb = null;
    initPromise = null;
    dbBackend = "unknown";
  }
}

/**
 * Close → repair (or rotate) → reopen.
 * Repair keeps data when possible; rotate starts a clean catalog when repair cannot reopen.
 */
async function recoverCorruptDatabase(userDataPath) {
  const root = String(userDataPath || "").trim();
  if (!root) return { ok: false, reason: "missing-user-data" };
  const file = path.join(root, "data", "stealth-console.db");
  closeDatabase();
  const repaired = await repairDatabaseFile(file);
  if (repaired.ok) {
    try {
      await openDatabase(root);
      return { ok: true, backup: repaired.backup, rotated: false };
    } catch (error) {
      if (!isCorruptSqliteError(error)) throw error;
      console.warn("[db] reopen after repair still corrupt — rotating");
    }
  }
  const { tryAutoRestoreCatalogIfEmpty } = require("../lib/catalog-backup-recovery.cjs");
  const restored = await tryAutoRestoreCatalogIfEmpty(root, { currentProfiles: 0 });
  if (restored.restored) {
    try {
      await openDatabase(root);
      return { ok: true, backup: restored.backup, rotated: false, restored: true };
    } catch (error) {
      console.warn("[db] reopen after catalog restore failed", error);
    }
  }
  const rotated = rotateCorruptDatabaseFile(file, { userDataPath: root });
  if (!rotated.ok) {
    return { ok: false, reason: repaired.reason || rotated.reason || "recover-failed" };
  }
  await openDatabase(root);
  return { ok: true, backup: rotated.backup, rotated: true };
}

function getDbFilePath() {
  return dbFilePath;
}

module.exports = {
  openDatabase,
  getDb,
  getDbFilePath,
  isDatabaseReady,
  closeDatabase,
  flushDatabase,
  checkpointDatabase,
  getDbBackend,
  getNativeDb,
  isCorruptSqliteError,
  recoverCorruptDatabase,
  rotateCorruptDatabaseFile,
};
