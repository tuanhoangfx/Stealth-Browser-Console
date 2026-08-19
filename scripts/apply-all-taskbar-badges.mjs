/**
 * Apply locked taskbar badges to every live Stealth Cloak window.
 * Resolves profile code from API by folder UUID.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

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

const noFocus = process.argv.includes("--no-focus");

const apiBase = String(process.argv[2] || process.env.STEALTH_API || "http://127.0.0.1:6003").replace(/\/$/, "");

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

function isOkIcon(result) {
  return Boolean(result?.ok && (result.detail === "OK_ICON" || result.detail === "OK_TITLE"));
}

const pruned = pruneStaleBadgeCache();
console.log(JSON.stringify({ phase: "prune", removed: pruned.removed }));
console.log(JSON.stringify({ phase: "style", BADGE_STYLE, chrome: resolveChromiumExe() || null }));

const live = listLiveCloakWindows();
const byId = await fetchProfileMap();
if (!live.length) {
  console.error("apply-all-taskbar-badges: no live Cloak windows");
  process.exit(2);
}

let okIcon = 0;
let skipped = 0;
let failed = 0;

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
  const t0 = Date.now();
  const result = await applyTaskbarBadgeWithRetry(dir, label, code, {
    browserPid,
    focusRetry: !noFocus,
  });
  if (isOkIcon(result)) okIcon += 1;
  else failed += 1;
  console.log(
    JSON.stringify({
      id,
      name: profile.name,
      code,
      label,
      style: BADGE_STYLE,
      browserPid: browserPid || null,
      ms: Date.now() - t0,
      result,
    }),
  );
}

console.log(
  JSON.stringify({ phase: "summary", total: live.length, okIcon, skipped, failed }),
);
console.log(`apply-all-taskbar-badges: done (${live.length}) okIcon=${okIcon} skipped=${skipped} failed=${failed}`);

if (okIcon === 0 && live.length > skipped) {
  process.exit(1);
}
process.exit(0);
