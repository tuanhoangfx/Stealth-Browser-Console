#!/usr/bin/env node
/**
 * Repair corrupt stealth-console.db via sql.js re-export + better-sqlite3 REINDEX.
 *
 * SAFETY: does NOT kill packaged Stealth by default. If :6003 is up → exit 2.
 * Agents must only use profiles 9990–9999 — never kill prod to repair DB.
 *
 *   node scripts/repair-stealth-db.mjs
 *   node scripts/repair-stealth-db.mjs --allow-close-prod   # ops only
 *   node scripts/repair-stealth-db.mjs --dev              # dev userData (stealth-browser-console-dev)
 *   node scripts/repair-stealth-db.mjs --keep-running       # export only; skip REINDEX if locked
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { closeStealthProdOnly } from "./lib/close-stealth-prod-only.mjs";
import { spawnElectronNode } from "./lib/spawn-electron-node.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const allowCloseProd = process.argv.includes("--allow-close-prod");
const keepRunning = process.argv.includes("--keep-running");
const useDev = process.argv.includes("--dev");

const { DEV_DIR, roamingAppData } = require("../electron/lib/user-data-root.cjs");

const userData =
  process.env.STEALTH_USER_DATA ||
  (useDev ? path.join(roamingAppData(), DEV_DIR) : path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console"));
const dbFile = path.join(userData, "data", "stealth-console.db");

function probeApi(port = 6003) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function probeAnyApi() {
  for (const port of [6003, 6004]) {
    if (await probeApi(port)) return port;
  }
  return 0;
}

function reindexNative() {
  const helper = path.join(__dirname, "_repair-reindex-once.cjs");
  fs.writeFileSync(
    helper,
    [
      '"use strict";',
      'const fs = require("node:fs");',
      'const Database = require("better-sqlite3");',
      "const dbFile = process.argv[2];",
      'for (const s of ["-wal", "-shm"]) {',
      "  const p = dbFile + s;",
      '  if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch {}',
      "}",
      "const db = new Database(dbFile);",
      'db.pragma("journal_mode = DELETE");',
      'db.exec("REINDEX");',
      'const integ = db.pragma("integrity_check");',
      'const count = db.prepare("SELECT COUNT(*) AS c FROM profiles").get().c;',
      "db.close();",
      'const ok = integ.length === 1 && String(integ[0].integrity_check).toLowerCase() === "ok";',
      "console.log(JSON.stringify({ ok, count, integ }));",
      "process.exit(ok ? 0 : 1);",
      "",
    ].join("\n"),
    "utf8",
  );
  try {
    const r = spawnElectronNode(helper, [dbFile], { stdio: "pipe" });
    const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
    const line = out.split(/\r?\n/).filter(Boolean).pop() || "{}";
    let parsed = {};
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = { ok: false, raw: line.slice(0, 400) };
    }
    return { status: r.status ?? 1, ...parsed };
  } finally {
    try {
      fs.unlinkSync(helper);
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  if (!fs.existsSync(dbFile)) {
    console.error(`repair-stealth-db: missing ${dbFile}`);
    process.exit(1);
  }

  let apiPort = await probeAnyApi();
  if (apiPort && !keepRunning && !allowCloseProd) {
    console.error(
      JSON.stringify({
        ok: false,
        error: `Stealth API :${apiPort} is running — refuse to repair (would risk live profiles)`,
        hint: "Close Stealth yourself when idle, then re-run. Or use --keep-running for sql.js export only.",
        override: "--allow-close-prod (ops only)",
        userData,
      }),
    );
    process.exit(2);
  }

  if (apiPort && allowCloseProd && !keepRunning) {
    const closeProd = closeStealthProdOnly({ allowKill: true });
    if (closeProd?.killed) {
      console.log(`repair-stealth-db: closed ${closeProd.killed} packaged instance(s) (--allow-close-prod)`);
    }
  }

  const initSqlJs = require("sql.js/dist/sql-wasm.js");
  const wasmPath = path.join(path.dirname(require.resolve("sql.js/package.json")), "dist", "sql-wasm.wasm");
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const backup = `${dbFile}.repair.bak`;
  fs.copyFileSync(dbFile, backup);
  const source = new SQL.Database(fs.readFileSync(dbFile));
  const rebuilt = source.export();
  source.close();
  fs.writeFileSync(dbFile, Buffer.from(rebuilt));
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${dbFile}${suffix}`;
    try {
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    } catch {
      /* ignore */
    }
  }

  const verify = new SQL.Database(fs.readFileSync(dbFile));
  const count = verify.exec("SELECT COUNT(*) FROM profiles")[0]?.values?.[0]?.[0] ?? "?";
  verify.close();

  let reindex = { skipped: true, reason: "api-up-or-locked" };
  apiPort = await probeAnyApi();
  if (!apiPort) {
    reindex = reindexNative();
  } else if (keepRunning) {
    reindex = { skipped: true, reason: "keep-running-skip-reindex" };
    console.warn(`repair-stealth-db: skip REINDEX while API :${apiPort} is up (--keep-running)`);
  }

  console.log(
    JSON.stringify({
      ok: reindex.skipped ? true : reindex.ok === true,
      userData,
      profiles: count,
      bytes: rebuilt.byteLength,
      backup,
      reindex,
    }),
  );
  if (!reindex.skipped && reindex.ok !== true) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
