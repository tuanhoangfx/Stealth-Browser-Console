param(
  [Parameter(Mandatory = $true)][string]$ProfileId,
  [Parameter(Mandatory = $true)][string]$Code,
  [string]$UserDataDir = "",
  [string]$Tooltip = "",
  [string]$ChipText = "",
  [switch]$Debug,
  [switch]$Clear
)

$ErrorActionPreference = 'SilentlyContinue'
$debug = $Debug -or ($env:STEALTH_IDENTITY_DEBUG -eq '1' -or $env:STEALTH_IDENTITY_DEBUG -eq 'true')
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.Drawing.Drawing2D;
public class StealthTb {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr param);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [ComImport, Guid("56FDF342-FD6D-11d0-958A-006097C9A090"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface ITaskbarList3 {
    void HrInit();
    void AddTab(IntPtr hwnd);
    void DeleteTab(IntPtr hwnd);
    void ActivateTab(IntPtr hwnd);
    void SetActiveAlt(IntPtr hwnd);
    void MarkFullscreenWindow(IntPtr hwnd, [MarshalAs(UnmanagedType.Bool)] bool fFullscreen);
    void SetProgressValue(IntPtr hwnd, UInt64 ullCompleted, UInt64 ullTotal);
    void SetProgressState(IntPtr hwnd, int tbpFlags);
    void RegisterTab(IntPtr hwndTab, IntPtr hwndMDI);
    void UnregisterTab(IntPtr hwndTab);
    void SetTabOrder(IntPtr hwndTab, IntPtr hwndInsertBefore);
    void SetTabActive(IntPtr hwndTab, IntPtr hwndMDI, int dwFlags);
    void ThumbbarAddButtons(IntPtr hwnd, uint cButtons, IntPtr pButton);
    void ThumbbarUpdateButtons(IntPtr hwnd, uint cButtons, IntPtr pButton);
    void ThumbbarSetImageList(IntPtr hwnd, IntPtr himl);
    void SetOverlayIcon(IntPtr hwnd, IntPtr hIcon, [MarshalAs(UnmanagedType.LPWStr)] string pszDescription);
    void SetThumbnailTooltip(IntPtr hwnd, [MarshalAs(UnmanagedType.LPWStr)] string pszTip);
    void SetThumbnailClip(IntPtr hwnd, IntPtr prcClip);
  }
  /// Chrome-style taskbar corner badge — squircle code tile (Design V2 parity).
  public static IntPtr CreateOverlayBadge(string code) {
    int size = 16;
    string label = string.IsNullOrWhiteSpace(code) ? "00" : code.Trim();
    if (label.Length > 4) label = label.Substring(label.Length - 4);
    using (var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb)) {
      using (var g = Graphics.FromImage(bmp)) {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        g.Clear(Color.Transparent);
        int pad = Math.Max(1, size / 14);
        var rect = new RectangleF(pad, pad, size - pad * 2, size - pad * 2);
        int r = Math.Max(3, (int)(rect.Width * 0.22f));
        using (var path = new GraphicsPath()) {
          path.AddArc(rect.Left, rect.Top, r * 2, r * 2, 180, 90);
          path.AddArc(rect.Right - r * 2, rect.Top, r * 2, r * 2, 270, 90);
          path.AddArc(rect.Right - r * 2, rect.Bottom - r * 2, r * 2, r * 2, 0, 90);
          path.AddArc(rect.Left, rect.Bottom - r * 2, r * 2, r * 2, 90, 90);
          path.CloseFigure();
          using (var brush = new SolidBrush(Color.FromArgb(255, 79, 70, 229)))
          using (var pen = new Pen(Color.FromArgb(255, 199, 210, 254), 1.1f))
            g.FillPath(brush, path);
          g.DrawPath(pen, path);
        }
        float fontSize = label.Length > 3 ? 5.25f : (label.Length > 2 ? 5.75f : 6.25f);
        using (var font = new Font("Segoe UI", fontSize, FontStyle.Bold, GraphicsUnit.Point))
        using (var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center })
          g.DrawString(label, font, Brushes.White, rect, sf);
      }
      return bmp.GetHicon();
    }
  }
  public static void ApplyOverlay(IntPtr hWnd, IntPtr overlayIcon, string tip, bool clear) {
    try {
      var tb = (ITaskbarList3)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("56FDF342-FD6D-11d0-958A-006097C9A090")));
      tb.HrInit();
      if (clear) {
        tb.SetOverlayIcon(hWnd, IntPtr.Zero, null);
        return;
      }
      tb.SetOverlayIcon(hWnd, overlayIcon, tip);
      tb.SetThumbnailTooltip(hWnd, tip);
    } catch {}
  }
}
"@

$needleId = $ProfileId
$needleDir = $UserDataDir
$badge = [string]$Code
if ($badge.Length -gt 5) { $badge = $badge.Substring(0, 5) }
$tip = if ($Tooltip) { [string]$Tooltip } else { "[$badge]" }
$overlay = [IntPtr]::Zero
if (-not $Clear) { $overlay = [StealthTb]::CreateOverlayBadge($badge) }

$pids = New-Object 'System.Collections.Generic.HashSet[int]'
Get-CimInstance Win32_Process | ForEach-Object {
  $cmd = $_.CommandLine
  if (-not $cmd) { return }
  $matchId = $needleId -and ($cmd -like "*$needleId*")
  $matchDir = $needleDir -and ($cmd -like "*$needleDir*")
  if ($matchId -or $matchDir) {
    [void]$pids.Add([int]$_.ProcessId)
    if ($debug) {
      [Console]::Error.WriteLine("[taskbar] pid=$($_.ProcessId) name=$($_.Name) cmd=$cmd")
    }
  }
}

if ($debug) {
  [Console]::Error.WriteLine("[taskbar] matchedProcesses=$($pids.Count) profileId=$needleId badge=$badge overlayOnly=true")
}

$set = 0
$seen = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($procId in $pids) {
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if ($p -and $p.MainWindowHandle -ne [IntPtr]::Zero) {
    $h = $p.MainWindowHandle.ToInt32()
    if (-not $seen.Contains($h)) {
      [StealthTb]::ApplyOverlay($p.MainWindowHandle, $overlay, $tip, [bool]$Clear)
      [void]$seen.Add($h)
      $set++
    }
  }
}

[StealthTb]::EnumWindows({
  param($hWnd, $param)
  if (-not [StealthTb]::IsWindowVisible($hWnd)) { return $true }
  [uint32]$winPid = 0
  [void][StealthTb]::GetWindowThreadProcessId($hWnd, [ref]$winPid)
  if (-not $pids.Contains([int]$winPid)) { return $true }
  $key = $hWnd.ToInt32()
  if ($seen.Contains($key)) { return $true }
  [StealthTb]::ApplyOverlay($hWnd, $overlay, $tip, [bool]$Clear)
  [void]$seen.Add($key)
  $script:set++
  return $true
}, [IntPtr]::Zero) | Out-Null

Write-Output $set
