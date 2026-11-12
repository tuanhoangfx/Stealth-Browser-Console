# Package E0001 Cookie Bridge ZIP for Chrome Web Store upload.
# Usage:
#   .\scripts\package-store.ps1
#   .\scripts\package-store.ps1 -Version 1.1.2

param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$manifest = Get-Content -Raw -Path "manifest.json" | ConvertFrom-Json
if (-not $Version) {
  $Version = [string]$manifest.version
}
if (-not $Version) {
  throw "Could not read version from manifest.json"
}

$distDir = Join-Path $Root "dist"
$stageDir = Join-Path $distDir "E0001-cookie-bridge-store"
$zipName = "E0001-cookie-bridge-store-v$Version.zip"
$zipPath = Join-Path $distDir $zipName

# Runtime files only — no docs, git, cursor rules, or dev scripts.
# Keep in sync with popup.js / background.js imports (validate-store-package.mjs).
$includeFiles = @(
  "manifest.json",
  "background.js",
  "content-bridge.js",
  "popup.html",
  "popup.js",
  "popup-theme.css",
  "hub-shell-chrome-lite.css",
  "hub-user-zoom-lite.js",
  "hub-auth-logout-chip.js",
  "hub-route-status-chip.js",
  "hub-route-status-icons.js",
  "hub-directory-column-hints.js",
  "hub-directory-popover.css",
  "hub-workspace-user-modal.js",
  "hub-workspace-profile-role.js",
  "hub-workspace-user-modal.css",
  "toast.js",
  "options.html",
  "options.js",
  "options-theme.css",
  "auth-session.js",
  "domain-routes.js",
  "route-access.js",
  "vault-api.js",
  "vault-realtime.js",
  "vault-crypto.js",
  "schema-probe.js",
  "supabase-config.js",
  "build-info.js",
  "cookie-brand-icons.generated.js",
  "cookie-share-panel.js"
)

$includeDirs = @(
  "icons",
  "vendor",
  "assets",
  "hub-vanilla"
)

# Auto-discover all runtime files from ES module / HTML / CSS import graph so new imports are never missed.
$tracedRaw = node (Join-Path $PSScriptRoot "validate-store-package.mjs") $Root --print-files
if ($LASTEXITCODE -ne 0) { throw "Import graph discovery failed on $Root" }
$tracedTopFiles = @(
  $tracedRaw |
    ForEach-Object { ([string]$_).Trim() } |
    Where-Object { $_ -and ($_ -notmatch '/') }
)
$includeFiles = @($includeFiles + $tracedTopFiles | Select-Object -Unique)

function Test-RequiredPath([string]$RelativePath) {
  $full = Join-Path $Root $RelativePath
  if (-not (Test-Path $full)) {
    throw "Missing required store file: $RelativePath"
  }
}

foreach ($file in $includeFiles) {
  Test-RequiredPath $file
}
foreach ($dir in $includeDirs) {
  if (Test-Path (Join-Path $Root $dir)) {
    Test-RequiredPath $dir
  }
}

if (Test-Path $distDir) {
  Remove-Item -Recurse -Force $distDir
}
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

foreach ($file in $includeFiles) {
  Copy-Item -Path (Join-Path $Root $file) -Destination (Join-Path $stageDir $file) -Force
}

foreach ($dir in $includeDirs) {
  $src = Join-Path $Root $dir
  if (Test-Path $src) {
    Copy-Item -Path $src -Destination (Join-Path $stageDir $dir) -Recurse -Force
  }
}

Write-Host "Validating store package dependencies..."
node (Join-Path $PSScriptRoot "validate-store-package.mjs") $stageDir
if ($LASTEXITCODE -ne 0) { throw "Store package validation failed" }

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force

# CWS requires exactly one manifest.json at ZIP root (not nested project folder).
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $manifests = @($zip.Entries | Where-Object { $_.Name -eq "manifest.json" })
  if ($manifests.Count -ne 1) {
    throw "Invalid store ZIP: expected 1 manifest.json, found $($manifests.Count). Paths: $(($manifests | ForEach-Object { $_.FullName }) -join ', ')"
  }
  $rootManifest = $manifests[0].FullName
  if ($rootManifest -ne "manifest.json") {
    throw "Invalid store ZIP: manifest must be at ZIP root (manifest.json), got: $rootManifest"
  }
  $nested = @($zip.Entries | Where-Object { $_.FullName -match '^E0001-cookie-bridge/' })
  if ($nested.Count -gt 0) {
    throw "Invalid store ZIP: contains nested project folder. Use package-store.ps1 output only, not the whole repo."
  }
} finally {
  $zip.Dispose()
}

# Desktop copy — obvious name so user cannot pick the wrong ZIP / folder (local Windows only).
$desktopZip = $null
if ($env:E0001_COPY_TO_DESKTOP -eq "1" -and -not $env:CI -and -not $env:GITHUB_ACTIONS) {
  try {
    $desktop = [Environment]::GetFolderPath("Desktop")
    if ($desktop -and (Test-Path -LiteralPath $desktop -ErrorAction SilentlyContinue)) {
      $desktopZip = Join-Path $desktop "CWS-E0001-Cookie-Bridge-UPLOAD-THIS.zip"
      Copy-Item -Path $zipPath -Destination $desktopZip -Force
    }
  } catch {
    Write-Host "Desktop copy skipped: $($_.Exception.Message)"
  }
}

$shaPath = "$zipPath.sha256"
$hash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -Path $shaPath -Value "$hash  $zipName" -Encoding ascii

Write-Host ""
Write-Host "Chrome Web Store package ready - E0001 Cookie Bridge v$Version"
Write-Host "  ZIP: $zipPath"
Write-Host "  SHA: $shaPath"
Write-Host "  Validated: 1 x manifest.json at ZIP root"
if ($desktopZip) {
  Write-Host "  Desktop: $desktopZip"
  Write-Host ""
  Write-Host "UPLOAD THIS FILE ONLY (on Desktop):"
  Write-Host "  CWS-E0001-Cookie-Bridge-UPLOAD-THIS.zip"
}
Write-Host ""
Write-Host "NEVER upload: E0001-cookie-bridge folder, dist folder, or GitHub E0001-cookie-bridge-v*.zip"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Open https://chrome.google.com/webstore/devconsole"
Write-Host "  2. New item -> Upload $zipName"
Write-Host "  3. Paste listing copy from docs/store/LISTING.md"
Write-Host '  4. Privacy policy URL from docs/store/PRIVACY-POLICY.md'
Write-Host ""
