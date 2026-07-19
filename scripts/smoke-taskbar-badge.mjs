/**
 * Live smoke: generate badge ICO + apply Win32 chrome to a running Cloak profile.
 * Usage: node scripts/smoke-taskbar-badge.mjs [userDataDir]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
  ensureBadgeIco,
  applyNativeProfileTaskbarChrome,
  badgeCachePath,
} = require("../electron/lib/profile-taskbar-native.cjs");

function findLiveChromeUserDataDir() {
  try {
    const ps = [
      "Get-CimInstance Win32_Process | Where-Object {",
      "  $_.Name -eq 'chrome.exe' -and $_.CommandLine -match 'stealth-browser-console' -and $_.CommandLine -notmatch '--type='",
      "} | ForEach-Object {",
      "  if ($_.CommandLine -match '--user-data-dir=\"([^\"]+)\"') { $Matches[1] }",
      "  elseif ($_.CommandLine -match '--user-data-dir=(\\S+)') { $Matches[1] }",
      "} | Select-Object -First 1",
    ].join(" ");
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { encoding: "utf8", timeout: 20_000, windowsHide: true },
    );
    const dir = String(out).trim().split(/\r?\n/).filter(Boolean).pop();
    if (dir && fs.existsSync(dir)) return dir;
  } catch {
    /* fall through */
  }
  return "";
}

function findLiveProfileDir() {
  const arg = process.argv[2];
  if (arg && fs.existsSync(arg)) return arg;
  const live = findLiveChromeUserDataDir();
  if (live) return live;
  const roots = [
    path.join(process.env.APPDATA || "", "stealth-browser-console-dev", "profiles"),
    path.join(process.env.APPDATA || "", "stealth-browser-console", "profiles"),
  ];
  for (const base of roots) {
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) {
      const dir = path.join(base, name);
      if (fs.existsSync(path.join(dir, "SingletonLock")) || fs.existsSync(path.join(dir, "lockfile"))) {
        return dir;
      }
    }
  }
  return "";
}

const userDataDir = findLiveProfileDir();
if (!userDataDir) {
  console.error("smoke-taskbar-badge: no live profile found — open a profile first");
  process.exit(2);
}

const code = "0386";
const title = `${code} · smoke`;
const ico = await ensureBadgeIco(code);
const size = fs.statSync(ico).size;
console.log(JSON.stringify({ phase: "ico", path: ico, size, cache: badgeCachePath(code) }, null, 2));
if (size < 200) {
  console.error("smoke-taskbar-badge: ico too small");
  process.exit(1);
}

const result = await applyNativeProfileTaskbarChrome(userDataDir, title, code);
console.log(JSON.stringify({ phase: "apply", userDataDir, result }, null, 2));
if (!result.ok) {
  console.error("smoke-taskbar-badge: FAIL", result.reason);
  process.exit(1);
}
if (result.detail !== "OK_ICON" && result.detail !== "OK_TITLE") {
  console.error("smoke-taskbar-badge: unexpected detail", result.detail);
  process.exit(1);
}
console.log(`smoke-taskbar-badge: PASS (${result.detail})`);
