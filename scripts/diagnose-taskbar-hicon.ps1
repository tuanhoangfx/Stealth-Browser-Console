# One-pass: live Cloak chrome.exe (no --type=) + visible HWND + WM_GETICON / class icon.
$ErrorActionPreference = 'Continue'
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class Hico2 {
  public const int GCLP_HICON = -14; public const int GCLP_HICONSM = -34;
  public const int WM_GETICON = 0x007F; public const int ICON_SMALL = 0; public const int ICON_BIG = 1; public const int ICON_SMALL2 = 2;
  [DllImport("user32.dll")] public static extern IntPtr GetClassLongPtr(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr l);
  public static List<object[]> Collect() {
    var list = new List<object[]>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) && !IsIconic(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      var cls = new StringBuilder(64); GetClassName(h, cls, 64);
      var title = new StringBuilder(256); GetWindowText(h, title, 256);
      long small = (long)SendMessage(h, WM_GETICON, (IntPtr)ICON_SMALL, IntPtr.Zero);
      long big = (long)SendMessage(h, WM_GETICON, (IntPtr)ICON_BIG, IntPtr.Zero);
      long small2 = (long)SendMessage(h, WM_GETICON, (IntPtr)ICON_SMALL2, IntPtr.Zero);
      long classBig = 0; long classSm = 0;
      try { classBig = (long)GetClassLongPtr(h, GCLP_HICON); } catch {}
      try { classSm = (long)GetClassLongPtr(h, GCLP_HICONSM); } catch {}
      list.Add(new object[] { (long)h, (int)pid, cls.ToString(), title.ToString(), small, big, small2, classBig, classSm });
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@

$wins = [Hico2]::Collect()
$chrome = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object {
  $_.CommandLine -and $_.CommandLine -match 'stealth-browser-console' -and $_.CommandLine -notmatch '--type='
})

$rows = @()
foreach ($p in $chrome) {
  $dir = $null
  if ($p.CommandLine -match '--user-data-dir="([^"]+)"') { $dir = $Matches[1] }
  elseif ($p.CommandLine -match '--user-data-dir=(\S+)') { $dir = $Matches[1] }
  $owned = @($wins | Where-Object { $_[1] -eq [int]$p.ProcessId })
  $best = $owned | Where-Object { $_[2] -match 'Chrome_WidgetWin' } | Select-Object -First 1
  if (-not $best) { $best = $owned | Select-Object -First 1 }
  $stamped = $false
  $hwnd = 0; $title = ''; $cls = ''; $wmS = 0; $wmB = 0; $wmS2 = 0; $cB = 0; $cS = 0
  if ($best) {
    $hwnd = $best[0]; $cls = $best[2]; $title = $best[3]
    $wmS = $best[4]; $wmB = $best[5]; $wmS2 = $best[6]; $cB = $best[7]; $cS = $best[8]
    $stamped = ($wmS -ne 0 -or $wmB -ne 0 -or $wmS2 -ne 0)
  }
  $rows += [pscustomobject]@{
    pid = [int]$p.ProcessId
    dir = $dir
    hwnd = $hwnd
    cls = $cls
    title = $title
    wmSmall = $wmS
    wmBig = $wmB
    wmSmall2 = $wmS2
    classBig = $cB
    classSm = $cS
    stamped = $stamped
    winCount = $owned.Count
  }
}

@{
  chromeMain = $rows.Count
  stamped = @($rows | Where-Object { $_.stamped }).Count
  plain = @($rows | Where-Object { -not $_.stamped }).Count
  hwnd0 = @($rows | Where-Object { $_.hwnd -eq 0 }).Count
  rows = $rows
} | ConvertTo-Json -Depth 5 -Compress
