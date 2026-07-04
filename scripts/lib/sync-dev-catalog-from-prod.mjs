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
  fs.copyFileSync(prodDb, devDb);
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
