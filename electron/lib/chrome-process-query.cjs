/**
 * SSOT — PowerShell WMI fragments for Chrome/Cloak profile process lookup.
 * Root-scoped needles: full --user-data-dir path only (never bare profile UUID).
 *
 * Dev `-dev` profiles may be a junction to prod — Chrome cmdline uses the *resolved*
 * prod path. Needles must include realpath + sibling root alias or attach/focus/badge miss.
 *
 * Custom profilesRoot (e.g. D:\\StealthBrowser\\profiles) keeps an AppData junction for
 * back-compat. Chrome App / PWA shortcuts (--app-id / --source-shortcut) often launch with
 * the *logical* AppData path while Stealth launches with the physical D: path — both must
 * match or ProcessSingleton Error 32 (lock held by an "invisible" orphan).
 */
const fs = require("node:fs");
const path = require("node:path");

const { PROD_DIR, DEV_DIR, roamingAppData } = require("./user-data-root.cjs");

const PROFILE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapePsSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function tryRealpath(dir) {
  try {
    return fs.realpathSync.native(dir);
  } catch {
    try {
      return fs.realpathSync(dir);
    } catch {
      return "";
    }
  }
}

/** Swap stealth-browser-console ↔ stealth-browser-console-dev in a path. */
function siblingStealthRootPath(dir) {
  const resolved = path.resolve(String(dir || ""));
  const sep = path.sep;
  const prodSeg = `${sep}${PROD_DIR}${sep}`;
  const devSeg = `${sep}${DEV_DIR}${sep}`;
  if (resolved.includes(devSeg)) {
    return resolved.split(devSeg).join(prodSeg);
  }
  if (resolved.includes(prodSeg)) {
    return resolved.split(prodSeg).join(devSeg);
  }
  // root itself ends with product folder
  if (resolved.endsWith(`${sep}${DEV_DIR}`) || resolved.endsWith(DEV_DIR)) {
    return resolved.replace(new RegExp(`${DEV_DIR}$`), PROD_DIR);
  }
  if (resolved.endsWith(`${sep}${PROD_DIR}`) || resolved.endsWith(PROD_DIR)) {
    return resolved.replace(new RegExp(`${PROD_DIR}$`), DEV_DIR);
  }
  return "";
}

/**
 * Logical AppData\\{prod|dev}\\profiles\\{uuid} paths (junction sources after D: migrate).
 * @param {string} profileId
 * @returns {string[]}
 */
function logicalAppDataProfileDirs(profileId) {
  const id = String(profileId || "").trim();
  if (!PROFILE_UUID_RE.test(id)) return [];
  const roaming = roamingAppData();
  return [PROD_DIR, DEV_DIR].map((product) => path.join(roaming, product, "profiles", id));
}

/**
 * All path aliases that may appear in Chrome --user-data-dir for this profile.
 * @param {string} userDataDir
 * @returns {string[]}
 */
function expandProfileDirAliases(userDataDir) {
  const out = new Set();
  const add = (d) => {
    const s = String(d || "").trim();
    if (!s) return;
    const resolved = path.resolve(s);
    out.add(resolved);
    const real = tryRealpath(resolved);
    if (real) out.add(path.resolve(real));
  };

  add(userDataDir);
  const sibling = siblingStealthRootPath(userDataDir);
  if (sibling) add(sibling);

  // Reverse junction: physical D:\\...\\profiles\\{uuid} must also match AppData logical path.
  const resolved = path.resolve(String(userDataDir || ""));
  const profileId = path.basename(resolved);
  if (path.basename(path.dirname(resolved)) === "profiles" && PROFILE_UUID_RE.test(profileId)) {
    for (const logical of logicalAppDataProfileDirs(profileId)) {
      add(logical);
    }
  }

  return [...out];
}

function profileDirNeedles(userDataDir) {
  const dirs = expandProfileDirAliases(userDataDir);
  const needles = [];
  for (const dir of dirs) {
    needles.push(escapePsSingleQuoted(dir));
    needles.push(escapePsSingleQuoted(dir.replace(/\\/g, "/")));
  }
  return {
    dir: dirs[0] || path.resolve(String(userDataDir || "")),
    dirs,
    needles,
    /** @deprecated use needles */
    backslash: needles[0] || "",
    /** @deprecated use needles */
    forward: needles[1] || "",
  };
}

function needlesPsArrayLiteral(userDataDir) {
  const { needles } = profileDirNeedles(userDataDir);
  if (!needles.length) return "@()";
  return `@(${needles.map((n) => `'${n}'`).join(", ")})`;
}

/** PIDs for chrome.exe/chromium.exe whose command line contains profile userDataDir. */
function buildProfileBrowserPidsPs(userDataDir) {
  return [
    `$needles = ${needlesPsArrayLiteral(userDataDir)}`,
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $cmd = $_.CommandLine; $name = $_.Name;",
    "  if (-not $cmd) { return $false }",
    "  if ($name -ne 'chrome.exe' -and $name -ne 'chromium.exe') { return $false }",
    "  foreach ($n in $needles) { if ($n -and ($cmd -like ('*' + $n + '*'))) { return $true } }",
    "  return $false",
    "} | ForEach-Object { $_.ProcessId }",
  ].join("\n");
}

/** Focus browser window for a profile dir (root-scoped path needles + realpath aliases). */
function buildFocusProfileWindowPs(userDataDir) {
  return [
    `$needles = ${needlesPsArrayLiteral(userDataDir)}`,
    "$pids = Get-CimInstance Win32_Process | Where-Object {",
    "  $cmd = $_.CommandLine; $name = $_.Name;",
    "  if (-not $cmd) { return $false }",
    "  if ($name -ne 'chrome.exe' -and $name -ne 'chromium.exe') { return $false }",
    "  foreach ($n in $needles) { if ($n -and ($cmd -like ('*' + $n + '*'))) { return $true } }",
    "  return $false",
    "} | Select-Object -ExpandProperty ProcessId",
    "if (-not $pids) { Write-Output 'MISSING'; exit 0 }",
    "Add-Type @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "public class StealthWin32 {",
    "  [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd);",
    "  [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);",
    "}",
    "'@",
    "$focused = $false",
    "foreach ($pid in $pids) {",
    "  $p = Get-Process -Id $pid -ErrorAction SilentlyContinue",
    "  if (-not $p -or $p.MainWindowHandle -eq 0) { continue }",
    "  [StealthWin32]::ShowWindow($p.MainWindowHandle, 9) | Out-Null",
    "  [StealthWin32]::SetForegroundWindow($p.MainWindowHandle) | Out-Null",
    "  $focused = $true",
    "  break",
    "}",
    "if ($focused) { Write-Output 'OK' } else { Write-Output 'NOHWND' }",
  ].join("\n");
}

/** Batch: all live Stealth Cloak main chrome processes (off hot path). */
function buildListLiveCloakWindowsPs({ firstOnly = false } = {}) {
  const lines = [
    "$rows = @()",
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.Name -eq 'chrome.exe' -and $_.CommandLine -match 'stealth-browser-console' -and $_.CommandLine -notmatch '--type='",
    "} | ForEach-Object {",
    "  $dir = $null",
    "  if ($_.CommandLine -match '--user-data-dir=\"([^\"]+)\"') { $dir = $Matches[1] }",
    "  elseif ($_.CommandLine -match '--user-data-dir=(\\S+)') { $dir = $Matches[1] }",
    "  if ($dir) { $rows += [pscustomobject]@{ dir = $dir; pid = $_.ProcessId } }",
    "}",
  ];
  if (firstOnly) {
    lines.push("$rows | Select-Object -First 1 | ConvertTo-Json -Compress");
  } else {
    lines.push("$rows | ConvertTo-Json -Compress");
  }
  return lines.join("\n");
}

module.exports = {
  escapePsSingleQuoted,
  expandProfileDirAliases,
  logicalAppDataProfileDirs,
  siblingStealthRootPath,
  profileDirNeedles,
  buildProfileBrowserPidsPs,
  buildFocusProfileWindowPs,
  buildListLiveCloakWindowsPs,
};
