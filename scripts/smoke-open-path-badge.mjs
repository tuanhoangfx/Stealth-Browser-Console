#!/usr/bin/env node
/** Simulate profile-open badge path on first live Cloak window. */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { listLiveCloakWindows } = require("../electron/lib/list-live-cloak-windows.cjs");
const { extractProfileCode } = require("../electron/lib/profile-code.cjs");
const { formatProfileWindowLabel, scheduleProfileTaskbarBadgeApply } = require("../electron/lib/profile-window-title.cjs");
const { applyNativeProfileTaskbarChromeWithRetry } = require("../electron/lib/profile-taskbar-native.cjs");

async function fetchProfile(id) {
  for (const port of ["http://127.0.0.1:6004", "http://127.0.0.1:6003"]) {
    try {
      const res = await fetch(`${port}/api/profiles`);
      if (!res.ok) continue;
      const json = await res.json();
      const p = (json.profiles || []).find((row) => row.id === id);
      if (p) return { profile: p, port };
    } catch {
      /* next */
    }
  }
  return null;
}

const live = listLiveCloakWindows({ firstOnly: true })[0];
if (!live?.dir) {
  console.error("smoke-open-path-badge: no live profile — open one first");
  process.exit(2);
}

const id = path.basename(live.dir);
const hit = await fetchProfile(id);
const profile = hit?.profile || { id, name: id.slice(0, 4) };
const code = extractProfileCode(profile.name, profile.id);
const label = formatProfileWindowLabel(profile);
let browserPid = Number(live.browserPid) || 0;

console.log(JSON.stringify({ phase: "start", id, code, label, api: hit?.port || null, browserPid }));

const t0 = Date.now();
const result = await applyNativeProfileTaskbarChromeWithRetry(live.dir, label, code, {
  browserPid,
  pidWaitMs: 160,
  hwndWaitMs: 0,
  focusRetry: false,
  retryDelaysMs: [0, 60, 120, 220, 380, 600, 950, 1500, 2300],
});
const ms = Date.now() - t0;

console.log(JSON.stringify({ phase: "open-path", ms, result }, null, 2));

if (result?.ok && result.detail === "OK_ICON") {
  console.log("smoke-open-path-badge: PASS");
  process.exit(0);
}
console.error("smoke-open-path-badge: FAIL", result?.reason || result?.detail);
process.exit(1);
