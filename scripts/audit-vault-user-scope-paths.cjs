"use strict";

/**
 * Static audit: Stealth → Data Box vault I/O must go through scoped bridge (user_id).
 * Fails if a new REST/supabase path hits twofa_accounts without vault-user-scope / resolveScoped.
 *
 *   node scripts/audit-vault-user-scope-paths.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ALLOW_UNSCOPED = new Set([
  // Historical smoke fixed to use resolveScopedVaultUserId — keep listed only if still raw.
]);

const SCAN_DIRS = ["electron", "scripts", "src"];
const EXT = new Set([".cjs", ".mjs", ".js", ".ts", ".tsx"]);

/** Paths that intentionally touch vault via scoped helpers. */
const SCOPED_MARKERS = [
  "resolveScopedVaultUserId",
  "vault-user-scope",
  "diagnoseMailCredentials",
  "fetchMailCredentials",
  "findGmailAccountsByEmail",
  "findGmailAccountsByBrowser",
  "patchStealthSnapshotByAccountId",
  "user_id",
  ".eq(\"user_id\"",
  "user_id: `eq.",
  "params.set(\"user_id\"",
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "release") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.has(path.extname(name))) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

const hits = [];
for (const dir of SCAN_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const text = fs.readFileSync(file, "utf8");
    if (!/twofa_accounts/.test(text)) continue;
    const relative = rel(file);
    if (ALLOW_UNSCOPED.has(relative)) continue;
    // Bridge itself implements scoping.
    if (relative === "electron/lib/twofa-vault-bridge.cjs") continue;
    if (relative.includes("vault-user-scope")) continue;
    if (relative.endsWith(".test.ts") || relative.endsWith(".test.cjs") || relative.includes(".smoke.")) {
      continue;
    }
    const scoped = SCOPED_MARKERS.some((m) => text.includes(m));
    if (!scoped) {
      hits.push(relative);
    }
  }
}

// P0020 watermark pull is JWT+user_id (separate product) — note only.
const p0020Stealth = path.join(ROOT, "..", "P0020-Data-Box", "src", "features", "twofa", "twofa-cloud-sync.ts");
let p0020Ok = null;
if (fs.existsSync(p0020Stealth)) {
  const text = fs.readFileSync(p0020Stealth, "utf8");
  const fnIdx = text.indexOf("async function fetchTwofaStealthTelemetryDelta");
  const slice = fnIdx >= 0 ? text.slice(fnIdx, fnIdx + 1200) : "";
  p0020Ok = Boolean(slice) && slice.includes('.eq("user_id", userId)');
}

const report = {
  ok: hits.length === 0 && p0020Ok !== false,
  unscopedTwofaHits: hits,
  p0020StealthTelemetryScoped: p0020Ok,
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
