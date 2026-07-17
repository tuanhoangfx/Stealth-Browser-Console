#!/usr/bin/env node
/**
 * Compare P0003 profile browser codes vs P0020 vault Gmail rows.
 *
 * Usage:
 *   node scripts/audit-vault-browser-gap.cjs
 *   node scripts/audit-vault-browser-gap.cjs 0350 0064
 *   node scripts/audit-vault-browser-gap.cjs --from=340 --to=360
 *   node scripts/audit-vault-browser-gap.cjs --sample=100
 *   node scripts/audit-vault-browser-gap.cjs --all
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { diagnoseMailCredentials, normalizeBrowserCode } = require("../electron/lib/twofa-vault-bridge.cjs");
const { extractProfileCode } = require("../electron/lib/profile-identity.cjs");

function argNum(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number.parseInt(hit.slice(name.length + 3), 10) : fallback;
}

function defaultDbPath() {
  for (const rel of [
    path.join("stealth-browser-console", "data", "stealth-console.db"),
    path.join("stealth-browser-console-dev", "data", "stealth-console.db"),
  ]) {
    const p = path.join(os.homedir(), "AppData", "Roaming", rel);
    if (fs.existsSync(p)) return p;
  }
  return path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console", "data", "stealth-console.db");
}

async function loadProfiles(dbPath) {
  const initSqlJs = require("sql.js/dist/sql-wasm.js");
  const wasmPath = path.join(path.dirname(require.resolve("sql.js/package.json")), "dist", "sql-wasm.wasm");
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
  const result = db.exec("SELECT id, name FROM profiles ORDER BY name");
  db.close();
  const rows = result[0]?.values || [];
  return rows.map(([id, name]) => ({
    id: String(id),
    name: String(name),
    code: normalizeBrowserCode(extractProfileCode(String(name), String(id))),
  }));
}

function filterCodes(profiles) {
  const explicit = process.argv.filter((a) => /^\d{3,4}$/.test(a));
  if (explicit.length) {
    return explicit.map((c) => normalizeBrowserCode(c));
  }
  const from = argNum("from", NaN);
  const to = argNum("to", NaN);
  if (Number.isFinite(from) && Number.isFinite(to)) {
    const codes = new Set();
    for (const p of profiles) {
      const n = Number.parseInt(String(p.code).replace(/\D/g, ""), 10);
      if (Number.isFinite(n) && n >= from && n <= to) codes.add(p.code);
    }
    return [...codes].sort();
  }
  if (process.argv.includes("--all")) {
    return [...new Set(profiles.map((p) => p.code))].sort();
  }
  const sampleSize = argNum("sample", 100);
  const unique = [...new Set(profiles.map((p) => p.code))].sort();
  if (unique.length <= sampleSize) return unique;
  const picked = [];
  for (let i = 0; i < sampleSize; i += 1) {
    picked.push(unique[Math.floor((i * unique.length) / sampleSize)]);
  }
  return [...new Set(picked)].sort();
}

async function main() {
  const dbPath = process.argv.find((a) => a.endsWith(".db")) || defaultDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error("DB not found:", dbPath);
    process.exit(1);
  }

  const profiles = await loadProfiles(dbPath);
  const codes = filterCodes(profiles);
  const { resolveVaultConfig } = require("../electron/lib/twofa-vault-bridge.cjs");
  const vault = resolveVaultConfig();
  console.log(
    JSON.stringify(
      { dbPath, profileCount: profiles.length, checking: codes.length, vault: { source: vault.source, url: vault.url } },
      null,
      2,
    ),
  );

  const gaps = [];
  const ok = [];

  for (const code of codes) {
    const diagnosis = await diagnoseMailCredentials(code, "Gmail");
    const profile = profiles.find((p) => p.code === code);
    const row = {
      code,
      profileName: profile?.name || null,
      ok: diagnosis.ok,
      reason: diagnosis.reason,
      otherServices: diagnosis.otherServices,
    };
    if (diagnosis.ok) ok.push(row);
    else gaps.push(row);
  }

  console.log(
    JSON.stringify(
      {
        summary: { checked: codes.length, withGmail: ok.length, missingGmail: gaps.length },
        gaps,
        sampleOk: ok.slice(0, 3),
      },
      null,
      2,
    ),
  );

  if (gaps.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
