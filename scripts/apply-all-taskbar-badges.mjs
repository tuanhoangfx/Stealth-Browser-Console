/**
 * Apply v2i PNG-in-ICO badges to every live Stealth Cloak window.
 * Resolves profile code from API by folder UUID (not fake 380x).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const {
  applyNativeProfileTaskbarChrome,
  BADGE_STYLE,
  resolveChromiumExe,
} = require("../electron/lib/profile-taskbar-native.cjs");
const { extractProfileCode } = require("../electron/lib/profile-identity.cjs");
const { formatProfileWindowLabel } = require("../electron/lib/profile-window-title.cjs");

const apiBase = String(process.argv[2] || process.env.STEALTH_API || "http://127.0.0.1:6003").replace(/\/$/, "");

function listLiveUserDataDirs() {
  const ps = [
    "$rows = @()",
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -eq 'chrome.exe' -and $_.CommandLine -match 'stealth-browser-console' -and $_.CommandLine -notmatch '--type='",
    "} | ForEach-Object {",
    "  $dir = $null",
    "  if ($_.CommandLine -match '--user-data-dir=\"([^\"]+)\"') { $dir = $Matches[1] }",
    "  elseif ($_.CommandLine -match '--user-data-dir=(\\S+)') { $dir = $Matches[1] }",
    "  if ($dir) { $rows += [pscustomobject]@{ dir = $dir; pid = $_.ProcessId } }",
    "}",
    "$rows | ConvertTo-Json -Compress",
  ].join("\n");
  const out = execFileSync(
    path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { encoding: "utf8", timeout: 20_000, windowsHide: true },
  );
  const raw = String(out).trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const byDir = new Map();
  for (const row of rows) {
    const dir = String(row?.dir || "").trim();
    const pid = Number(row?.pid) || 0;
    if (!dir) continue;
    if (!byDir.has(dir)) byDir.set(dir, { dir, browserPid: pid });
  }
  return [...byDir.values()];
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

// Drop legacy orb caches so Electron cannot reuse them
const cacheDir = path.join(os.tmpdir(), "stealth-taskbar-badges");
if (fs.existsSync(cacheDir)) {
  for (const name of fs.readdirSync(cacheDir)) {
    if (name.endsWith(".ico") && !name.startsWith(`${BADGE_STYLE}-`)) {
      try {
        fs.unlinkSync(path.join(cacheDir, name));
      } catch {
        /* ignore */
      }
    }
  }
}

console.log(JSON.stringify({ phase: "style", BADGE_STYLE, chrome: resolveChromiumExe() || null }));

const live = listLiveUserDataDirs();
const byId = await fetchProfileMap();
if (!live.length) {
  console.error("apply-all-taskbar-badges: no live Cloak windows");
  process.exit(2);
}

for (const { dir, browserPid: listedPid } of live) {
  const id = path.basename(dir);
  const profile = byId.get(id) || { id, name: id.slice(0, 4) };
  const code = extractProfileCode(profile.name, profile.id);
  const label = formatProfileWindowLabel(profile);
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
  const result = await applyNativeProfileTaskbarChrome(dir, label, code, { browserPid });
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
console.log(`apply-all-taskbar-badges: done (${live.length})`);
