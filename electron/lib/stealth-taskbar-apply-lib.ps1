# Shared Win32 taskbar apply library — dot-source from -File entry + worker.
$ErrorActionPreference = 'Stop'

function Ensure-StealthTaskbarWinType {
  $cacheDir = Join-Path $env:TEMP 'stealth-taskbar-badges'
  if (-not (Test-Path -LiteralPath $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }
  $dll = Join-Path $cacheDir 'StealthTaskbarWin.dll'
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
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("shell32.dll")] public static extern int SHGetPropertyStoreForWindow(IntPtr hwnd, ref Guid iid, out IPropertyStore propertyStore);
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
  public static void ApplyAppUserModel(IntPtr hwnd, string id, string iconPath, string displayName) {
    IPropertyStore store; Guid iid = IID_IPropertyStore;
    if (SHGetPropertyStoreForWindow(hwnd, ref iid, out store) != 0 || store == null) return;
    try {
      var vId = MakeString(id); var keyId = PKEY_AppUserModel_ID; store.SetValue(ref keyId, ref vId);
      if (!string.IsNullOrEmpty(iconPath)) { var vIcon = MakeString(iconPath); var keyIcon = PKEY_AppUserModel_RelaunchIconResource; store.SetValue(ref keyIcon, ref vIcon); }
      if (!string.IsNullOrEmpty(displayName)) { var vName = MakeString(displayName); var keyName = PKEY_AppUserModel_RelaunchDisplayNameResource; store.SetValue(ref keyName, ref vName); }
      store.Commit();
    } catch { }
  }
  public static IntPtr FindVisibleHwnd(uint[] pids) {
    var set = new HashSet<uint>(pids); IntPtr found = IntPtr.Zero; IntPtr emptyTitle = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) && !IsIconic(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid); if (!set.Contains(pid)) return true;
      var sb = new StringBuilder(512); GetWindowText(h, sb, sb.Capacity);
      if (sb.Length == 0) { if (emptyTitle == IntPtr.Zero) emptyTitle = h; return true; }
      found = h; return false;
    }, IntPtr.Zero);
    if (found != IntPtr.Zero) return found; return emptyTitle;
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
  if ($HintPid -gt 0) {
    $pids = @($HintPid)
    $wmiSkipped = $true
  } else {
    $sidecar = Join-Path $dir 'stealth-pid.json'
    if (Test-Path -LiteralPath $sidecar) {
      try {
        $sp = Get-Content -LiteralPath $sidecar -Raw | ConvertFrom-Json
        if ($sp.pid -gt 0) {
          $pids = @([int]$sp.pid)
          $wmiSkipped = $true
        }
      } catch { }
    }
  }
  if (-not $pids -or $pids.Count -eq 0) {
    $pids = @(Get-CimInstance Win32_Process | Where-Object {
      $cmd = $_.CommandLine; $name = $_.Name
      if (-not $cmd) { return $false }
      if ($name -ne 'chrome.exe' -and $name -ne 'chromium.exe') { return $false }
      if ($cmd -notmatch 'stealth-browser-console') { return $false }
      foreach ($n in $needles) { if ($n -and ($cmd -like ('*' + $n + '*'))) { return $true } }
      return $false
    } | Sort-Object { if ($_.CommandLine -match '--type=') { 1 } else { 0 } } | Select-Object -ExpandProperty ProcessId)
  }

  if (-not $pids -or $pids.Count -eq 0) {
    return @{ result = 'MISSING'; wmiSkipped = $wmiSkipped }
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
      $hiBig = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 20, 20, $loadFlags)
    }
    $hiSmall = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 16, 16, $loadFlags)
    if ($hiSmall -eq [IntPtr]::Zero) {
      $hiSmall = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 20, 20, $loadFlags)
    }
    if ($hiSmall -eq [IntPtr]::Zero) {
      $hiSmall = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 24, 24, $loadFlags)
    }
    if ($hiBig -eq [IntPtr]::Zero) {
      $hiBig = [StealthTaskbarWin]::LoadImage([IntPtr]::Zero, $Ico, [StealthTaskbarWin]::IMAGE_ICON, 0, 0, ([uint32]([StealthTaskbarWin]::LR_LOADFROMFILE -bor [StealthTaskbarWin]::LR_DEFAULTSIZE)))
    }
  }

  $ok = $false; $iconOk = $false
  $pidArr = [uint32[]]@($pids | ForEach-Object { [uint32]$_ })
  # Prefer MainWindowHandle of the browser PID — EnumWindows can hit child/utility HWNDs
  # that accept WM_SETICON but are not the taskbar button window.
  $h = [IntPtr]::Zero
  foreach ($procId in $pids) {
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero -and $p.MainWindowHandle -ne 0) {
      $h = $p.MainWindowHandle
      break
    }
  }
  if ($h -eq [IntPtr]::Zero) {
    $h = [StealthTaskbarWin]::FindVisibleHwnd($pidArr)
  }
  if ($h -ne [IntPtr]::Zero) {
    [StealthTaskbarWin]::SetWindowText($h, $Title) | Out-Null
    # AUMID first, then SETICON last — Chromium/shell often reset icons after property-store commit.
    [StealthTaskbarWin]::ApplyAppUserModel($h, $AppId, $Ico, $Title)
    if ($hiSmall -ne [IntPtr]::Zero) {
      [StealthTaskbarWin]::SendMessage($h, [StealthTaskbarWin]::WM_SETICON, [IntPtr][StealthTaskbarWin]::ICON_SMALL, $hiSmall) | Out-Null
      $iconOk = $true
    }
    if ($hiBig -ne [IntPtr]::Zero) {
      [StealthTaskbarWin]::SendMessage($h, [StealthTaskbarWin]::WM_SETICON, [IntPtr][StealthTaskbarWin]::ICON_BIG, $hiBig) | Out-Null
      $iconOk = $true
    }
    # Second SETICON pass — Win11 taskbar sometimes keeps the pre-AUMID icon otherwise.
    if ($hiSmall -ne [IntPtr]::Zero) {
      [StealthTaskbarWin]::SendMessage($h, [StealthTaskbarWin]::WM_SETICON, [IntPtr][StealthTaskbarWin]::ICON_SMALL, $hiSmall) | Out-Null
    }
    if ($hiBig -ne [IntPtr]::Zero) {
      [StealthTaskbarWin]::SendMessage($h, [StealthTaskbarWin]::WM_SETICON, [IntPtr][StealthTaskbarWin]::ICON_BIG, $hiBig) | Out-Null
    }
    $ok = $true
  }

  $result = if ($ok -and $iconOk) { 'OK_ICON' } elseif ($ok) { 'OK_TITLE' } else { 'NOHWND' }
  return @{ result = $result; wmiSkipped = $wmiSkipped }
}
