# Shared Win32 taskbar apply library — dot-source from -File entry + worker.
$ErrorActionPreference = 'Stop'

function Ensure-StealthTaskbarWinType {
  $cacheDir = Join-Path $env:TEMP 'stealth-taskbar-badges'
  if (-not (Test-Path -LiteralPath $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }
  # v4: title-prefix HWND fallback (burst-open pid=0). No WMI on the hot path.
  # v2: no RelaunchIconResource (Win11 ignores WM_SETICON when that property is set);
  # stamp SETICON on all top-level visible HWNDs for the browser PID.
  $dll = Join-Path $cacheDir 'StealthTaskbarWin.v4.dll'
  if (-not (Test-Path -LiteralPath $dll)) {
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
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool SetWindowText(IntPtr hWnd, string lpString);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr LoadImage(IntPtr hInst, string name, uint type, int cx, int cy, uint fuLoad);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("shell32.dll")] public static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, out IPropertyStore propertyStore);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF58"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IPropertyStore {
    int GetCount(out uint cProps); int GetAt(uint iProp, out PropertyKey pkey);
    int GetValue(ref PropertyKey key, out PropVariant pv); int SetValue(ref PropertyKey key, ref PropVariant pv); int Commit();
  }
  [StructLayout(LayoutKind.Sequential, Pack = 4)] public struct PropertyKey { public Guid fmtid; public uint pid; }
  [StructLayout(LayoutKind.Sequential)] public struct PropVariant {
    public ushort vt; public ushort wReserved1; public ushort wReserved2; public ushort wReserved3; public IntPtr p; public int p2;
  }
  public static readonly Guid IID_IPropertyStore = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF58");
  public static readonly PropertyKey PKEY_AppUserModel_ID = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
  public static readonly PropertyKey PKEY_AppUserModel_RelaunchIconResource = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 3 };
  public static readonly PropertyKey PKEY_AppUserModel_RelaunchDisplayNameResource = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 4 };
  public static PropVariant MakeString(string value) { return new PropVariant { vt = 31, p = Marshal.StringToCoTaskMemUni(value) }; }
  // Clear stale RelaunchIconResource so Win11 taskbar honors WM_SETICON again.
  public static void ApplyAppUserModel(IntPtr hwnd, string id, string displayName) {
    IPropertyStore store; Guid iid = IID_IPropertyStore;
    if (SHGetPropertyStoreForWindow(hwnd, ref iid, out store) != 0 || store == null) return;
    try {
      var vId = MakeString(id); var keyId = PKEY_AppUserModel_ID; store.SetValue(ref keyId, ref vId);
      var empty = new PropVariant { vt = 0 };
      var keyIcon = PKEY_AppUserModel_RelaunchIconResource; store.SetValue(ref keyIcon, ref empty);
      if (!string.IsNullOrEmpty(displayName)) { var vName = MakeString(displayName); var keyName = PKEY_AppUserModel_RelaunchDisplayNameResource; store.SetValue(ref keyName, ref vName); }
      store.Commit();
    } catch { }
  }
  public static IntPtr FindVisibleHwnd(uint[] pids) {
    var set = new HashSet<uint>(pids); IntPtr best = IntPtr.Zero; int bestArea = -1; IntPtr emptyTitle = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) && !IsIconic(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid); if (!set.Contains(pid)) return true;
      RECT r; GetWindowRect(h, out r);
      int area = Math.Abs((r.Right - r.Left) * (r.Bottom - r.Top));
      var sb = new StringBuilder(512); GetWindowText(h, sb, sb.Capacity);
      if (sb.Length == 0) { if (emptyTitle == IntPtr.Zero) emptyTitle = h; return true; }
      if (area > bestArea) { bestArea = area; best = h; }
      return true;
    }, IntPtr.Zero);
    if (best != IntPtr.Zero) return best; return emptyTitle;
  }
  public static IntPtr[] FindAllVisibleHwnds(uint[] pids) {
    var set = new HashSet<uint>(pids); var list = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) && !IsIconic(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid); if (!set.Contains(pid)) return true;
      list.Add(h); return true;
    }, IntPtr.Zero);
    return list.ToArray();
  }
  public static void StampIcons(IntPtr hwnd, IntPtr hiSmall, IntPtr hiBig) {
    if (hiSmall != IntPtr.Zero) SendMessage(hwnd, WM_SETICON, (IntPtr)ICON_SMALL, hiSmall);
    if (hiBig != IntPtr.Zero) SendMessage(hwnd, WM_SETICON, (IntPtr)ICON_BIG, hiBig);
  }
  // Keep in sync with electron/lib/taskbar-title-match.cjs
  public static bool TitleMatchesLabel(string title, string label) {
    if (string.IsNullOrEmpty(title) || string.IsNullOrEmpty(label)) return false;
    if (title == label) return true;
    if (title.StartsWith(label + " —") || title.StartsWith(label + " ·") || title.StartsWith(label + " -")) return true;
    if (label.Length >= 4) {
      string code = label.Substring(0, 4);
      bool digits = true;
      for (int i = 0; i < 4; i++) { if (code[i] < '0' || code[i] > '9') { digits = false; break; } }
      if (digits && (title == code || title.StartsWith(code + " —") || title.StartsWith(code + " ·") || title.StartsWith(code + " -"))) return true;
    }
    return false;
  }
  public static IntPtr[] FindHwndsByTitlePrefix(string label) {
    var list = new List<IntPtr>();
    if (string.IsNullOrEmpty(label)) return list.ToArray();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) && !IsIconic(h)) return true;
      var cls = new StringBuilder(64);
      GetClassName(h, cls, 64);
      if (cls.ToString().IndexOf("Chrome_WidgetWin") < 0) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      if (!TitleMatchesLabel(sb.ToString(), label)) return true;
      list.Add(h);
      return true;
    }, IntPtr.Zero);
    return list.ToArray();
  }
}
"@ -OutputAssembly $dll -OutputType Library
  }
  Add-Type -Path $dll
}

function Invoke-StealthTaskbarApply {
  param(
    [Parameter(Mandatory = $true)][string]$UserDataDir,
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][string]$Ico,
    [Parameter(Mandatory = $true)][string]$AppId,
    [int]$HintPid = 0
  )

  Ensure-StealthTaskbarWinType | Out-Null

  $dir = $UserDataDir
  $forward = $dir -replace '\\', '/'
  $needles = New-Object System.Collections.Generic.List[string]
  [void]$needles.Add($dir)
  [void]$needles.Add($forward)
  # Dev profiles dir may be a junction → Chrome cmdline uses resolved prod path.
  if ($dir -match 'stealth-browser-console-dev') {
    $alt = $dir -replace 'stealth-browser-console-dev', 'stealth-browser-console'
    [void]$needles.Add($alt)
    [void]$needles.Add(($alt -replace '\\', '/'))
  } elseif ($dir -match 'stealth-browser-console' -and $dir -notmatch 'stealth-browser-console-dev') {
    $alt = $dir -replace 'stealth-browser-console', 'stealth-browser-console-dev'
    [void]$needles.Add($alt)
    [void]$needles.Add(($alt -replace '\\', '/'))
  }
  try {
    $real = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $dir).Path)
    if ($real -and $real -ne $dir) {
      [void]$needles.Add($real)
      [void]$needles.Add(($real -replace '\\', '/'))
    }
  } catch { }
  $needles = @($needles | Where-Object { $_ } | Select-Object -Unique)

  $wmiSkipped = $false
  $pids = @()

  function Test-StealthPidHasHwnd([int]$procId) {
    if ($procId -le 0) { return $false }
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero -and $p.MainWindowHandle -ne 0) { return $true }
    $found = @([StealthTaskbarWin]::FindAllVisibleHwnds([uint32[]]@([uint32]$procId)))
    return ($found.Count -gt 0)
  }

  if ($HintPid -gt 0 -and (Test-StealthPidHasHwnd $HintPid)) {
    $pids = @($HintPid)
    $wmiSkipped = $true
  }
  if (-not $pids -or $pids.Count -eq 0) {
    $sidecar = Join-Path $dir 'stealth-pid.json'
    if (Test-Path -LiteralPath $sidecar) {
      try {
        $sp = Get-Content -LiteralPath $sidecar -Raw | ConvertFrom-Json
        if ($sp.pid -gt 0 -and (Test-StealthPidHasHwnd ([int]$sp.pid))) {
          $pids = @([int]$sp.pid)
          $wmiSkipped = $true
        }
      } catch { }
    }
  }
  # Title match before any WMI — burst-open 18+ chrome.exe made Win32_Process 2–8s/profile
  # and starved later stamps (first ~10 OK_ICON, rest plain). Page title is already "0010".
  $titleHwnds = @([StealthTaskbarWin]::FindHwndsByTitlePrefix($Title))
  if ((-not $pids -or $pids.Count -eq 0) -and $titleHwnds.Count -gt 0) {
    $wmiSkipped = $true
  }
  # HintPid/sidecar often a zygote (MainWindowHandle=0) that still owns Chrome_WidgetWin_1.
  if ((-not $pids -or $pids.Count -eq 0) -and $titleHwnds.Count -eq 0 -and $HintPid -gt 0) {
    for ($i = 0; $i -lt 4; $i++) {
      if (Test-StealthPidHasHwnd $HintPid) {
        $pids = @($HintPid)
        $wmiSkipped = $true
        break
      }
      Start-Sleep -Milliseconds 40
    }
    if (-not $pids -or $pids.Count -eq 0) {
      $titleHwnds = @([StealthTaskbarWin]::FindHwndsByTitlePrefix($Title))
    }
  }

  if ((-not $pids -or $pids.Count -eq 0) -and $titleHwnds.Count -eq 0) {
    return @{ result = 'NOHWND'; wmiSkipped = $true }
  }

  $loadFlags = [uint32]([StealthTaskbarWin]::LR_LOADFROMFILE)
  $hiBig = [IntPtr]::Zero
  $hiSmall = [IntPtr]::Zero
  if ($Ico -and (Test-Path -LiteralPath $Ico)) {
    $hiBig = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 48, 48, $loadFlags)
    if ($hiBig -eq [IntPtr]::Zero) {
      $hiBig = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 32, 32, $loadFlags)
    }
    if ($hiBig -eq [IntPtr]::Zero) {
      $hiBig = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 24, 24, $loadFlags)
    }
    if ($hiBig -eq [IntPtr]::Zero) {
      $flagsDefault = [uint32](([StealthTaskbarWin]::LR_LOADFROMFILE) -bor ([StealthTaskbarWin]::LR_DEFAULTSIZE))
      $hiBig = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 0, 0, $flagsDefault)
    }
    $hiSmall = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 16, 16, $loadFlags)
    if ($hiSmall -eq [IntPtr]::Zero) {
      $hiSmall = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 20, 20, $loadFlags)
    }
    if ($hiSmall -eq [IntPtr]::Zero) {
      $hiSmall = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 24, 24, $loadFlags)
    }
  }

  $ok = $false; $iconOk = $false
  $primary = [IntPtr]::Zero
  $all = @()

  if ($pids -and $pids.Count -gt 0) {
    $pidArr = [uint32[]]@($pids | ForEach-Object { [uint32]$_ })
    # Prefer largest visible HWND; also stamp every top-level window for the PID
    # (Chrome popups / wrong MainWindowHandle previously caused OK_ICON but blank taskbar).
    foreach ($procId in $pids) {
      $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero -and $p.MainWindowHandle -ne 0) {
        $primary = $p.MainWindowHandle
        break
      }
    }
    if ($primary -eq [IntPtr]::Zero) {
      $primary = [StealthTaskbarWin]::FindVisibleHwnd($pidArr)
    }
    $all = @([StealthTaskbarWin]::FindAllVisibleHwnds($pidArr))
    if ($primary -ne [IntPtr]::Zero -and ($all.Count -eq 0 -or -not ($all | Where-Object { $_ -eq $primary }))) {
      $all = @($primary) + $all
    }
  }
  foreach ($h in $titleHwnds) {
    if ($h -eq [IntPtr]::Zero) { continue }
    if ($all.Count -eq 0 -or -not ($all | Where-Object { $_ -eq $h })) {
      $all = @($all) + $h
    }
  }

  foreach ($h in $all) {
    if ($h -eq [IntPtr]::Zero) { continue }
    [StealthTaskbarWin]::SetWindowText($h, $Title) | Out-Null
    # AUMID for grouping/title only — icon comes from WM_SETICON (not RelaunchIconResource).
    [StealthTaskbarWin]::ApplyAppUserModel($h, $AppId, $Title)
    if ($hiSmall -ne [IntPtr]::Zero -or $hiBig -ne [IntPtr]::Zero) {
      [StealthTaskbarWin]::StampIcons($h, $hiSmall, $hiBig)
      Start-Sleep -Milliseconds 30
      [StealthTaskbarWin]::StampIcons($h, $hiSmall, $hiBig)
      $iconOk = $true
    }
    $ok = $true
  }

  $result = if ($ok -and $iconOk) { 'OK_ICON' } elseif ($ok) { 'OK_TITLE' } else { 'NOHWND' }
  return @{ result = $result; wmiSkipped = $wmiSkipped }
}
