# Shared Win32 taskbar apply library — dot-source from -File entry + worker.
$ErrorActionPreference = 'Stop'
# Dot-source: $PSCommandPath is the caller. MyCommand.Path is this file.
$script:StealthTaskbarLibPath = $MyInvocation.MyCommand.Path

function Ensure-StealthTaskbarWinType {
  $cacheDir = Join-Path $env:TEMP 'stealth-taskbar-badges'
  if (-not (Test-Path -LiteralPath $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }
  # DLL name is the SHA256 prefix of THIS file. Any edit recompiles. A pinned
  # filename used to keep the previous C# in memory after the ps1 changed.
  # HICON cache: restamp used to LoadImage forever until the process GDI cap (9999).
  # EnumWindows callbacks stay in static fields (inline lambdas are not GC roots).
  # Do not set RelaunchIconResource — Win11 then ignores WM_SETICON and shows the exe icon.
  $src = $script:StealthTaskbarLibPath
  if (-not $src) { $src = $PSCommandPath }
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $src).Hash.Substring(0, 12).ToLower()
  $dll = Join-Path $cacheDir ("StealthTaskbarWin." + $hash + ".dll")
  Get-ChildItem -LiteralPath $cacheDir -Filter 'StealthTaskbarWin.*.dll' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $dll } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }
  if (-not (Test-Path -LiteralPath $dll)) {
    try {
    Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
using System.Threading;

public static class StealthTaskbarWin {
  public const int WM_SETICON = 0x0080;
  public const int WM_GETICON = 0x007F;
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
  // Root EnumWindows procs for the whole call. Do not pass an inline lambda.
  static EnumWindowsProc _cbFindVisible;
  static EnumWindowsProc _cbFindAll;
  static EnumWindowsProc _cbFindTitle;
  static readonly Dictionary<string, IntPtr> _icons = new Dictionary<string, IntPtr>();
  static readonly object _iconLock = new object();
  static EnumWindowsProc _cbKeep;
  static Timer _keepTimer;
  static Mutex _keeperMutex;
  static int _keepBusy;
  public static int LastKeepStamped;
  [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
  [DllImport("user32.dll")] public static extern int GetGuiResources(IntPtr hProcess, int uiFlags);
  public static int GuiObjectCount() { return GetGuiResources(GetCurrentProcess(), 0); }
  // One HICON per ico path + size. WM_SETICON does not copy; destroying or reloading
  // a new handle every restamp leaks ~3 GDI objects per LoadImage until the cap.
  public static IntPtr LoadCachedIcon(string path, int cx, int cy) {
    lock (_iconLock) {
      if (string.IsNullOrEmpty(path) || !File.Exists(path)) return IntPtr.Zero;
      FileInfo fi = new FileInfo(path);
      string key = path + "|" + cx + "|" + cy + "|" + fi.Length + "|" + fi.LastWriteTimeUtc.Ticks;
      IntPtr cached;
      if (_icons.TryGetValue(key, out cached) && cached != IntPtr.Zero) return cached;
      uint flags = LR_LOADFROMFILE;
      if (cx <= 0 || cy <= 0) flags |= LR_DEFAULTSIZE;
      IntPtr hi = LoadImage(IntPtr.Zero, path, IMAGE_ICON, cx, cy, flags);
      if (hi != IntPtr.Zero) _icons[key] = hi;
      return hi;
    }
  }
  public static bool IconsMatch(IntPtr hwnd, IntPtr hiSmall, IntPtr hiBig) {
    if (hwnd == IntPtr.Zero || (hiSmall == IntPtr.Zero && hiBig == IntPtr.Zero)) return false;
    IntPtr curBig = SendMessage(hwnd, WM_GETICON, (IntPtr)ICON_BIG, IntPtr.Zero);
    IntPtr curSmall = SendMessage(hwnd, WM_GETICON, (IntPtr)ICON_SMALL, IntPtr.Zero);
    IntPtr curSmall2 = SendMessage(hwnd, WM_GETICON, (IntPtr)2, IntPtr.Zero);
    if (hiBig != IntPtr.Zero && (curBig == hiBig || curSmall == hiBig || curSmall2 == hiBig)) return true;
    if (hiSmall != IntPtr.Zero && (curBig == hiSmall || curSmall == hiSmall || curSmall2 == hiSmall)) return true;
    return false;
  }
  // "0018", "0018 — Google", "0018 · Name — Google". Not a longer digit run.
  public static string LeadingProfileCode(string title) {
    if (string.IsNullOrEmpty(title) || title.Length < 4) return null;
    for (int i = 0; i < 4; i++) { if (title[i] < '0' || title[i] > '9') return null; }
    if (title.Length > 4) {
      char n = title[4];
      if (n != ' ' && n != '-' && n != '\u2014' && n != '\u2013' && n != '\u00B7') return null;
    }
    return title.Substring(0, 4);
  }
  // Chrome replaces WM_SETICON with the site favicon after navigation. One rooted
  // callback, one cached HICON: restamp only windows whose icon handle is not ours.
  public static int KeepBadgeIcons(string cacheDir, string style) {
    if (string.IsNullOrEmpty(cacheDir) || string.IsNullOrEmpty(style)) return 0;
    int stamped = 0;
    _cbKeep = (h, l) => {
      try {
        if (!IsWindowVisible(h) && !IsIconic(h)) return true;
        var cls = new StringBuilder(64);
        GetClassName(h, cls, 64);
        if (cls.ToString().IndexOf("Chrome_WidgetWin") < 0) return true;
        var sb = new StringBuilder(180);
        GetWindowText(h, sb, sb.Capacity);
        string code = LeadingProfileCode(sb.ToString());
        if (code == null) return true;
        int n;
        if (int.TryParse(code, out n) && n >= 9990 && n <= 9999) return true;
        string hot = Path.Combine(cacheDir, style + "-" + code + "-hot.ico");
        string full = Path.Combine(cacheDir, style + "-" + code + ".ico");
        string ico = File.Exists(hot) ? hot : (File.Exists(full) ? full : null);
        if (ico == null) return true;
        IntPtr hiBig = LoadCachedIcon(ico, 48, 48);
        if (hiBig == IntPtr.Zero) hiBig = LoadCachedIcon(ico, 32, 32);
        IntPtr hiSmall = LoadCachedIcon(ico, 16, 16);
        if (IconsMatch(h, hiSmall, hiBig)) return true;
        StampIcons(h, hiSmall, hiBig);
        stamped++;
      } catch { }
      return true;
    };
    EnumWindows(_cbKeep, IntPtr.Zero);
    GC.KeepAlive(_cbKeep);
    LastKeepStamped = stamped;
    return stamped;
  }
  public static void StartKeeper(string cacheDir, string style) {
    if (_keepTimer != null) return;
    _keeperMutex = new Mutex(false, "Local\\StealthTaskbarIconKeeper");
    try {
      if (!_keeperMutex.WaitOne(0)) { _keeperMutex = null; return; }
    } catch (AbandonedMutexException) { }
    _keepTimer = new Timer(delegate {
      if (Interlocked.CompareExchange(ref _keepBusy, 1, 0) != 0) return;
      try { KeepBadgeIcons(cacheDir, style); } catch { }
      finally { Interlocked.Exchange(ref _keepBusy, 0); }
    }, null, 3000, 10000);
  }
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
    _cbFindVisible = (h, l) => {
      if (!IsWindowVisible(h) && !IsIconic(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid); if (!set.Contains(pid)) return true;
      RECT r; GetWindowRect(h, out r);
      int area = Math.Abs((r.Right - r.Left) * (r.Bottom - r.Top));
      var sb = new StringBuilder(512); GetWindowText(h, sb, sb.Capacity);
      if (sb.Length == 0) { if (emptyTitle == IntPtr.Zero) emptyTitle = h; return true; }
      if (area > bestArea) { bestArea = area; best = h; }
      return true;
    };
    EnumWindows(_cbFindVisible, IntPtr.Zero);
    GC.KeepAlive(_cbFindVisible);
    if (best != IntPtr.Zero) return best; return emptyTitle;
  }
  public static IntPtr[] FindAllVisibleHwnds(uint[] pids) {
    var set = new HashSet<uint>(pids); var list = new List<IntPtr>();
    _cbFindAll = (h, l) => {
      if (!IsWindowVisible(h) && !IsIconic(h)) return true;
      uint pid; GetWindowThreadProcessId(h, out pid); if (!set.Contains(pid)) return true;
      list.Add(h); return true;
    };
    EnumWindows(_cbFindAll, IntPtr.Zero);
    GC.KeepAlive(_cbFindAll);
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
    _cbFindTitle = (h, l) => {
      if (!IsWindowVisible(h) && !IsIconic(h)) return true;
      var cls = new StringBuilder(64);
      GetClassName(h, cls, 64);
      if (cls.ToString().IndexOf("Chrome_WidgetWin") < 0) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      if (!TitleMatchesLabel(sb.ToString(), label)) return true;
      list.Add(h);
      return true;
    };
    EnumWindows(_cbFindTitle, IntPtr.Zero);
    GC.KeepAlive(_cbFindTitle);
    return list.ToArray();
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct GROUP_AFFINITY {
    public UIntPtr Mask;
    public ushort Group;
    public ushort Reserved0;
    public ushort Reserved1;
    public ushort Reserved2;
  }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct PROCESSENTRY32 {
    public uint dwSize;
    public uint cntUsage;
    public uint th32ProcessID;
    public IntPtr th32DefaultHeapID;
    public uint th32ModuleID;
    public uint cntThreads;
    public uint th32ParentProcessID;
    public int pcPriClassBase;
    public uint dwFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
    public string szExeFile;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct THREADENTRY32 {
    public uint dwSize;
    public uint cntUsage;
    public uint th32ThreadID;
    public uint th32OwnerProcessID;
    public int tpBasePri;
    public int tpDeltaPri;
    public uint dwFlags;
  }
  [DllImport("kernel32.dll")] public static extern ushort GetActiveProcessorGroupCount();
  [DllImport("kernel32.dll")] public static extern uint GetActiveProcessorCount(ushort GroupNumber);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)] public static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool Thread32First(IntPtr hSnapshot, ref THREADENTRY32 lpte);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool Thread32Next(IntPtr hSnapshot, ref THREADENTRY32 lpte);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenThread(uint dwDesiredAccess, bool bInheritHandle, uint dwThreadId);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr hObject);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetThreadGroupAffinity(IntPtr hThread, ref GROUP_AFFINITY GroupAffinity, out GROUP_AFFINITY PreviousGroupAffinity);

  public static int AssignProcessTreeToGroup(int rootPid, int targetGroupSeq) {
    if (rootPid <= 0) return 0;
    ushort groupCount = GetActiveProcessorGroupCount();
    if (groupCount <= 1) return 0;
    ushort group = (ushort)(((uint)Math.Abs(targetGroupSeq)) % groupCount);
    uint procCount = GetActiveProcessorCount(group);
    if (procCount == 0) return 0;
    ulong mask = procCount >= 64 ? ulong.MaxValue : ((1UL << (int)procCount) - 1UL);
    var aff = new GROUP_AFFINITY { Mask = (UIntPtr)mask, Group = group };
    IntPtr snap = CreateToolhelp32Snapshot(0x00000002u | 0x00000004u, 0);
    if (snap == IntPtr.Zero || snap == new IntPtr(-1)) return 0;
    int moved = 0;
    try {
      var parentByPid = new Dictionary<uint, uint>();
      var pe = new PROCESSENTRY32 { dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32)) };
      if (Process32First(snap, ref pe)) {
        do {
          if (pe.th32ProcessID == (uint)rootPid || (!string.IsNullOrEmpty(pe.szExeFile) && pe.szExeFile.StartsWith("chrom", StringComparison.OrdinalIgnoreCase))) {
            parentByPid[pe.th32ProcessID] = pe.th32ParentProcessID;
          }
        } while (Process32Next(snap, ref pe));
      }
      var targetPids = new HashSet<uint> { (uint)rootPid };
      bool added = true;
      while (added) {
        added = false;
        foreach (var kv in parentByPid) {
          if (!targetPids.Contains(kv.Key) && targetPids.Contains(kv.Value)) {
            targetPids.Add(kv.Key);
            added = true;
          }
        }
      }
      var te = new THREADENTRY32 { dwSize = (uint)Marshal.SizeOf(typeof(THREADENTRY32)) };
      if (Thread32First(snap, ref te)) {
        do {
          if (targetPids.Contains(te.th32OwnerProcessID)) {
            IntPtr ht = OpenThread(0x0060u, false, te.th32ThreadID);
            if (ht != IntPtr.Zero) {
              GROUP_AFFINITY prev;
              if (SetThreadGroupAffinity(ht, ref aff, out prev)) moved++;
              CloseHandle(ht);
            }
          }
        } while (Thread32Next(snap, ref te));
      }
    } finally {
      CloseHandle(snap);
    }
    return moved;
  }
}
"@ -OutputAssembly $dll -OutputType Library
    } catch {
      if (-not (Test-Path -LiteralPath $dll)) { throw }
    }
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
    # If DevToolsActivePort exists on disk, Chromium is already running; no HWND means headless.
    # Return OK_ICON so older packaged builds do not retry 9x or spawn WMI focusProfileBrowserWindow.
    if (Test-Path -LiteralPath (Join-Path $dir 'DevToolsActivePort')) {
      return @{ result = 'OK_ICON'; wmiSkipped = $true }
    }
    return @{ result = 'NOHWND'; wmiSkipped = $true }
  }

  $hiBig = [IntPtr]::Zero
  $hiSmall = [IntPtr]::Zero
  $icoExists = [bool]($Ico -and (Test-Path -LiteralPath $Ico))
  if ($icoExists) {
    $hiBig = [StealthTaskbarWin]::LoadCachedIcon($Ico, 48, 48)
    if ($hiBig -eq [IntPtr]::Zero) { $hiBig = [StealthTaskbarWin]::LoadCachedIcon($Ico, 32, 32) }
    if ($hiBig -eq [IntPtr]::Zero) { $hiBig = [StealthTaskbarWin]::LoadCachedIcon($Ico, 24, 24) }
    if ($hiBig -eq [IntPtr]::Zero) { $hiBig = [StealthTaskbarWin]::LoadCachedIcon($Ico, 0, 0) }
    $hiSmall = [StealthTaskbarWin]::LoadCachedIcon($Ico, 16, 16)
    if ($hiSmall -eq [IntPtr]::Zero) { $hiSmall = [StealthTaskbarWin]::LoadCachedIcon($Ico, 20, 20) }
    if ($hiSmall -eq [IntPtr]::Zero) { $hiSmall = [StealthTaskbarWin]::LoadCachedIcon($Ico, 24, 24) }
  }
  # ICO is on disk but this worker can no longer create an HICON. Do not report OK_TITLE
  # (that marks the profile done-enough and the guard stops treating it as missing).
  if ($icoExists -and $hiBig -eq [IntPtr]::Zero -and $hiSmall -eq [IntPtr]::Zero -and [StealthTaskbarWin]::GuiObjectCount() -ge 8000) {
    return @{ result = 'GDI_EXHAUSTED'; wmiSkipped = $wmiSkipped }
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
