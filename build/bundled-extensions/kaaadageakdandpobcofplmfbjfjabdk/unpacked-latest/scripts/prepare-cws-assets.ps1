# Copy CWS graphic assets to Desktop for manual upload in Developer Dashboard.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Desktop = [Environment]::GetFolderPath("Desktop")
$iconSrc = Join-Path $Root "icons\icon128.png"
$shotSrc = Join-Path $Root "docs\store\assets\screenshot-1.png"

$iconDst = Join-Path $Desktop "CWS-E0001-ICON-128.png"
$shotDst = Join-Path $Desktop "CWS-E0001-SCREENSHOT-1.png"

Copy-Item $iconSrc $iconDst -Force
if (Test-Path $shotSrc) {
  Copy-Item $shotSrc $shotDst -Force
} else {
  Copy-Item $iconSrc $shotDst -Force
}

Write-Host "Desktop assets:"
Write-Host "  $iconDst"
Write-Host "  $shotDst"
