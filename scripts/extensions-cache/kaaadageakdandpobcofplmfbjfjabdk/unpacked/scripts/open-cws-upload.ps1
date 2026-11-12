# Open CWS upload — Desktop ZIP only (validated single manifest at root).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
& (Join-Path $Root "scripts\package-store.ps1") | Out-Host

$desktopZip = Join-Path ([Environment]::GetFolderPath("Desktop")) "CWS-E0001-Cookie-Bridge-UPLOAD-THIS.zip"
if (-not (Test-Path $desktopZip)) {
  throw "Desktop ZIP missing: $desktopZip"
}

Set-Clipboard -Value $desktopZip
Write-Host ""
Write-Host ">>> Select file on DESKTOP: CWS-E0001-Cookie-Bridge-UPLOAD-THIS.zip"
Write-Host ">>> Path copied to clipboard."
Write-Host ""

Start-Process "explorer.exe" -ArgumentList "/select,`"$desktopZip`""
Start-Process "https://chrome.google.com/webstore/devconsole/2a7913fe-ce44-44df-817f-c62be3f9cef2"
