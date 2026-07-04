const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const { markProfileChromeCleanExit } = require("./profile-chrome-session.cjs");

const CHROME_NAMES = new Set(["chrome.exe", "chromium.exe"]);
const PROFILE_LOCK_FILES = ["SingletonLock", "SingletonCookie", "lockfile", "SingletonSocket", "SingletonBadge"];

function escapePsSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function listChromeProcessesPs(userDataDir) {
  const dir = path.resolve(String(userDataDir));
  const forward = escapePsSingleQuoted(dir.replace(/\\/g, "/"));
  const backslash = escapePsSingleQuoted(dir);
  const profileId = escapePsSingleQuoted(path.basename(dir));
  const rootTag = escapePsSingleQuoted(path.basename(path.resolve(dir, "..", "..")).toLowerCase());
  return [
    `$fwd = [regex]::Escape('${forward}'); $bck = [regex]::Escape('${backslash}')`,
    `$profileId = [regex]::Escape('--stealth-profile-id=${profileId}')`,
    `$rootTag = [regex]::Escape('--stealth-user-data-tag=${rootTag}')`,
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.CommandLine -and ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'chromium.exe') -and",
    "  ((($_.CommandLine -match $profileId) -and ($_.CommandLine -match $rootTag)) -or ($_.CommandLine -match $fwd) -or ($_.CommandLine -match $bck))",
    "} | ForEach-Object { $_.ProcessId }",
  ].join("; ");
}

function listLockOwnerPidsPs(files) {
  const escaped = (files || []).map((file) => `'${escapePsSingleQuoted(path.resolve(String(file)))}'`).join(", ");
  return [
    `$files = @(${escaped}) | Where-Object { $_ -and (Test-Path $_) }`,
    "if (-not $files -or $files.Count -eq 0) { return }",
    "Add-Type @'",
    "using System;",
    "using System.Runtime.InteropServices;",
    "using System.Runtime.InteropServices.ComTypes;",
    "public static class StealthRestartManager {",
    "  public const int CCH_RM_SESSION_KEY = 32;",
    "  public const int CCH_RM_MAX_APP_NAME = 255;",
    "  public const int CCH_RM_MAX_SVC_NAME = 63;",
    "  [StructLayout(LayoutKind.Sequential)]",
    "  public struct RM_UNIQUE_PROCESS { public int dwProcessId; public FILETIME ProcessStartTime; }",
    "  public enum RM_APP_TYPE { RmUnknownApp = 0, RmMainWindow = 1, RmOtherWindow = 2, RmService = 3, RmExplorer = 4, RmConsole = 5, RmCritical = 1000 }",
    "  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]",
    "  public struct RM_PROCESS_INFO {",
    "    public RM_UNIQUE_PROCESS Process;",
    "    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_APP_NAME + 1)] public string strAppName;",
    "    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_SVC_NAME + 1)] public string strServiceShortName;",
    "    public RM_APP_TYPE ApplicationType;",
    "    public uint AppStatus;",
    "    public uint TSSessionId;",
    "    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;",
    "  }",
    "  [DllImport(\"rstrtmgr.dll\", CharSet = CharSet.Unicode)] public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);",
    "  [DllImport(\"rstrtmgr.dll\")] public static extern int RmEndSession(uint pSessionHandle);",
    "  [DllImport(\"rstrtmgr.dll\", CharSet = CharSet.Unicode)] public static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, IntPtr rgApplications, uint nServices, string[] rgsServiceNames);",
    "  [DllImport(\"rstrtmgr.dll\")] public static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);",
    "}",
    "'@",
    "$key = [Guid]::NewGuid().ToString('N').Substring(0, [StealthRestartManager]::CCH_RM_SESSION_KEY)",
    "$handle = 0",
    "$start = [StealthRestartManager]::RmStartSession([ref]$handle, 0, $key)",
    "if ($start -ne 0) { return }",
    "try {",
    "  $register = [StealthRestartManager]::RmRegisterResources($handle, [uint32]$files.Count, $files, 0, [IntPtr]::Zero, 0, $null)",
    "  if ($register -ne 0) { return }",
    "  $needed = [uint32]0; $count = [uint32]0; $reboot = [uint32]0",
    "  $result = [StealthRestartManager]::RmGetList($handle, [ref]$needed, [ref]$count, $null, [ref]$reboot)",
    "  if ($result -eq 234 -and $needed -gt 0) {",
    "    $count = $needed",
    "    $entries = New-Object StealthRestartManager+RM_PROCESS_INFO[] $count",
    "    $result = [StealthRestartManager]::RmGetList($handle, [ref]$needed, [ref]$count, $entries, [ref]$reboot)",
    "    if ($result -eq 0) {",
    "      $entries | ForEach-Object { $_.Process.dwProcessId }",
    "    }",
    "  }",
    "} finally {",
    "  [StealthRestartManager]::RmEndSession($handle) | Out-Null",
    "}",
  ].join("; ");
}

function resolveExistingProfileLockFiles(userDataDir) {
  const root = path.resolve(String(userDataDir || ""));
  return PROFILE_LOCK_FILES
    .map((name) => path.join(root, name))
    .filter((file) => fs.existsSync(file));
}

async function listProfileBrowserPidsByLock(userDataDir) {
  if (!userDataDir || process.platform !== "win32") return [];
  const files = resolveExistingProfileLockFiles(userDataDir);
  if (!files.length) return [];
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", listLockOwnerPidsPs(files)],
      { timeout: 20_000, windowsHide: true },
    );
    return [...new Set(
      String(stdout)
        .split(/\r?\n/)
        .map((line) => Number.parseInt(line.trim(), 10))
        .filter((pid) => Number.isFinite(pid) && pid > 0),
    )];
  } catch {
    return [];
  }
}

async function listProfileBrowserPids(userDataDir) {
  if (!userDataDir || process.platform !== "win32") return [];
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", listChromeProcessesPs(userDataDir)],
      { timeout: 20_000, windowsHide: true },
    );
    const cliPids = String(stdout)
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isFinite(pid) && pid > 0);
    if (cliPids.length) return [...new Set(cliPids)];
    return listProfileBrowserPidsByLock(userDataDir);
  } catch {
    return listProfileBrowserPidsByLock(userDataDir);
  }
}

async function hasProfileBrowserProcess(userDataDir) {
  const { readSidecarPid } = require("./profile-user-data-repair.cjs");
  const sidecar = readSidecarPid(userDataDir);
  if (sidecar?.pid > 0) {
    try {
      process.kill(sidecar.pid, 0);
      return true;
    } catch {
      // PID gone — fall through to full scan
    }
  }
  const pids = await listProfileBrowserPids(userDataDir);
  return pids.length > 0;
}

/**
 * Kill Chrome/CloakBrowser processes still holding a profile user-data-dir.
 */
async function killOrphanProfileBrowser(userDataDir) {
  const pids = await listProfileBrowserPids(userDataDir);
  if (!pids.length) return { killed: 0 };
  markProfileChromeCleanExit(userDataDir);
  if (process.platform !== "win32") return { killed: 0 };

  let killed = 0;
  for (const pid of pids) {
    try {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        timeout: 10_000,
        windowsHide: true,
      });
      killed += 1;
    } catch {
      // process may already be gone
    }
  }
  return { killed };
}

/** Read Chrome DevToolsActivePort from profile dir (attach-over-CDP). */
function readDevToolsActivePort(userDataDir) {
  try {
    const file = path.join(path.resolve(String(userDataDir)), "DevToolsActivePort");
    if (!fs.existsSync(file)) return 0;
    const line = fs.readFileSync(file, "utf8").trim().split(/\r?\n/)[0] || "";
    const port = Number.parseInt(line, 10);
    return Number.isFinite(port) && port > 0 ? port : 0;
  } catch {
    return 0;
  }
}

/** Bring an orphan profile browser window to foreground (no Playwright context). */
async function focusProfileBrowserWindow(userDataDir) {
  if (!userDataDir || process.platform !== "win32") return { ok: false, reason: "unsupported" };
  const dir = path.resolve(String(userDataDir));
  const escaped = escapePsSingleQuoted(dir);
  const script = [
    `$dir = '${escaped}'`,
    "$pids = Get-CimInstance Win32_Process | Where-Object {",
    "  $_.CommandLine -and $_.CommandLine -like ('*' + $dir + '*') -and",
    "  ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'chromium.exe')",
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
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 20_000, windowsHide: true },
    );
    const result = String(stdout).trim().split(/\r?\n/).pop()?.trim();
    if (result === "OK") return { ok: true };
    if (result === "MISSING") return { ok: false, reason: "not-running" };
    return { ok: false, reason: "no-window" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

module.exports = {
  CHROME_NAMES,
  PROFILE_LOCK_FILES,
  listProfileBrowserPids,
  hasProfileBrowserProcess,
  killOrphanProfileBrowser,
  readDevToolsActivePort,
  focusProfileBrowserWindow,
  resolveExistingProfileLockFiles,
};
