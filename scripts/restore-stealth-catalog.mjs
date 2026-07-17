#!/usr/bin/env node
/**
 * Restore stealth-console.db from the newest healthy backup (prod userData by default).
 * Use after accidental DB rotate left only "Stealth Demo".
 *
 *   node scripts/restore-stealth-catalog.mjs
 *   node scripts/restore-stealth-catalog.mjs --dry-run
 *   node scripts/restore-stealth-catalog.mjs --backup "C:\\...\\stealth-console.db.corrupt.*.bak"
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { closeStealthProdOnly } from "./lib/close-stealth-prod-only.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { PROD_DIR, DEV_DIR, roamingAppData } = require("../electron/lib/user-data-root.cjs");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const keepRunning = args.has("--keep-running");
const backupArg = process.argv.find((arg) => arg.startsWith("--backup="))?.slice("--backup=".length);

function resolveUserData() {
  if (process.env.STEALTH_USER_DATA) return process.env.STEALTH_USER_DATA;
  if (args.has("--dev")) return path.join(roamingAppData(), DEV_DIR);
  return path.join(roamingAppData(), PROD_DIR);
}

async function openSql(dbPath) {
  const initSqlJs = require("sql.js/dist/sql-wasm.js");
  const wasmPath = path.join(path.dirname(require.resolve("sql.js/package.json")), "dist", "sql-wasm.wasm");
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  return new SQL.Database(fs.readFileSync(dbPath));
}

async function probeDb(dbPath) {
  if (!fs.existsSync(dbPath)) return null;
  try {
    const db = await openSql(dbPath);
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

function listBackupCandidates(dataDir) {
  if (!fs.existsSync(dataDir)) return [];
  return fs
    .readdirSync(dataDir)
    .filter((name) => {
      if (!name.startsWith("stealth-console.db")) return false;
      if (name === "stealth-console.db") return false;
      return /\.(bak|backup)/i.test(name) || name.includes(".corrupt.") || name.includes(".repair.") || name.includes(".pre-seed.");
    })
    .map((name) => path.join(dataDir, name));
}

async function pickBestBackup(dataDir, explicit) {
  if (explicit) {
    const resolved = explicit.includes("*")
      ? listBackupCandidates(dataDir)
          .filter((p) => path.basename(p).includes(explicit.replace(/\*/g, "")))
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
      : path.resolve(explicit);
    return resolved ? probeDb(resolved) : null;
  }

  const candidates = listBackupCandidates(dataDir);
  const probed = [];
  for (const candidate of candidates) {
    const row = await probeDb(candidate);
    if (row) probed.push(row);
  }
  probed.sort((a, b) => {
    if (b.profiles !== a.profiles) return b.profiles - a.profiles;
    return b.mtimeMs - a.mtimeMs;
  });
  return probed.find((row) => row.integrityOk && row.profiles > 1) ?? probed[0] ?? null;
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

async function main() {
  const userData = resolveUserData();
  const dataDir = path.join(userData, "data");
  const dbFile = path.join(dataDir, "stealth-console.db");
  const current = await probeDb(dbFile);
  const best = await pickBestBackup(dataDir, backupArg);

  console.log(
    JSON.stringify(
      {
        userData,
        current,
        selectedBackup: best,
        dryRun,
      },
      null,
      2,
    ),
  );

  if (!best?.integrityOk || best.profiles <= 1) {
    throw new Error("No healthy backup with more than 1 profile found");
  }
  if (current && current.profiles >= best.profiles) {
    console.log("restore-stealth-catalog: current catalog already >= backup — skip");
    return;
  }

  if (dryRun) return;

  if (!keepRunning) {
    const closed = closeStealthProdOnly({ allowKill: true });
    if (closed?.killed) {
      console.log(`restore-stealth-catalog: closed ${closed.killed} packaged instance(s)`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (fs.existsSync(dbFile)) {
    const tinyBackup = `${dbFile}.before-restore.${stamp}.bak`;
    fs.copyFileSync(dbFile, tinyBackup);
    console.log(`restore-stealth-catalog: saved current DB → ${path.basename(tinyBackup)}`);
  }

  fs.copyFileSync(best.path, dbFile);
  removeWalSidecars(dbFile);

  const verify = await probeDb(dbFile);
  if (!verify?.integrityOk || verify.profiles <= 1) {
    throw new Error(`Restore verification failed: ${JSON.stringify(verify)}`);
  }

  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const { pinKnownGoodCatalogCopy } = require("../electron/lib/catalog-known-good.cjs");
    pinKnownGoodCatalogCopy(userData, verify.profiles);
  } catch {
    /* optional */
  }

  console.log(
    `restore-stealth-catalog: restored ${verify.profiles} profiles (${verify.bytes} bytes) from ${path.basename(best.path)}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
