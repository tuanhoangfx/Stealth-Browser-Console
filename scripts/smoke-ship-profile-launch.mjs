#!/usr/bin/env node
/**
 * Ship smoke: launch one normal + one proxy profile via packaged API (:6003).
 * Reads proxy from packaged SQLite (list API strips proxy). Does NOT close profiles.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  launchStealthProfile,
  listStealthProfiles,
  stealthHealth,
} from "../../scripts/lib/stealth-browser-client.mjs";

const require = createRequire(import.meta.url);

function resolveDbPath() {
  const env = String(process.env.STEALTH_USER_DATA || "").trim();
  const candidates = [
    env ? path.join(env, "data", "stealth-console.db") : "",
    env ? path.join(env, "stealth-console.db") : "",
    path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console", "data", "stealth-console.db"),
    path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console-dev", "data", "stealth-console.db"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`smoke-ship-profile-launch: stealth.db not found (${candidates.join(", ")})`);
}

function pickFromDb() {
  const dbPath = resolveDbPath();
  let Database = null;
  try {
    Database = require("better-sqlite3");
  } catch {
    Database = null;
  }
  if (Database) {
    try {
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        const normal = db
          .prepare(
            `SELECT id, name, proxy FROM profiles
             WHERE IFNULL(TRIM(proxy), '') = ''
             ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, updated_at DESC
             LIMIT 1`,
          )
          .get();
        const proxy = db
          .prepare(
            `SELECT id, name, proxy FROM profiles
             WHERE IFNULL(TRIM(proxy), '') <> ''
             ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, updated_at DESC
             LIMIT 1`,
          )
          .get();
        return { dbPath, normal, proxy };
      } finally {
        db.close();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!/NODE_MODULE_VERSION|ERR_DLOPEN_FAILED/i.test(msg)) throw error;
      console.warn(`smoke-ship-profile-launch: better-sqlite3 ABI mismatch — sql.js fallback (${msg.slice(0, 80)})`);
    }
  }

  const initSqlJs = require("sql.js");
  // sync-ish: sql.js default export is async factory — use createRequire path below via deasync-less await at caller.
  throw Object.assign(new Error("USE_SQLJS"), { dbPath });
}

async function pickFromDbAsync() {
  try {
    return pickFromDb();
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "USE_SQLJS") throw error;
    const dbPath = error.dbPath || resolveDbPath();
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync(dbPath));
    try {
      const normalRows = db.exec(
        `SELECT id, name, proxy FROM profiles
         WHERE IFNULL(TRIM(proxy), '') = ''
         ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, updated_at DESC
         LIMIT 1`,
      );
      const proxyRows = db.exec(
        `SELECT id, name, proxy FROM profiles
         WHERE IFNULL(TRIM(proxy), '') <> ''
         ORDER BY CASE WHEN status = 'running' THEN 0 ELSE 1 END, updated_at DESC
         LIMIT 1`,
      );
      const toRow = (result) => {
        if (!result?.[0]?.values?.[0]) return null;
        const [id, name, proxy] = result[0].values[0];
        return { id, name, proxy };
      };
      return { dbPath, normal: toRow(normalRows), proxy: toRow(proxyRows) };
    } finally {
      db.close();
    }
  }
}

const health = await stealthHealth();
if (!health?.ok) {
  console.error("smoke-ship-profile-launch: FAIL health", health);
  process.exit(1);
}

const { dbPath, normal, proxy } = await pickFromDbAsync();
if (!normal?.id) {
  console.error("smoke-ship-profile-launch: FAIL no normal profile in", dbPath);
  process.exit(1);
}
if (!proxy?.id) {
  console.error("smoke-ship-profile-launch: FAIL no proxy profile in", dbPath);
  process.exit(1);
}

const live = await listStealthProfiles();
const byId = new Map(live.map((p) => [p.id, p]));
console.log(
  JSON.stringify(
    {
      healthOk: true,
      dbPath,
      normal: {
        id: normal.id,
        name: normal.name,
        running: Boolean(byId.get(normal.id)?.running),
      },
      proxy: {
        id: proxy.id,
        name: proxy.name,
        proxyPreview: String(proxy.proxy || "").slice(0, 48),
        running: Boolean(byId.get(proxy.id)?.running),
      },
    },
    null,
    2,
  ),
);

const normalRes = await launchStealthProfile(normal.id);
if (normalRes?.ok === false) {
  console.error("smoke-ship-profile-launch: FAIL normal launch", normalRes);
  process.exit(1);
}
console.log("smoke-ship-profile-launch: normal launch OK", normal.name || normal.id);

const proxyRes = await launchStealthProfile(proxy.id);
if (proxyRes?.ok === false) {
  console.error("smoke-ship-profile-launch: FAIL proxy launch", proxyRes);
  process.exit(1);
}
console.log("smoke-ship-profile-launch: proxy launch OK", proxy.name || proxy.id);
console.log("smoke-ship-profile-launch: PASS (profiles left running; no close)");
process.exit(0);
