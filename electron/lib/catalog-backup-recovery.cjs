"use strict";

const fs = require("node:fs");
const path = require("node:path");

function listBackupCandidates(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  return fs
    .readdirSync(dataDir)
    .filter((name) => {
      if (!name.startsWith("stealth-console.db")) return false;
      if (name === "stealth-console.db") return false;
      return (
        /\.(bak|backup)/i.test(name) ||
        name.includes(".corrupt.") ||
        name.includes(".repair.") ||
        name.includes(".pre-seed.") ||
        name.includes(".known-good.")
      );
    })
    .map((name) => path.join(dataDir, name));
}

async function probeDb(dbPath, SQL) {
  if (!fs.existsSync(dbPath)) return null;
  try {
    const db = new SQL.Database(fs.readFileSync(dbPath));
    try {
      const integrity = String(db.exec("PRAGMA integrity_check")[0]?.values?.[0]?.[0] || "").toLowerCase();
      const profiles = Number(db.exec("SELECT COUNT(*) FROM profiles")[0]?.values?.[0]?.[0] || 0);
      return {
        path: dbPath,
        bytes: fs.statSync(dbPath).size,
        mtimeMs: fs.statSync(dbPath).mtimeMs,
        integrityOk: integrity === "ok",
        profiles,
      };
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function loadSqlJs() {
  const initSqlJs = require("sql.js/dist/sql-wasm.js");
  const wasmPath = path.join(path.dirname(require.resolve("sql.js/package.json")), "dist", "sql-wasm.wasm");
  return initSqlJs({ locateFile: () => wasmPath });
}

async function pickBestCatalogBackup(dataDir) {
  const SQL = await loadSqlJs();
  const candidates = listBackupCandidates(dataDir);
  const probed = [];
  for (const candidate of candidates) {
    const row = await probeDb(candidate, SQL);
    if (row) probed.push(row);
  }
  probed.sort((a, b) => {
    if (b.profiles !== a.profiles) return b.profiles - a.profiles;
    return b.mtimeMs - a.mtimeMs;
  });
  return probed.find((row) => row.integrityOk && row.profiles > 1) ?? null;
}

/** Sync restore for rotate / seed guards — picks largest healthy backup by size (no async sql.js). */
function trySyncRestoreCatalogIfEmpty(userDataPath, { currentProfiles = 0 } = {}) {
  if (currentProfiles > 1) return { restored: false, reason: "catalog-nonempty" };

  const dataDir = path.join(String(userDataPath), "data");
  const dbFile = path.join(dataDir, "stealth-console.db");
  const knownGood = path.join(dataDir, "stealth-console.db.known-good.bak");

  const candidates = [];
  if (fs.existsSync(knownGood)) {
    const stat = fs.statSync(knownGood);
    candidates.push({ path: knownGood, bytes: stat.size, mtimeMs: stat.mtimeMs, tag: "known-good" });
  }
  for (const candidate of listBackupCandidates(dataDir)) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.size < 512 * 1024) continue;
      candidates.push({ path: candidate, bytes: stat.size, mtimeMs: stat.mtimeMs, tag: "backup" });
    } catch {
      /* skip */
    }
  }
  candidates.sort((a, b) => b.bytes - a.bytes || b.mtimeMs - a.mtimeMs);
  const best = candidates[0];
  if (!best) return { restored: false, reason: "no-healthy-backup" };

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (fs.existsSync(dbFile)) {
    fs.copyFileSync(dbFile, `${dbFile}.before-sync-restore.${stamp}.bak`);
  }
  fs.copyFileSync(best.path, dbFile);
  removeWalSidecars(dbFile);
  console.warn(
    `[catalog-recovery] sync-restored catalog from ${path.basename(best.path)} (${best.bytes} bytes, was ${currentProfiles} profiles)`,
  );
  return { restored: true, backup: best.path, bytes: best.bytes };
}

function removeWalSidecars(dbFile) {
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbFile}${suffix}`;
    try {
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    } catch {
      /* ignore */
    }
  }
}

/**
 * When DB rotate left an empty/tiny catalog, restore the healthiest backup automatically.
 * @returns {Promise<{ restored: boolean, profiles?: number, backup?: string, reason?: string }>}
 */
async function tryAutoRestoreCatalogIfEmpty(userDataPath, { currentProfiles = 0 } = {}) {
  if (currentProfiles > 1) {
    return { restored: false, reason: "catalog-nonempty" };
  }

  const dataDir = path.join(userDataPath, "data");
  const dbFile = path.join(dataDir, "stealth-console.db");
  const best = await pickBestCatalogBackup(dataDir);
  if (!best?.integrityOk || best.profiles <= 1) {
    return { restored: false, reason: "no-healthy-backup" };
  }
  if (currentProfiles >= best.profiles) {
    return { restored: false, reason: "backup-not-better" };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (fs.existsSync(dbFile)) {
    fs.copyFileSync(dbFile, `${dbFile}.before-auto-restore.${stamp}.bak`);
  }
  fs.copyFileSync(best.path, dbFile);
  removeWalSidecars(dbFile);

  const SQL = await loadSqlJs();
  const verify = await probeDb(dbFile, SQL);
  if (!verify?.integrityOk || verify.profiles <= 1) {
    return { restored: false, reason: "verify-failed" };
  }

  console.warn(
    `[catalog-recovery] restored ${verify.profiles} profiles from ${path.basename(best.path)} (was ${currentProfiles})`,
  );
  return { restored: true, profiles: verify.profiles, backup: best.path };
}

module.exports = {
  listBackupCandidates,
  pickBestCatalogBackup,
  tryAutoRestoreCatalogIfEmpty,
  trySyncRestoreCatalogIfEmpty,
};
