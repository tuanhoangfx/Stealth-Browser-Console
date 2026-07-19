/**
 * Apply V2 Chromium-base taskbar badges using real profile codes from P0003 API.
 * Usage: node scripts/apply-v2-taskbar-badges.mjs [apiBase]
 */
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  applyNativeProfileTaskbarChrome,
  resolveChromiumExe,
} = require("../electron/lib/profile-taskbar-native.cjs");
const { extractProfileCode } = require("../electron/lib/profile-identity.cjs");
const { formatProfileWindowLabel } = require("../electron/lib/profile-window-title.cjs");

const apiBase = String(process.argv[2] || process.env.STEALTH_API || "http://127.0.0.1:6003").replace(
  /\/$/,
  "",
);

async function fetchRunningProfiles() {
  const url = `${apiBase}/api/profiles?status=running&limit=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`profiles API ${res.status}`);
  const json = await res.json();
  if (!json?.ok || !Array.isArray(json.profiles)) throw new Error("profiles API shape");
  return json.profiles;
}

function profileUserDataDir(profileId) {
  const roots = [
    path.join(process.env.APPDATA || "", "stealth-browser-console", "profiles", profileId),
    path.join(process.env.APPDATA || "", "stealth-browser-console-dev", "profiles", profileId),
  ];
  return roots.find((d) => {
    try {
      return require("node:fs").existsSync(d);
    } catch {
      return false;
    }
  }) || roots[0];
}

const chrome = resolveChromiumExe();
console.log(JSON.stringify({ phase: "chromium", chrome: chrome || null }, null, 2));
if (!chrome) {
  console.warn("apply-v2-taskbar-badges: chromium exe not found under ~/.cloakbrowser — fallback draw");
}

const profiles = await fetchRunningProfiles();
if (!profiles.length) {
  console.error("apply-v2-taskbar-badges: no running profiles");
  process.exit(2);
}

for (const p of profiles) {
  const code = extractProfileCode(p.name, p.id);
  const label = formatProfileWindowLabel(p);
  const dir = profileUserDataDir(p.id);
  const result = await applyNativeProfileTaskbarChrome(dir, label, code);
  console.log(JSON.stringify({ id: p.id, name: p.name, code, label, dir, result }));
}
console.log(`apply-v2-taskbar-badges: done (${profiles.length}) via ${apiBase}`);
