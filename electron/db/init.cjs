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

const PERSIST_DEBOUNCE_MS = 1500;

function schemaPath() {
  return path.join(__dirname, "schema.sql");
}

function bootPhase(userDataPath, phase) {
  if (!process.versions.electron || !userDataPath) return;
  try {
    const { writeBootLog } = require("../lib/shutdown-log.cjs");
    const { app } = require("electron");
    writeBootLog(userDataPath, {
      phase,
      version: app.getVersion(),
      packaged: app.isPackaged,
    });
  } catch {
    /* boot log is diagnostic only */
  }
}

function unpackedNodeModulesRoot() {
  if (typeof process.resourcesPath === "string" && process.resourcesPath) {
    const candidate = path.join(process.resourcesPath, "app.asar.unpacked", "node_modules");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function wasmPath() {
  try {
    return path.join(path.dirname(require.resolve("sql.js/package.json")), "dist", "sql-wasm.wasm");
  } catch {
    const unpackedNm = unpackedNodeModulesRoot();
    if (unpackedNm) {
      return path.join(unpackedNm, "sql.js", "dist", "sql-wasm.wasm");
    }
    throw new Error("sql.js/dist/sql-wasm.wasm not found");
  }
}

function loadSqlJsInit() {
  try {
    return require("sql.js/dist/sql-wasm.js");
  } catch (err) {
    const unpackedNm = unpackedNodeModulesRoot();
    if (unpackedNm) {
      const fallback = path.join(unpackedNm, "sql.js", "dist", "sql-wasm.js");
      if (fs.existsSync(fallback)) return require(fallback);
    }
    throw err;
  }
}

function resolveBetterSqliteNativeBinding() {
  const unpackedNm = unpackedNodeModulesRoot();
  if (unpackedNm) {
    const candidate = path.join(unpackedNm, "better-sqlite3", "build", "Release", "better_sqlite3.node");
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function createNodeSqliteDatabaseSyncCtor() {
  try {
    const { DatabaseSync } = require("node:sqlite");
    if (typeof DatabaseSync !== "function") return null;
    return class NodeSqliteCompatDatabase {
      constructor(filePath, options = {}) {
        this._db = new DatabaseSync(filePath, {
          timeout: Number(options.timeout) || 5000,
          readOnly: Boolean(options.readonly),
        });
      }
      pragma(sql) {
        const trimmed = String(sql || "").trim();
        if (/=|\(/.test(trimmed)) {
          this._db.exec(`PRAGMA ${trimmed}`);
          return [];
        }
        return this._db.prepare(`PRAGMA ${trimmed}`).all();
      }
      exec(sql) {
        this._db.exec(sql);
      }
      transaction(fn) {
        return (...args) => {
          this._db.exec("BEGIN");
          try {
            const res = fn(...args);
            this._db.exec("COMMIT");
            return res;
          } catch (err) {
            try {
              this._db.exec("ROLLBACK");
            } catch {
              /* ignore */
            }
            throw err;
          }
        };
      }
      prepare(sql) {
        const stmt = this._db.prepare(sql);
        if (typeof stmt.setAllowBareNamedParameters === "function") {
          stmt.setAllowBareNamedParameters(true);
        }
        return {
          all: (...params) => stmt.all(...params),
          get: (...params) => stmt.get(...params),
          run: (...params) => stmt.run(...params),
        };
      }
      close() {
        this._db.close();
      }
    };
  } catch {
    return null;
  }
}

function loadBetterSqliteCtor() {
  try {
    return require("better-sqlite3");
  } catch (error) {
    const unpackedNm = unpackedNodeModulesRoot();
    if (unpackedNm) {
      const unpackedPkg = path.join(unpackedNm, "better-sqlite3");
      if (fs.existsSync(unpackedPkg)) {
        try {
          return require(unpackedPkg);
        } catch {
          /* fall through to node:sqlite or warning */
        }
      }
    }
    const nodeSqliteCtor = createNodeSqliteDatabaseSyncCtor();
    if (nodeSqliteCtor) {
      return nodeSqliteCtor;
    }
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
    ["static_ip", "INTEGER DEFAULT 0"],
  ];
  let addedWindowMode = false;
  for (const [name, decl] of additions) {
    if (!existing.has(name)) {
      database.exec(`ALTER TABLE profiles ADD COLUMN ${name} ${decl}`);
      if (name === "window_mode") addedWindowMode = true;
    }
  }

  let hasWindowModeBackfill = false;
  try {
    const flagStmt = database.prepare("SELECT value FROM settings WHERE key = 'window_mode_backfill_v1'");
    if (typeof flagStmt.get === "function") {
      hasWindowModeBackfill = flagStmt.get()?.value === "1";
    }
  } catch {
    /* settings table may not have flag yet */
  }

  if (addedWindowMode || (!hasWindowModeBackfill && existing.has("window_mode"))) {
    database.exec(`
      UPDATE profiles
      SET window_mode = CASE
        WHEN COALESCE(viewport_w, 0) > 0 OR COALESCE(viewport_h, 0) > 0
          OR (device_preset IS NOT NULL AND device_preset != '' AND device_preset != 'custom')
        THEN 'preset-viewport'
        ELSE 'host-maximized'
      END
      WHERE window_mode IS NULL OR window_mode = '';
      INSERT OR REPLACE INTO settings (key, value) VALUES ('window_mode_backfill_v1', '1');
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

function resetProfilesDefaultIpV1(database) {
  const flag = database.prepare("SELECT value FROM settings WHERE key = ?").get("reset_all_profiles_default_ip_v1");
  if (flag?.value === "1") return;
  const now = new Date().toISOString();
  database
    .prepare(
      `UPDATE profiles
          SET proxy = NULL,
              static_ip = 0,
              timezone = NULL,
              locale = NULL,
              device_preset = 'custom',
              platform = 'windows',
              viewport_w = 0,
              viewport_h = 0,
              window_mode = 'host-maximized',
              color_scheme = NULL,
              user_agent = NULL,
              note = NULLIF(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(note, ''), '[pin-proxy]', ''), '[static-ip]', ''), '[vpn:US]', ''), 'Muse US Proxy', ''), 'Local IP', '')), ''),
              updated_at = ?`,
    )
    .run(now);
  database
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
    .run("reset_all_profiles_default_ip_v1", "1");
}

function flushSqlJsDatabase() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (!sqlDb || !dbFilePath) return;
  // Never overwrite a WAL-mode database owned by better-sqlite3 — doing so corrupts the main DB file relative to -wal/-shm.
  if (fs.existsSync(`${dbFilePath}-wal`) || fs.existsSync(`${dbFilePath}-shm`)) return;
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
  function healAndRetry(sql, method, params) {
    let stmt = database.prepare(sql);
    try {
      return stmt[method](...params);
    } catch (err) {
      if (isCorruptSqliteError(err) && tryInPlaceSqliteIndexAndEventsRepair(database)) {
        stmt = database.prepare(sql);
        return stmt[method](...params);
      }
      throw err;
    }
  }
  return {
    pragma(sql) {
      database.pragma(sql);
    },
    exec(sql) {
      try {
        database.exec(sql);
      } catch (err) {
        if (isCorruptSqliteError(err) && tryInPlaceSqliteIndexAndEventsRepair(database)) {
          database.exec(sql);
          return;
        }
        throw err;
      }
    },
    transaction(fn) {
      return database.transaction(fn);
    },
    prepare(sql) {
      let stmt = null;
      try {
        stmt = database.prepare(sql);
      } catch (err) {
        if (isCorruptSqliteError(err) && tryInPlaceSqliteIndexAndEventsRepair(database)) {
          stmt = database.prepare(sql);
        } else {
          throw err;
        }
      }
      return {
        all(...params) {
          try {
            return stmt.all(...params);
          } catch (err) {
            return healAndRetry(sql, "all", params);
          }
        },
        get(...params) {
          try {
            return stmt.get(...params);
          } catch (err) {
            return healAndRetry(sql, "get", params);
          }
        },
        run(...params) {
          try {
            return stmt.run(...params);
          } catch (err) {
            return healAndRetry(sql, "run", params);
          }
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
    transaction(fn) {
      return (...args) => {
        database.exec("BEGIN");
        try {
          const res = fn(...args);
          database.exec("COMMIT");
          persistSqlJsDatabase();
          return res;
        } catch (err) {
          try {
            database.exec("ROLLBACK");
          } catch {
            /* ignore */
          }
          throw err;
        }
      };
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
  const rows = db.pragma("quick_check");
  return rows.every((row) => String(row.quick_check || row.integrity_check || "").toLowerCase() === "ok");
}

function ensureProfileEventsNoForeignKey(db) {
  try {
    const row = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'profile_events'")
      .get();
    const ddl = String(row?.sql || "");
    if (!/FOREIGN\s+KEY/i.test(ddl)) return false;
    try {
      db.pragma?.("foreign_keys = OFF");
    } catch {
      /* ignore */
    }
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS profile_events_nofk (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        level TEXT DEFAULT 'info',
        message TEXT,
        created_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO profile_events_nofk (id, profile_id, event_type, level, message, created_at)
        SELECT id, profile_id, event_type, level, message, created_at
        FROM profile_events;
      DROP TABLE profile_events;
      ALTER TABLE profile_events_nofk RENAME TO profile_events;
      CREATE INDEX IF NOT EXISTS idx_profile_events_profile_created ON profile_events(profile_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_profile_events_created_at ON profile_events(created_at DESC);
      COMMIT;
    `);
    try {
      db.pragma?.("foreign_keys = ON");
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* ignore */
    }
    try {
      db.pragma?.("foreign_keys = ON");
    } catch {
      /* ignore */
    }
    return false;
  }
}

function pruneProfileEventsRetention(db, retentionDays = 30) {
  try {
    ensureProfileEventsNoForeignKey(db);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_profile_events_created_at ON profile_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_profile_events_profile_created ON profile_events(profile_id, created_at DESC);
    `);
    const days = Math.max(7, Math.floor(Number(retentionDays) || 30));
    const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString();
    db.prepare("DELETE FROM profile_events WHERE created_at < ?").run(cutoffIso);
    db.exec(`
      DELETE FROM profile_events
      WHERE rowid NOT IN (
        SELECT rowid FROM profile_events ORDER BY created_at DESC LIMIT 5000
      );
      DELETE FROM runs
      WHERE status != 'running'
        AND rowid NOT IN (
          SELECT rowid FROM runs ORDER BY started_at DESC LIMIT 500
        );
    `);
    db.pragma("optimize");
  } catch {
    /* best effort retention prune */
  }
}

function verifySqlJsIntegrity(database) {
  try {
    const result = database.exec("PRAGMA quick_check");
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

  bootPhase(userDataPath, "db-construct");
  const nativeBinding = resolveBetterSqliteNativeBinding();
  nativeDb = new DatabaseCtor(dbFilePath, {
    timeout: 15000,
    ...(nativeBinding ? { nativeBinding } : {}),
  });
  bootPhase(userDataPath, "db-constructed");
  nativeDb.pragma("busy_timeout = 15000");
  nativeDb.pragma("journal_mode = WAL");
  nativeDb.pragma("synchronous = NORMAL");
  nativeDb.pragma("temp_store = MEMORY");
  nativeDb.pragma("cache_size = -65536");
  nativeDb.pragma("mmap_size = 268435456");
  nativeDb.pragma("wal_autocheckpoint = 4000");
  nativeDb.pragma("journal_size_limit = 67108864");
  nativeDb.pragma("foreign_keys = ON");
  bootPhase(userDataPath, "db-wal");
  if (process.env.STEALTH_AGENT_WORKER === "1") {
    if (!verifyBetterSqliteIntegrity(nativeDb)) {
      tryInPlaceSqliteIndexAndEventsRepair(nativeDb);
    }
    pruneProfileEventsRetention(nativeDb, 365);
    dbBackend = "better-sqlite3";
    console.info("[db] backend=better-sqlite3 (agent worker shared WAL)");
    return createBetterSqliteAdapter(nativeDb);
  }
  let repairedOnOpen = false;
  if (!verifyBetterSqliteIntegrity(nativeDb)) {
    repairedOnOpen = true;
    tryInPlaceSqliteIndexAndEventsRepair(nativeDb);
    if (!verifyBetterSqliteIntegrity(nativeDb)) {
      nativeDb.close();
      nativeDb = null;
      throw Object.assign(new Error("database disk image is malformed"), { code: "SQLITE_CORRUPT" });
    }
  }
  nativeDb.exec(fs.readFileSync(schemaPath(), "utf8"));
  migrateProfilesTable(nativeDb);
  dropLegacyProfileChromeColumns(nativeDb);
  backfillEmptyStartupUrls(nativeDb);
  backfillLastOpenedAt(nativeDb);
  resetProfilesDefaultIpV1(nativeDb);
  pruneProfileEventsRetention(nativeDb, 365);
  if (repairedOnOpen && !verifyBetterSqliteIntegrity(nativeDb)) {
    tryInPlaceSqliteIndexAndEventsRepair(nativeDb);
    if (!verifyBetterSqliteIntegrity(nativeDb)) {
      nativeDb.close();
      nativeDb = null;
      throw Object.assign(new Error("database disk image is malformed"), { code: "SQLITE_CORRUPT" });
    }
  }

  dbBackend = "better-sqlite3";
  bootPhase(userDataPath, "db-native-ready");
  console.info("[db] backend=better-sqlite3 (incremental WAL)");
  return createBetterSqliteAdapter(nativeDb);
}

/**
 * In-place SQLite index & profile_events table repair (`ok 1` hardening).
 * Preserves 100% of `profiles` while rebuilding secondary indexes and trimming/rebuilding `profile_events`.
 */
function tryInPlaceSqliteIndexAndEventsRepair(db) {
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      REINDEX profiles;
      REINDEX profile_groups;
      REINDEX runs;
      REINDEX settings;
      REINDEX stealth_sync_outbox;
      DROP INDEX IF EXISTS idx_profile_events_profile_created;
      DROP INDEX IF EXISTS idx_profile_events_created_at;
      CREATE TABLE IF NOT EXISTS profile_events_clean (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        level TEXT DEFAULT 'info',
        message TEXT,
        created_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO profile_events_clean (id, profile_id, event_type, level, message, created_at)
        SELECT id, profile_id, event_type, level, message, created_at
        FROM (
          SELECT id, profile_id, event_type, level, message, created_at
          FROM profile_events NOT INDEXED
          WHERE id IS NOT NULL AND profile_id IS NOT NULL AND event_type IS NOT NULL AND created_at IS NOT NULL
          LIMIT 50000
        );
      DROP TABLE profile_events;
      ALTER TABLE profile_events_clean RENAME TO profile_events;
      CREATE INDEX IF NOT EXISTS idx_profile_events_profile_created ON profile_events(profile_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_profile_events_created_at ON profile_events(created_at DESC);
      COMMIT;
    `);
    console.info("[db] in-place REINDEX + profile_events repair succeeded");
    return true;
  } catch (error) {
    try {
      db.exec("ROLLBACK;");
    } catch {
      /* ignore */
    }
    console.warn("[db] in-place repair warning:", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Re-export corrupt file via sql.js — fixes SQLITE_CORRUPT for better-sqlite3 open. */
async function repairDatabaseFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { ok: false, reason: "missing" };
  const backup = `${filePath}.corrupt.bak`;
  try {
    fs.copyFileSync(filePath, backup);
  } catch {
    /* best effort */
  }
  const BetterSqlite = loadBetterSqliteCtor();
  if (BetterSqlite) {
    try {
      const nativeBinding = resolveBetterSqliteNativeBinding();
      const preRepair = new BetterSqlite(filePath, {
        readonly: false,
        ...(nativeBinding ? { nativeBinding } : {}),
      });
      tryInPlaceSqliteIndexAndEventsRepair(preRepair);
      const healthy = verifyBetterSqliteIntegrity(preRepair);
      preRepair.pragma("wal_checkpoint(TRUNCATE)");
      preRepair.close();
      if (healthy) {
        console.info(`[db] repaired corrupt database in-place — backup ${backup}`);
        return { ok: true, backup };
      }
    } catch (error) {
      console.warn(
        "[db] pre-repair WAL checkpoint:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  const initSqlJs = loadSqlJsInit();
  const SQL = await initSqlJs({ locateFile: () => wasmPath() });
  try {
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
  const initSqlJs = loadSqlJsInit();
  const SQL = await initSqlJs({ locateFile: () => wasmPath() });
  const dbDir = path.join(userDataPath, "data");
  fs.mkdirSync(dbDir, { recursive: true });
  dbFilePath = path.join(dbDir, "stealth-console.db");

  // If WAL sidecars exist from another active process (:6003 or :6004), checkpoint via node:sqlite first so sql.js never sees torn WAL pages
  if (fs.existsSync(`${dbFilePath}-wal`)) {
    try {
      const NodeSqliteCtor = createNodeSqliteDatabaseSyncCtor();
      if (NodeSqliteCtor) {
        const walSyncDb = new NodeSqliteCtor(dbFilePath, { timeout: 15000 });
        walSyncDb.pragma("wal_checkpoint(PASSIVE)");
        walSyncDb.close();
      }
    } catch {
      /* best effort checkpoint before sql.js read */
    }
  }

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
      if (!verifySqlJsIntegrity(sqlDb) && !fs.existsSync(`${dbFilePath}-wal`)) {
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
      if (!fs.existsSync(`${dbFilePath}-wal`)) {
        rotateCorruptDatabaseFile(dbFilePath, { userDataPath });
      }
      loadFreshOrRestored();
    }
  } else {
    sqlDb = new SQL.Database();
  }

  const adapter = createSqlJsAdapter(sqlDb);
  sqlDb.exec(fs.readFileSync(schemaPath(), "utf8"));
  migrateProfilesTable(sqlDb);
  dropLegacyProfileChromeColumns(sqlDb);
  backfillEmptyStartupUrls(adapter);
  backfillLastOpenedAt(adapter);
  resetProfilesDefaultIpV1(adapter);
  flushSqlJsDatabase();

  dbBackend = "sql.js";
  console.info("[db] backend=sql.js (full export on write)");
  return adapter;
}

function resolveCatalogUserDataPath(userDataPath) {
  const resolved = path.resolve(String(userDataPath || ""));
  const norm = resolved.toLowerCase();
  if (
    process.env.STEALTH_ISOLATE_DEV_DB !== "1" &&
    (norm.endsWith("\\stealth-browser-console-dev") || norm.endsWith("/stealth-browser-console-dev"))
  ) {
    const prodRoot = path.join(path.dirname(resolved), "stealth-browser-console");
    if (fs.existsSync(path.join(prodRoot, "data", "stealth-console.db"))) {
      return prodRoot;
    }
  }
  return userDataPath;
}

async function openDatabase(rawUserDataPath) {
  const userDataPath = resolveCatalogUserDataPath(rawUserDataPath);
  if (dbInstance) return dbInstance;
  if (!initPromise) {
    initPromise = (async () => {
      const forced = String(process.env.STEALTH_DB_BACKEND || "").toLowerCase();
      if (forced === "sql.js") {
        bootPhase(userDataPath, "db-sqljs-forced");
        dbInstance = await openSqlJsDatabase(userDataPath);
        return dbInstance;
      }

      bootPhase(userDataPath, "db-load-native");
      const BetterSqlite = loadBetterSqliteCtor();
      if (!BetterSqlite) bootPhase(userDataPath, "db-native-missing");
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
            const NodeSqliteCtor = createNodeSqliteDatabaseSyncCtor();
            if (NodeSqliteCtor && NodeSqliteCtor !== BetterSqlite) {
              try {
                dbInstance = await openBetterSqliteDatabase(NodeSqliteCtor, userDataPath);
                return dbInstance;
              } catch (nodeSqliteErr) {
                console.warn("[db] node:sqlite fallback failed:", nodeSqliteErr);
              }
            }
            console.warn("[db] better-sqlite3 open failed — falling back to sql.js", error);
          }
        }
      }

      bootPhase(userDataPath, "db-sqljs-fallback");
      dbInstance = await openSqlJsDatabase(userDataPath);
      bootPhase(userDataPath, "db-sqljs-ready");
      return dbInstance;
    })();
  }
  const instance = await initPromise;
  if (process.env.STEALTH_AGENT_WORKER === "1") {
    return instance;
  }
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
        // PASSIVE returns instead of waiting for every reader. TRUNCATE on boot
        // deadlocks when this connection still holds a read lock.
        bootPhase(userDataPath, "db-checkpoint");
        nativeDb.pragma("wal_checkpoint(PASSIVE)");
        bootPhase(userDataPath, "db-checkpoint-done");
        pinKnownGoodCatalogCopy(userDataPath, currentProfiles);
        bootPhase(userDataPath, "db-pin-done");
      }
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
  ensureProfileEventsNoForeignKey,
};
