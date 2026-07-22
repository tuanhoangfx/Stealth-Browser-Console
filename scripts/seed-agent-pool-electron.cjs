#!/usr/bin/env node
"use strict";
/**
 * Ensure agent pool profiles 9990–9999 exist (idempotent).
 * MUST run while Stealth is already stopped. Never kill packaged/prod Stealth to force this — agents may only use profiles 9990–9999. Uses Electron ABI:
 *   node scripts/run-electron-node.mjs scripts/seed-agent-pool-electron.cjs
 */
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const Database = require("better-sqlite3");

const NAMES = ["9990", "9991", "9992", "9993", "9994", "9995", "9996", "9997", "9998", "9999"];
const NOTE = "Agent pool — parallel headless smoke (9990–9999); do not use for personal browse";
const dbFile = path.join(
  process.env.STEALTH_USER_DATA || path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console"),
  "data",
  "stealth-console.db",
);

function checkApi(port = 6003) {
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

(async () => {
  if (await checkApi(6003)) {
    console.error(JSON.stringify({ ok: false, error: "Stealth API :6003 is running — close app first, then re-run" }));
    process.exit(2);
  }
  if (!fs.existsSync(dbFile)) {
    console.error(JSON.stringify({ ok: false, error: `missing ${dbFile}` }));
    process.exit(1);
  }
  for (const s of ["-wal", "-shm"]) {
    const p = `${dbFile}${s}`;
    if (fs.existsSync(p)) try { fs.unlinkSync(p); } catch { /* ignore */ }
  }
  const db = new Database(dbFile);
  db.pragma("journal_mode = DELETE");
  db.exec("REINDEX");
  const dups = db
    .prepare(
      `SELECT name, COUNT(*) AS c, GROUP_CONCAT(id) AS ids FROM profiles WHERE name IN (${NAMES.map(() => "?").join(",")}) GROUP BY name HAVING c > 1`,
    )
    .all(...NAMES);
  const del = db.prepare("DELETE FROM profiles WHERE id = ?");
  let deleted = 0;
  for (const row of dups) {
    for (const id of String(row.ids).split(",").slice(1)) {
      del.run(id);
      deleted += 1;
    }
  }
  const existing = new Set(
    db
      .prepare(`SELECT name FROM profiles WHERE name IN (${NAMES.map(() => "?").join(",")})`)
      .all(...NAMES)
      .map((r) => r.name),
  );
  const created = [];
  const now = new Date().toISOString();
  const insert = db.prepare(`INSERT INTO profiles
    (id, name, group_id, proxy, fingerprint_seed, note, status,
     platform, timezone, locale, user_agent, viewport_w, viewport_h, color_scheme, device_preset,
     headless, humanize, window_mode, startup_url, extension_overrides, created_at, updated_at)
    VALUES (?, ?, 'default', null, ?, ?, 'closed',
     'win32', null, null, null, 1280, 720, null, 'desktop',
     0, 1, 'normal', null, null, ?, ?)`);
  for (const name of NAMES) {
    if (existing.has(name)) continue;
    insert.run(randomUUID(), name, Math.floor(Math.random() * 1e9), NOTE, now, now);
    created.push(name);
  }
  db.exec("REINDEX");
  const integ = db.pragma("integrity_check");
  const pool = db
    .prepare("SELECT name FROM profiles WHERE name BETWEEN '9990' AND '9999' ORDER BY name")
    .all()
    .map((r) => r.name);
  const count = db.prepare("SELECT COUNT(*) AS c FROM profiles").get().c;
  db.close();
  const ok = integ.length === 1 && String(integ[0].integrity_check).toLowerCase() === "ok" && pool.length === 10;
  // refresh known-good so recovery keeps pool
  if (ok) {
    try {
      fs.copyFileSync(dbFile, `${dbFile}.known-good.bak`);
    } catch { /* ignore */ }
  }
  console.log(JSON.stringify({ ok, deleted, created, pool, count, integ }, null, 2));
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
  process.exit(1);
});
