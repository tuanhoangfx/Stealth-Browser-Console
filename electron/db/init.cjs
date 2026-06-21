const fs = require("node:fs");
const path = require("node:path");

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
    const Database = require("better-sqlite3");
    const probe = new Database(":memory:");
    probe.close();
    return Database;
  } catch (error) {
    const hint = error instanceof Error ? error.message : String(error);
    const isAbiMismatch =
      /NODE_MODULE_VERSION|was compiled against|not a valid Win32 application/i.test(hint);
    if (isAbiMismatch) {
      console.warn(
        `[db] better-sqlite3 ABI mismatch — run: pnpm exec electron-rebuild -f -w better-sqlite3 (${hint.slice(0, 80)})`,
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
    ["show_profile_badge", "INTEGER DEFAULT 0"],
    ["profile_tab_groups", "INTEGER DEFAULT 0"],
    ["tab_group_color", "TEXT"],
    ["last_opened_at", "INTEGER"],
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

function disableInPageProfileChrome(database) {
  const flag = database.prepare("SELECT value FROM settings WHERE key = ?").get("profile_chrome_ui_off_v1");
  if (flag?.value === "1") return;
  database.exec(`UPDATE profiles SET show_profile_badge = 0, profile_tab_groups = 0`);
  database
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
    .run("profile_chrome_ui_off_v1", "1");
}

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

async function openBetterSqliteDatabase(DatabaseCtor, userDataPath) {
  const dbDir = path.join(userDataPath, "data");
  fs.mkdirSync(dbDir, { recursive: true });
  dbFilePath = path.join(dbDir, "stealth-console.db");

  nativeDb = new DatabaseCtor(dbFilePath);
  nativeDb.pragma("journal_mode = WAL");
  nativeDb.pragma("foreign_keys = ON");
  nativeDb.exec(fs.readFileSync(schemaPath(), "utf8"));
  migrateProfilesTable(nativeDb);
  disableInPageProfileChrome(nativeDb);
  backfillEmptyStartupUrls(nativeDb);
  backfillLastOpenedAt(nativeDb);

  dbBackend = "better-sqlite3";
  console.info("[db] backend=better-sqlite3 (incremental WAL)");
  return createBetterSqliteAdapter(nativeDb);
}

async function openSqlJsDatabase(userDataPath) {
  const initSqlJs = require("sql.js/dist/sql-wasm.js");
  const SQL = await initSqlJs({ locateFile: () => wasmPath() });
  const dbDir = path.join(userDataPath, "data");
  fs.mkdirSync(dbDir, { recursive: true });
  dbFilePath = path.join(dbDir, "stealth-console.db");

  if (fs.existsSync(dbFilePath)) {
    sqlDb = new SQL.Database(fs.readFileSync(dbFilePath));
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.exec(fs.readFileSync(schemaPath(), "utf8"));
  migrateProfilesTable(sqlDb);
  disableInPageProfileChrome(sqlDb);
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

      const BetterSqlite = forced === "better-sqlite3" ? loadBetterSqliteCtor() : loadBetterSqliteCtor();
      if (BetterSqlite) {
        try {
          dbInstance = await openBetterSqliteDatabase(BetterSqlite, userDataPath);
          return dbInstance;
        } catch (error) {
          console.warn("[db] better-sqlite3 open failed — falling back to sql.js", error);
        }
      }

      dbInstance = await openSqlJsDatabase(userDataPath);
      return dbInstance;
    })();
  }
  return initPromise;
}

function getDb() {
  if (!dbInstance) throw new Error("Database not initialized.");
  return dbInstance;
}

function flushDatabase() {
  if (dbBackend === "better-sqlite3" && nativeDb) {
    nativeDb.pragma("wal_checkpoint(PASSIVE)");
    return;
  }
  flushSqlJsDatabase();
}

function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    sqlDb = null;
    nativeDb = null;
    initPromise = null;
    dbBackend = "unknown";
  }
}

module.exports = {
  openDatabase,
  getDb,
  closeDatabase,
  flushDatabase,
};
