/**
 * Copy production catalog (DB + profiles junction) into isolated dev userData
 * so dev UI shows the same profile list and can launch with prod session folders.
 * Safe while packaged app is running — dev reads/writes its own DB copy; profiles are shared read-only via junction.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PROD_DIR, DEV_DIR, roamingAppData } = require("../../electron/lib/user-data-root.cjs");

function rootFor(dirName) {
  return path.join(roamingAppData(), dirName);
}

function countProfiles(dbPath) {
  if (!fs.existsSync(dbPath)) return 0;
  try {
    const initSqlJs = require("sql.js/dist/sql-wasm.js");
    const wasmDir = path.dirname(require.resolve("sql.js/package.json"));
    return (async () => {
      const SQL = await initSqlJs({
        locateFile: (f) => path.join(wasmDir, "dist", f),
      });
      const db = new SQL.Database(fs.readFileSync(dbPath));
      const row = db.exec("SELECT COUNT(*) FROM profiles")[0]?.values[0][0];
      return Number(row) || 0;
    })();
  } catch {
    return 0;
  }
}

async function readLastOpenedMap(dbPath) {
  const map = new Map();
  if (!fs.existsSync(dbPath)) return map;
  try {
    const initSqlJs = require("sql.js/dist/sql-wasm.js");
    const wasmDir = path.dirname(require.resolve("sql.js/package.json"));
    const SQL = await initSqlJs({
      locateFile: (f) => path.join(wasmDir, "dist", f),
    });
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const result = db.exec("SELECT id, last_opened_at FROM profiles WHERE last_opened_at IS NOT NULL AND last_opened_at > 0");
    const rows = result[0]?.values ?? [];
    for (const [id, ts] of rows) {
      const n = Number(ts);
      if (id && Number.isFinite(n) && n > 0) map.set(String(id), n);
    }
    db.close();
  } catch {
    /* best-effort */
  }
  return map;
}

async function mergeLastOpenedMap(dbPath, preserve) {
  if (!preserve?.size || !fs.existsSync(dbPath)) return;
  try {
    const initSqlJs = require("sql.js/dist/sql-wasm.js");
    const wasmDir = path.dirname(require.resolve("sql.js/package.json"));
    const SQL = await initSqlJs({
      locateFile: (f) => path.join(wasmDir, "dist", f),
    });
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const stmt = db.prepare(
      "UPDATE profiles SET last_opened_at = ? WHERE id = ? AND (last_opened_at IS NULL OR last_opened_at < ?)",
    );
    for (const [id, ts] of preserve) {
      stmt.run([ts, id, ts]);
    }
    stmt.free();
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
    db.close();
  } catch (err) {
    console.warn("[sync-dev-catalog] merge last_opened_at:", err instanceof Error ? err.message : err);
  }
}

export async function syncDevCatalogFromProd({ force = false } = {}) {
  const prodRoot = rootFor(PROD_DIR);
  const devRoot = rootFor(DEV_DIR);
  const prodDb = path.join(prodRoot, "data", "stealth-console.db");
  const devDb = path.join(devRoot, "data", "stealth-console.db");
  const prodProfiles = path.join(prodRoot, "profiles");
  const devProfiles = path.join(devRoot, "profiles");

  if (!fs.existsSync(prodDb)) {
    console.warn("[sync-dev-catalog] production DB not found — skip");
    return { ok: false, reason: "no-prod-db" };
  }

  const prodCount = await countProfiles(prodDb);
  const devCount = await countProfiles(devDb);
  if (!force && prodCount > 0 && devCount >= prodCount) {
    console.log(`[sync-dev-catalog] dev already has ${devCount} profiles (prod ${prodCount}) — skip`);
    return { ok: true, skipped: true, prodCount, devCount };
  }

  fs.mkdirSync(path.dirname(devDb), { recursive: true });
  const devLastOpened = await readLastOpenedMap(devDb);
  fs.copyFileSync(prodDb, devDb);
  if (devLastOpened.size) {
    await mergeLastOpenedMap(devDb, devLastOpened);
    console.log(`[sync-dev-catalog] preserved ${devLastOpened.size} dev last_opened_at value(s)`);
  }
  console.log(`[sync-dev-catalog] copied DB → ${devDb} (${prodCount} profiles)`);

  if (fs.existsSync(prodProfiles)) {
    if (fs.existsSync(devProfiles)) {
      const stat = fs.lstatSync(devProfiles);
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        try {
          fs.rmSync(devProfiles, { recursive: true, force: true });
        } catch {
          // junction may need rmdir
          execSync(`cmd /c rmdir "${devProfiles}"`, { stdio: "ignore" });
        }
      }
    }
    execSync(`cmd /c mklink /J "${devProfiles}" "${prodProfiles}"`, { stdio: "inherit" });
    console.log(`[sync-dev-catalog] profiles junction → ${prodProfiles}`);
  }

  return { ok: true, prodCount, devCount: prodCount };
}
