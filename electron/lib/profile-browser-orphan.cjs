const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const { markProfileChromeCleanExit } = require("./profile-chrome-session.cjs");

const CHROME_NAMES = new Set(["chrome.exe", "chromium.exe"]);

function escapePsSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function listChromeProcessesPs(userDataDir) {
  const dir = path.resolve(String(userDataDir));
  const forward = escapePsSingleQuoted(dir.replace(/\\/g, "/"));
  const backslash = escapePsSingleQuoted(dir);
  return [
    `$fwd = '${forward}'; $bck = '${backslash}'`,
    "Get-CimInstance Win32_Process | Where-Object {",
    "  $_.CommandLine -and ($_.Name -eq 'chrome.exe' -or $_.Name -eq 'chromium.exe') -and",
    "  (($_.CommandLine -like ('*' + $fwd + '*')) -or ($_.CommandLine -like ('*' + $bck + '*')))",
    "} | ForEach-Object { $_.ProcessId }",
  ].join("; ");
}

async function listProfileBrowserPids(userDataDir) {
  if (!userDataDir || process.platform !== "win32") return [];
  try {
    const { stdout } = await execFileAsync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", listChromeProcessesPs(userDataDir)],
      { timeout: 20_000, windowsHide: true },
    );
    return String(stdout)
      .split(/\r?\n/)
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isFinite(pid) && pid > 0);
  } catch {
    return [];
  }
}

async function hasProfileBrowserProcess(userDataDir) {
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
  listProfileBrowserPids,
  hasProfileBrowserProcess,
  killOrphanProfileBrowser,
  readDevToolsActivePort,
  focusProfileBrowserWindow,
};
