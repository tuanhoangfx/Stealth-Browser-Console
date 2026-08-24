/**
 * Apply locked taskbar badges to live Stealth Cloak windows.
 * Resolves profile code from API by folder UUID.
 *
 * --missing-only  stamp HWND with WM_GETICON=0 (headed) only
 * --no-focus      do not focus windows while applying
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { applyTaskbarBadgeWithRetry } from "./lib/taskbar-badge-apply-retry.mjs";

const require = createRequire(import.meta.url);
const {
  BADGE_STYLE,
  pruneStaleBadgeCache,
  resolveChromiumExe,
  shouldSkipTaskbarBadge,
} = require("../electron/lib/profile-taskbar-native.cjs");
const { listLiveCloakWindows } = require("../electron/lib/list-live-cloak-windows.cjs");
const { extractProfileCode, isUuidFolderId } = require("../electron/lib/profile-code.cjs");
const { formatProfileWindowLabel } = require("../electron/lib/profile-window-title.cjs");
const { runPowerShellFile } = require("../electron/lib/powershell-exec.cjs");

const noFocus = process.argv.includes("--no-focus");
const missingOnly = process.argv.includes("--missing-only");
const apiArg = process.argv.find((a) => /^https?:\/\//.test(a) || /^http:\/\/127\.0\.0\.1:\d+$/.test(a));
const apiBase = String(apiArg || process.env.STEALTH_API || "http://127.0.0.1:6003").replace(/\/$/, "");

function normDir(dir) {
  return path.normalize(String(dir || "")).replace(/\\/g, "/").toLowerCase();
}

async function fetchProfileMap() {
  const map = new Map();
  for (const port of [apiBase, "http://127.0.0.1:6003", "http://127.0.0.1:6004"]) {
    try {
      const res = await fetch(`${port}/api/profiles`);
      if (!res.ok) continue;
      const json = await res.json();
      for (const p of json.profiles || []) map.set(p.id, p);
      if (map.size) {
        console.log(JSON.stringify({ phase: "api", port, count: map.size }));
        break;
      }
    } catch {
      /* try next */
    }
  }
  return map;
}

function dirKeys(dir) {
  const n = normDir(dir);
  const keys = [n];
  const base = path.basename(n);
  if (base) keys.push(base);
  return keys;
}

async function probeStampedDirs() {
  const ps1 = path.join(path.dirname(fileURLToPath(import.meta.url)), "diagnose-taskbar-hicon.ps1");
  const { stdout } = await runPowerShellFile(ps1, [], { timeout: 60_000 });
  const json = JSON.parse(String(stdout || "").trim());
  const stamped = new Set();
  const missing = new Set();
  for (const row of json.rows || []) {
    const keys = dirKeys(row.dir);
    if (!keys[0]) continue;
    const dest = row.stamped && row.hwnd ? stamped : row.hwnd ? missing : null;
    if (!dest) continue;
    for (const key of keys) dest.add(key);
  }
  return { stamped, missing, chromeMain: json.chromeMain, stampedN: json.stamped, plainN: json.plain };
}

function isOkIcon(result) {
  return Boolean(result?.ok && (result.detail === "OK_ICON" || result.detail === "OK_TITLE"));
}

const pruned = pruneStaleBadgeCache();
console.log(JSON.stringify({ phase: "prune", removed: pruned.removed }));
console.log(JSON.stringify({ phase: "style", BADGE_STYLE, chrome: resolveChromiumExe() || null, missingOnly, noFocus }));

const live = listLiveCloakWindows();
const byId = await fetchProfileMap();
if (!live.length) {
  console.error("apply-all-taskbar-badges: no live Cloak windows");
  process.exit(2);
}

let probe = null;
if (missingOnly) {
  probe = await probeStampedDirs();
  console.log(
    JSON.stringify({
      phase: "probe",
      chromeMain: probe.chromeMain,
      stamped: probe.stampedN,
      plain: probe.plainN,
    }),
  );
}

const jobs = [];
let skipped = 0;

for (const { dir, browserPid: listedPid } of live) {
  const id = path.basename(dir);
  const profile = byId.get(id);
  if (!profile?.name || isUuidFolderId(profile.name)) {
    skipped += 1;
    console.log(JSON.stringify({ id, skipped: true, reason: "catalog-name-required" }));
    continue;
  }
  const code = extractProfileCode(profile.name, profile.id);
  const label = formatProfileWindowLabel(profile);
  if (shouldSkipTaskbarBadge(code)) {
    skipped += 1;
    console.log(JSON.stringify({ id, name: profile.name, code, skipped: true, reason: "agent-pool-or-headless" }));
    continue;
  }
  if (missingOnly && probe) {
    const keys = dirKeys(dir);
    const isStamped = keys.some((key) => probe.stamped.has(key));
    const isMissing = keys.some((key) => probe.missing.has(key));
    if (isStamped || !isMissing) {
      skipped += 1;
      console.log(JSON.stringify({ id, name: profile.name, code, skipped: true, reason: "already-stamped-or-no-hwnd" }));
      continue;
    }
  }
  let browserPid = Number(listedPid) || 0;
  if (!browserPid) {
    try {
      const sidecar = path.join(dir, "stealth-pid.json");
      if (fs.existsSync(sidecar)) {
        browserPid = Number(JSON.parse(fs.readFileSync(sidecar, "utf8")).pid) || 0;
      }
    } catch {
      /* ignore */
    }
  }
  jobs.push({ id, dir, profile, code, label, browserPid });
}

let okIcon = 0;
let failed = 0;

await Promise.all(
  jobs.map(async (job) => {
    const t0 = Date.now();
    const result = await applyTaskbarBadgeWithRetry(job.dir, job.label, job.code, {
      browserPid: job.browserPid,
      focusRetry: !noFocus && !missingOnly,
      retryDelaysMs: missingOnly ? [0, 250, 800] : undefined,
    });
    if (isOkIcon(result)) okIcon += 1;
    else failed += 1;
    console.log(
      JSON.stringify({
        id: job.id,
        name: job.profile.name,
        code: job.code,
        label: job.label,
        style: BADGE_STYLE,
        browserPid: job.browserPid || null,
        ms: Date.now() - t0,
        result,
      }),
    );
  }),
);

console.log(
  JSON.stringify({ phase: "summary", total: live.length, jobs: jobs.length, okIcon, skipped, failed }),
);
console.log(`apply-all-taskbar-badges: done (${live.length}) okIcon=${okIcon} skipped=${skipped} failed=${failed}`);

if (okIcon === 0 && jobs.length > 0) {
  process.exit(1);
}
process.exit(0);
