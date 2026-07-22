const fs = require("node:fs");
const path = require("node:path");

const { markProfileChromeCleanExit } = require("./profile-chrome-session.cjs");
const {
  buildProfileBrowserPidsPs,
  buildFocusProfileWindowPs,
  escapePsSingleQuoted,
} = require("./chrome-process-query.cjs");
const { runPowerShellCommandAsync } = require("./powershell-exec.cjs");

const CHROME_NAMES = new Set(["chrome.exe", "chromium.exe"]);
const PROFILE_LOCK_FILES = ["SingletonLock", "SingletonCookie", "lockfile", "SingletonSocket", "SingletonBadge"];
const PID_LIST_CACHE_MS = 2000;
/** @type {Map<string, { pids: number[], at: number }>} */
const pidListCache = new Map();

function listChromeProcessesPs(userDataDir) {
  return buildProfileBrowserPidsPs(userDataDir);
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
  ].join("\n");
}

function resolveExistingProfileLockFiles(userDataDir) {
  const { expandProfileDirAliases } = require("./chrome-process-query.cjs");
  const roots = expandProfileDirAliases(userDataDir);
  const files = [];
  for (const root of roots) {
    for (const name of PROFILE_LOCK_FILES) {
      const file = path.join(root, name);
      if (!fs.existsSync(file)) continue;
      try {
        files.push(fs.realpathSync.native(file));
      } catch {
        try {
          files.push(fs.realpathSync(file));
        } catch {
          files.push(path.resolve(file));
        }
      }
    }
  }
  return [...new Set(files)];
}

async function listProfileBrowserPidsByLock(userDataDir) {
  if (!userDataDir || process.platform !== "win32") return [];
  const files = resolveExistingProfileLockFiles(userDataDir);
  if (!files.length) return [];
  try {
    const stdout = await runPowerShellCommandAsync(listLockOwnerPidsPs(files));
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
  const key = path.resolve(String(userDataDir));
  const cached = pidListCache.get(key);
  if (cached && Date.now() - cached.at < PID_LIST_CACHE_MS) return cached.pids;
  let cliPids = [];
  try {
    const stdout = await runPowerShellCommandAsync(listChromeProcessesPs(userDataDir));
    cliPids = String(stdout)
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isFinite(pid) && pid > 0);
  } catch {
    cliPids = [];
  }
  const lockPids = await listProfileBrowserPidsByLock(userDataDir);
  const pids = [...new Set([...cliPids, ...lockPids])];
  pidListCache.set(key, { pids, at: Date.now() });
  return pids;
}

function invalidateProfileBrowserPidCache(userDataDir) {
  if (!userDataDir) return;
  pidListCache.delete(path.resolve(String(userDataDir)));
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
  invalidateProfileBrowserPidCache(userDataDir);
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
  invalidateProfileBrowserPidCache(userDataDir);
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
  const script = buildFocusProfileWindowPs(userDataDir);

  try {
    const stdout = await runPowerShellCommandAsync(script);
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
  listChromeProcessesPs,
  listProfileBrowserPids,
  hasProfileBrowserProcess,
  killOrphanProfileBrowser,
  readDevToolsActivePort,
  focusProfileBrowserWindow,
  resolveExistingProfileLockFiles,
};
