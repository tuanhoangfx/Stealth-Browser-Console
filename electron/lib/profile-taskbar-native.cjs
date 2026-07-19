/**
 * Win32 taskbar chrome for Cloak/Chrome profile windows.
 *
 * Design lock: TASKBAR_PROFILE_BADGE V2 (2026-07-20)
 * — Base = exact Chromium icon from chrome.exe.
 * — Label = slim navy plate + digits drawn on a transparent PNG, packed into ICO
 *   (PNG-in-ICO keeps alpha — avoids dark orb from Icon.FromHandle/GetHicon).
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

/** Bottom plate + oversized digits (readable when Windows scales taskbar to ~24–32px). */
const BADGE_STYLE = "v2m-bottom-huge";
const BADGE_CANVAS = 256;

function escapePsSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function resolveChromiumExe() {
  const root = path.join(os.homedir(), ".cloakbrowser");
  if (!fs.existsSync(root)) return "";
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return "";
  }
  const dirs = names
    .filter((n) => String(n).startsWith("chromium-"))
    .sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }));
  for (const d of dirs) {
    const exe = path.join(root, d, "chrome.exe");
    if (fs.existsSync(exe)) return exe;
  }
  return "";
}

function badgeCacheDir() {
  const dir = path.join(os.tmpdir(), "stealth-taskbar-badges");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function badgeCachePath(code) {
  const digits = String(code || "0000").replace(/[^\w.-]+/g, "").slice(0, 8) || "0000";
  return path.join(badgeCacheDir(), `${BADGE_STYLE}-${digits}.ico`);
}

/** Pack a PNG into a Vista+ ICO container (preserves alpha). */
function pngBufferToIco(pngBuffer, width = 64, height = 64) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width >= 256 ? 0 : width, 0);
  entry.writeUInt8(height >= 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuffer]);
}

function resolvePowerShell() {
  const root = process.env.SystemRoot || "C:\\Windows";
  const sysnative = path.join(root, "Sysnative", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (fs.existsSync(sysnative)) return sysnative;
  return path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

async function runPowerShell(args, opts = {}) {
  return execFileAsync(resolvePowerShell(), ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", ...args], {
    timeout: 15_000,
    windowsHide: true,
    ...opts,
  });
}

/**
 * Render Chromium + bottom plate + huge digits to PNG → ICO (256px; stays readable at ~24–32px taskbar).
 */
async function ensureBadgeIco(code) {
  const digits = String(code || "").replace(/\D/g, "").slice(-4) || "0000";
  const ico = badgeCachePath(digits);
  if (fs.existsSync(ico) && fs.statSync(ico).size > 200) return ico;

  const chromeExe = resolveChromiumExe();
  if (!chromeExe) throw new Error("chromium exe not found");

  const pngPath = path.join(badgeCacheDir(), `${BADGE_STYLE}-${digits}.png`);
  const size = BADGE_CANVAS;
  const script = [
    "Add-Type -AssemblyName System.Drawing",
    `$digits = '${escapePsSingleQuoted(digits)}'`,
    `$png = '${escapePsSingleQuoted(pngPath)}'`,
    `$chrome = '${escapePsSingleQuoted(chromeExe)}'`,
    `$size = ${size}`,
    "$bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)",
    "$g = [System.Drawing.Graphics]::FromImage($bmp)",
    "$g.SmoothingMode = 'AntiAlias'",
    "$g.InterpolationMode = 'HighQualityBicubic'",
    "$g.PixelOffsetMode = 'HighQuality'",
    "$g.TextRenderingHint = 'AntiAliasGridFit'",
    "$g.CompositingMode = 'SourceOver'",
    "$g.Clear([System.Drawing.Color]::Transparent)",
    "$srcIcon = [System.Drawing.Icon]::ExtractAssociatedIcon($chrome)",
    "if (-not $srcIcon) { 'FAIL'; exit 0 }",
    "$srcBmp = $srcIcon.ToBitmap()",
    "$g.DrawImage($srcBmp, 0, 0, $size, $size)",
    "$srcBmp.Dispose(); $srcIcon.Dispose()",
    // ~55% of icon height — digits dominate after Windows downscales to taskbar size
    "$bandH = [int]([Math]::Round($size * 0.55))",
    "$bandY = $size - $bandH",
    "$band = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 6, 16, 32))",
    "$g.FillRectangle($band, 0, $bandY, $size, $bandH)",
    "$fontSize = if ($digits.Length -ge 4) { 92 } elseif ($digits.Length -eq 3) { 104 } else { 118 }",
    "$font = New-Object System.Drawing.Font 'Segoe UI', $fontSize, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)",
    "$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)",
    "$sf = New-Object System.Drawing.StringFormat",
    "$sf.Alignment = 'Center'",
    "$sf.LineAlignment = 'Center'",
    "$g.DrawString($digits, $font, $brush, (New-Object System.Drawing.RectangleF 0, $bandY, $size, $bandH), $sf)",
    "$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)",
    "$g.Dispose(); $bmp.Dispose(); $font.Dispose(); $brush.Dispose(); $band.Dispose()",
    "if ((Test-Path -LiteralPath $png) -and ((Get-Item -LiteralPath $png).Length -gt 200)) { 'OK' } else { 'FAIL' }",
  ].join("; ");

  const { stdout } = await runPowerShell(["-Command", script]);
  if (!String(stdout).includes("OK") || !fs.existsSync(pngPath)) {
    throw new Error(`badge png failed: ${String(stdout).trim()}`);
  }

  const pngBuf = fs.readFileSync(pngPath);
  fs.writeFileSync(ico, pngBufferToIco(pngBuf, size, size));
  try {
    fs.unlinkSync(pngPath);
  } catch {
    /* ignore */
  }
  if (!fs.existsSync(ico) || fs.statSync(ico).size < 200) {
    throw new Error("badge ico write failed");
  }
  return ico;
}

/** Fire-and-forget: pre-build ICO for profile codes (launch / directory list). */
function warmBadgeIcosForProfiles(profiles, { limit = 48 } = {}) {
  if (!Array.isArray(profiles) || !profiles.length || process.platform !== "win32") return;
  const { extractProfileCode } = require("./profile-identity.cjs");
  const seen = new Set();
  const codes = [];
  for (const p of profiles) {
    const code = extractProfileCode(p?.name, p?.id);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
    if (codes.length >= limit) break;
  }
  for (const code of codes) {
    void ensureBadgeIco(code).catch(() => undefined);
  }
}

function buildApplyScript({ dir, title, icoPath, appId, browserPid = 0 }) {
  const escaped = escapePsSingleQuoted(dir);
  const forward = escapePsSingleQuoted(dir.replace(/\\/g, "/"));
  const uuid = escapePsSingleQuoted(path.basename(dir));
  const titleEsc = escapePsSingleQuoted(title);
  const icoEsc = escapePsSingleQuoted(icoPath);
  const appIdEsc = escapePsSingleQuoted(appId);
  const pidHint = Number(browserPid) > 0 ? Number(browserPid) : 0;

  return `
$ErrorActionPreference = 'Stop'
$needles = @('${escaped}', '${forward}', '${uuid}')
$title = '${titleEsc}'
$ico = '${icoEsc}'
$appId = '${appIdEsc}'
$hintPid = ${pidHint}

# Fast path: known browser PID (from Playwright) or stealth-pid.json — never WMI on hot path.
$pids = @()
if ($hintPid -gt 0) {
  $pids = @($hintPid)
} else {
  $sidecar = Join-Path '${escaped}' 'stealth-pid.json'
  if (Test-Path -LiteralPath $sidecar) {
    try {
      $sp = Get-Content -LiteralPath $sidecar -Raw | ConvertFrom-Json
      if ($sp.pid -gt 0) { $pids = @([int]$sp.pid) }
    } catch { }
  }
}
# Last resort only (slow ~2–3s) — batch scripts / missing sidecar
if (-not $pids -or $pids.Count -eq 0) {
  $pids = @(Get-CimInstance Win32_Process | Where-Object {
    $cmd = $_.CommandLine; $name = $_.Name
    if (-not $cmd) { return $false }
    if ($name -ne 'chrome.exe' -and $name -ne 'chromium.exe') { return $false }
    if ($cmd -notmatch 'stealth-browser-console') { return $false }
    foreach ($n in $needles) { if ($n -and ($cmd -like ('*' + $n + '*'))) { return $true } }
    return $false
  } | Sort-Object { if ($_.CommandLine -match '--type=') { 1 } else { 0 } } |
    Select-Object -ExpandProperty ProcessId)
}

if (-not $pids -or $pids.Count -eq 0) { Write-Output 'MISSING'; exit 0 }

Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

public static class StealthTaskbarWin {
  public const int WM_SETICON = 0x0080;
  public const int ICON_SMALL = 0;
  public const int ICON_BIG = 1;
  public const uint IMAGE_ICON = 1;
  public const uint LR_LOADFROMFILE = 0x0010;
  public const uint LR_DEFAULTSIZE = 0x0040;

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern bool SetWindowText(IntPtr hWnd, string lpString);

  [DllImport("user32.dll")]
  public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr LoadImage(IntPtr hInst, string name, uint type, int cx, int cy, uint fuLoad);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr hWnd);

  [DllImport("shell32.dll")]
  public static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, out IPropertyStore propertyStore);

  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF58"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    int GetCount(out uint cProps);
    int GetAt(uint iProp, out PropertyKey pkey);
    int GetValue(ref PropertyKey key, out PropVariant pv);
    int SetValue(ref PropertyKey key, ref PropVariant pv);
    int Commit();
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PropertyKey { public Guid fmtid; public uint pid; }

  [StructLayout(LayoutKind.Sequential)]
  public struct PropVariant {
    public ushort vt; public ushort wReserved1; public ushort wReserved2; public ushort wReserved3;
    public IntPtr p; public int p2;
  }

  public static readonly Guid IID_IPropertyStore = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF58");
  public static readonly PropertyKey PKEY_AppUserModel_ID = new PropertyKey {
    fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5
  };
  public static readonly PropertyKey PKEY_AppUserModel_RelaunchIconResource = new PropertyKey {
    fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 3
  };
  public static readonly PropertyKey PKEY_AppUserModel_RelaunchDisplayNameResource = new PropertyKey {
    fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 4
  };

  public static PropVariant MakeString(string value) {
    return new PropVariant { vt = 31, p = Marshal.StringToCoTaskMemUni(value) };
  }

  public static void ApplyAppUserModel(IntPtr hwnd, string id, string iconPath, string displayName) {
    IPropertyStore store;
    Guid iid = IID_IPropertyStore;
    if (SHGetPropertyStoreForWindow(hwnd, ref iid, out store) != 0 || store == null) return;
    try {
      var vId = MakeString(id); var keyId = PKEY_AppUserModel_ID; store.SetValue(ref keyId, ref vId);
      if (!string.IsNullOrEmpty(iconPath)) {
        var vIcon = MakeString(iconPath); var keyIcon = PKEY_AppUserModel_RelaunchIconResource;
        store.SetValue(ref keyIcon, ref vIcon);
      }
      if (!string.IsNullOrEmpty(displayName)) {
        var vName = MakeString(displayName); var keyName = PKEY_AppUserModel_RelaunchDisplayNameResource;
        store.SetValue(ref keyName, ref vName);
      }
      store.Commit();
    } catch { }
  }

  public static IntPtr FindVisibleHwnd(uint[] pids) {
    var set = new HashSet<uint>(pids);
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) && !IsIconic(h)) return true;
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (!set.Contains(pid)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      // Prefer real browser windows (skip empty tool windows)
      if (sb.Length == 0) return true;
      found = h;
      return false;
    }, IntPtr.Zero);
    return found;
  }
}
"@

$loadFlags = [uint32]([StealthTaskbarWin]::LR_LOADFROMFILE -bor [StealthTaskbarWin]::LR_DEFAULTSIZE)
$hi = [IntPtr]::Zero
if ($ico -and (Test-Path -LiteralPath $ico)) {
  $hi = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $ico, [StealthTaskbarWin]::IMAGE_ICON, 0, 0, $loadFlags)
}

$ok = $false
$iconOk = $false
$pidArr = [uint32[]]@($pids | ForEach-Object { [uint32]$_ })
$h = [StealthTaskbarWin]::FindVisibleHwnd($pidArr)
if ($h -eq [IntPtr]::Zero) {
  foreach ($procId in $pids) {
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero -and $p.MainWindowHandle -ne 0) {
      $h = $p.MainWindowHandle
      break
    }
  }
}
if ($h -ne [IntPtr]::Zero) {
  [StealthTaskbarWin]::SetWindowText($h, $title) | Out-Null
  if ($hi -ne [IntPtr]::Zero) {
    [StealthTaskbarWin]::SendMessage($h, [StealthTaskbarWin]::WM_SETICON, [IntPtr][StealthTaskbarWin]::ICON_SMALL, $hi) | Out-Null
    [StealthTaskbarWin]::SendMessage($h, [StealthTaskbarWin]::WM_SETICON, [IntPtr][StealthTaskbarWin]::ICON_BIG, $hi) | Out-Null
    $iconOk = $true
  }
  [StealthTaskbarWin]::ApplyAppUserModel($h, $appId, $ico, $title)
  $ok = $true
}

if ($ok -and $iconOk) { Write-Output 'OK_ICON' }
elseif ($ok) { Write-Output 'OK_TITLE' }
else { Write-Output 'NOHWND' }
`.trim();
}

async function applyNativeProfileTaskbarChrome(userDataDir, title, code, opts = {}) {
  if (process.platform !== "win32" || !userDataDir) {
    return { ok: false, reason: "unsupported" };
  }
  const label = String(title || "").trim().slice(0, 120);
  if (!label) return { ok: false, reason: "empty-title" };

  const digits = String(code || label).replace(/\D/g, "").slice(-4) || "0000";
  let icoPath = "";
  try {
    icoPath = await ensureBadgeIco(digits);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }

  const dir = path.resolve(String(userDataDir));
  const appId = `StealthBrowser.Profile.${digits}`;
  const browserPid = Number(opts.browserPid) > 0 ? Number(opts.browserPid) : 0;
  const scriptBody = buildApplyScript({ dir, title: label, icoPath, appId, browserPid });
  const scriptFile = path.join(badgeCacheDir(), `apply-${digits}-${Date.now()}.ps1`);
  fs.writeFileSync(scriptFile, scriptBody, "utf8");

  try {
    const { stdout, stderr } = await runPowerShell(["-File", scriptFile], { timeout: 25_000 });
    const result = String(stdout).trim().split(/\r?\n/).pop()?.trim();
    if (result === "OK_ICON" || result === "OK_TITLE") {
      return { ok: true, detail: result };
    }
    if (result === "MISSING") return { ok: false, reason: "not-running" };
    return { ok: false, reason: result || "no-window", detail: String(stderr || "").slice(0, 200) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    try {
      fs.unlinkSync(scriptFile);
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  BADGE_STYLE,
  BADGE_CANVAS,
  resolveChromiumExe,
  ensureBadgeIco,
  warmBadgeIcosForProfiles,
  applyNativeProfileTaskbarChrome,
  badgeCachePath,
  pngBufferToIco,
  buildApplyScript,
};
