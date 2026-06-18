# Create Desktop shortcut to the latest unpacked Stealth Browser Console build.
param(
  [string]$ExePath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exeName = "Stealth Browser Console.exe"

if (-not $ExePath) {
  $candidates = @(
    (Join-Path $root "dist-desktop\win-unpacked\$exeName"),
    (Join-Path $root "out\win-unpacked\$exeName")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      $ExePath = $candidate
      break
    }
  }
}

if (-not $ExePath -or -not (Test-Path $ExePath)) {
  Write-Error "Desktop exe not found. Run: pnpm desktop:dist"
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "Stealth Browser Console.lnk"
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $ExePath
$shortcut.WorkingDirectory = Split-Path -Parent $ExePath
$shortcut.Description = "Stealth Browser Console - CloakBrowser profile manager"
$shortcut.Save()

Write-Host "Desktop shortcut created:"
Write-Host "  $shortcutPath"
Write-Host "  -> $ExePath"
