/**
 * Seed isolated-dev userData from production — capped subset (not full 5k+ catalog).
 * Keeps prod session folders via junction; small seed cuts SQLITE_CORRUPT / sql.js risk.
 *
 * Env:
 *   STEALTH_DEV_CATALOG_LIMIT=80   (default; 0 = copy full prod DB)
 *   STEALTH_DEV_CATALOG_FULL=1     same as limit 0
 *   force=true                     rewrite even when seed already present
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PROD_DIR, DEV_DIR, roamingAppData } = require("../../electron/lib/user-data-root.cjs");

const DEFAULT_SEED_LIMIT = 80;

function rootFor(dirName) {
  return path.join(roamingAppData(), dirName);
}

function resolveSeedLimit() {
  if (process.env.STEALTH_DEV_CATALOG_FULL === "1") return 0;
  const raw = process.env.STEALTH_DEV_CATALOG_LIMIT;
  if (raw === undefined || raw === "") return DEFAULT_SEED_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_SEED_LIMIT;
  return Math.floor(n);
}

async function openSql(dbPath) {
  const initSqlJs = require("sql.js/dist/sql-wasm.js");
  const wasmDir = path.dirname(require.resolve("sql.js/package.json"));
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(wasmDir, "dist", f),
  });
  return new SQL.Database(fs.readFileSync(dbPath));
}

async function countProfiles(dbPath) {
  if (!fs.existsSync(dbPath)) return 0;
  try {
    const db = await openSql(dbPath);
    try {
      const row = db.exec("SELECT COUNT(*) FROM profiles")[0]?.values[0][0];
      return Number(row) || 0;
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

async function probeIntegrity(dbPath) {
  if (!fs.existsSync(dbPath)) return false;
  try {
    const db = await openSql(dbPath);
    try {
      const value = db.exec("PRAGMA integrity_check")[0]?.values?.[0]?.[0];
      return String(value || "").toLowerCase() === "ok";
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

async function readLastOpenedMap(dbPath) {
  const map = new Map();
  if (!fs.existsSync(dbPath)) return map;
  try {
    const db = await openSql(dbPath);
    try {
      const result = db.exec(
        "SELECT id, last_opened_at FROM profiles WHERE last_opened_at IS NOT NULL AND last_opened_at > 0",
      );
      for (const [id, ts] of result[0]?.values ?? []) {
        const n = Number(ts);
        if (id && Number.isFinite(n) && n > 0) map.set(String(id), n);
      }
    } finally {
      db.close();
    }
  } catch {
    /* best-effort */
  }
  return map;
}

async function mergeLastOpenedMap(dbPath, preserve) {
  if (!preserve?.size || !fs.existsSync(dbPath)) return;
  try {
    const db = await openSql(dbPath);
    try {
      const stmt = db.prepare(
        "UPDATE profiles SET last_opened_at = ? WHERE id = ? AND (last_opened_at IS NULL OR last_opened_at < ?)",
      );
      for (const [id, ts] of preserve) {
        stmt.run([ts, id, ts]);
      }
      stmt.free();
      fs.writeFileSync(dbPath, Buffer.from(db.export()));
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn("[sync-dev-catalog] merge last_opened_at:", err instanceof Error ? err.message : err);
  }
}

/**
 * Always re-export via sql.js (never raw copyFile of live WAL DB).
 * Raw copy of prod stealth-console.db while WAL is active → SQLITE_CORRUPT on open.
 */
async function writeSeededDevDb(prodDb, destDb, limit) {
  const db = await openSql(prodDb);
  try {
    if (limit > 0) {
      db.run("CREATE TEMP TABLE seed_ids (id TEXT PRIMARY KEY)");
      const insert = db.prepare("INSERT INTO seed_ids (id) VALUES (?)");
      const rows =
        db.exec(
          `SELECT id FROM profiles ORDER BY COALESCE(last_opened_at, 0) DESC, updated_at DESC LIMIT ${limit}`,
        )[0]?.values ?? [];
      for (const [id] of rows) insert.run([String(id)]);
      insert.free();
      db.run("DELETE FROM profiles WHERE id NOT IN (SELECT id FROM seed_ids)");
      try {
        db.run("DELETE FROM runs WHERE profile_id NOT IN (SELECT id FROM seed_ids)");
      } catch {
        /* optional */
      }
      try {
        db.run("DELETE FROM profile_events WHERE profile_id NOT IN (SELECT id FROM seed_ids)");
      } catch {
        /* optional */
      }
      db.run("DROP TABLE seed_ids");
    }
    fs.writeFileSync(destDb, Buffer.from(db.export()));
  } finally {
    db.close();
  }
}

function ensureProfilesJunction(prodProfiles, devProfiles) {
  if (!fs.existsSync(prodProfiles)) return;
  if (fs.existsSync(devProfiles)) {
    const stat = fs.lstatSync(devProfiles);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      try {
        fs.rmSync(devProfiles, { recursive: true, force: true });
      } catch {
        execSync(`cmd /c rmdir "${devProfiles}"`, { stdio: "ignore" });
      }
    }
  }
  execSync(`cmd /c mklink /J "${devProfiles}" "${prodProfiles}"`, { stdio: "inherit" });
  console.log(`[sync-dev-catalog] profiles junction → ${prodProfiles}`);
}

export async function syncDevCatalogFromProd({ force = false } = {}) {
  const prodRoot = rootFor(PROD_DIR);
  const devRoot = rootFor(DEV_DIR);
  const prodDb = path.join(prodRoot, "data", "stealth-console.db");
  const devDb = path.join(devRoot, "data", "stealth-console.db");
  const prodProfiles = path.join(prodRoot, "profiles");
  const devProfiles = path.join(devRoot, "profiles");
  const limit = resolveSeedLimit();

  if (!fs.existsSync(prodDb)) {
    console.warn("[sync-dev-catalog] production DB not found — skip");
    return { ok: false, reason: "no-prod-db" };
  }

  const prodCount = await countProfiles(prodDb);
  const devCount = await countProfiles(devDb);
  const target = limit > 0 ? Math.min(limit, prodCount) : prodCount;
  const healthy = await probeIntegrity(devDb);

  // Skip when dev already has enough profiles (never down-seed a full catalog back to limit).
  const skipOk =
    !force &&
    healthy &&
    prodCount > 0 &&
    (limit <= 0
      ? devCount >= prodCount
      : devCount >= Math.min(target, prodCount));

  if (skipOk) {
    console.log(
      `[sync-dev-catalog] seed ok (${devCount} profiles, limit=${limit || "full"}, prod ${prodCount}) — skip`,
    );
    return { ok: true, skipped: true, prodCount, devCount, limit };
  }

  if (!healthy && fs.existsSync(devDb)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const bak = `${devDb}.pre-seed.${stamp}.bak`;
    try {
      fs.renameSync(devDb, bak);
    } catch {
      fs.copyFileSync(devDb, bak);
      fs.unlinkSync(devDb);
    }
    console.warn(`[sync-dev-catalog] corrupt Dev DB moved → ${bak}`);
  }

  fs.mkdirSync(path.dirname(devDb), { recursive: true });
  const preserveLastOpened = fs.existsSync(devDb) ? await readLastOpenedMap(devDb) : new Map();
  await writeSeededDevDb(prodDb, devDb, limit);
  if (preserveLastOpened.size) {
    await mergeLastOpenedMap(devDb, preserveLastOpened);
    console.log(`[sync-dev-catalog] preserved ${preserveLastOpened.size} dev last_opened_at value(s)`);
  }
  const seeded = await countProfiles(devDb);
  console.log(
    `[sync-dev-catalog] seeded DB → ${devDb} (${seeded} profiles, limit=${limit || "full"}, prod ${prodCount})`,
  );

  ensureProfilesJunction(prodProfiles, devProfiles);

  return { ok: true, prodCount, devCount: seeded, limit };
}
