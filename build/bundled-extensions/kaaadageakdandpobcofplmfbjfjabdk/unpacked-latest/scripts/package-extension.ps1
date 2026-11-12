# Package E0001 Cookie Bridge for GitHub Release (unpacked install ZIP).
# Usage:
#   .\scripts\package-extension.ps1
#   .\scripts\package-extension.ps1 -Version 0.5.61
#   .\scripts\package-extension.ps1 -CreateRelease

param(
  [string]$Version = "",
  [switch]$CreateRelease
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Try-SyncP0020ExtensionVersion([string]$ExtVersion) {
  try {
    $toolRoot = Join-Path $Root "..\..\Tool\P0020-Data-Box"
    $syncScript = Join-Path $toolRoot "scripts\sync-extension-version.mjs"
    if (-not (Test-Path $syncScript)) { return }
    Write-Host "Sync P0020 extensionBuildInfo.ts (v$ExtVersion)..."
    node $syncScript | Out-Host
  } catch {
    Write-Host "WARN: Could not sync P0020 extensionBuildInfo.ts ($($_.Exception.Message))"
  }
}

$manifest = Get-Content -Raw -Path "manifest.json" | ConvertFrom-Json
if (-not $Version) {
  $Version = [string]$manifest.version
}
if (-not $Version) {
  throw "Could not read version from manifest.json"
}

$distDir = Join-Path $Root "dist"
$stageDir = Join-Path $distDir "E0001-cookie-bridge"
$zipName = "E0001-cookie-bridge-v$Version.zip"
$zipPath = Join-Path $distDir $zipName

$excludeDirNames = @(".git", "node_modules", "dist", ".vercel", ".chrome-store-profile")
$excludeFileNames = @(".env", ".env.local", ".env.production")

function Should-SkipPath([string]$FullPath) {
  $rel = $FullPath.Substring($Root.Length).TrimStart("\", "/")
  if (-not $rel) { return $true }
  $parts = $rel -split "[\\/]"
  foreach ($part in $parts) {
    if ($excludeDirNames -contains $part) { return $true }
  }
  $leaf = Split-Path -Leaf $FullPath
  if ($leaf -match '^\.env') { return $true }
  if ($excludeFileNames -contains $leaf) { return $true }
  if ($leaf -match '\.zip$') { return $true }
  if ($leaf -match '\.log$') { return $true }
  return $false
}

if (Test-Path $distDir) {
  Remove-Item -Recurse -Force $distDir
}
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

Get-ChildItem -Path $Root -Force | ForEach-Object {
  if ($_.Name -eq "dist") { return }
  if (Should-SkipPath $_.FullName) { return }
  $dest = Join-Path $stageDir $_.Name
  if ($_.PSIsContainer) {
    Copy-Item -Path $_.FullName -Destination $dest -Recurse -Force
  } else {
    Copy-Item -Path $_.FullName -Destination $dest -Force
  }
}

# Prune nested excluded folders inside stage copy
foreach ($dirName in $excludeDirNames) {
  Get-ChildItem -Path $stageDir -Directory -Recurse -Filter $dirName -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item -Recurse -Force $_.FullName }
}

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force

$shaPath = "$zipPath.sha256"
$hash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -Path $shaPath -Value "$hash  $zipName" -Encoding ascii

Write-Host ""
Try-SyncP0020ExtensionVersion $Version
Write-Host "Packaged E0001 Cookie Bridge v$Version" # Auto-sync P0020 mirror + P0003 stage on every package
Write-Host "  ZIP: $zipPath"
Write-Host "  SHA: $shaPath"
Write-Host ""
Write-Host "User install:"
Write-Host "  1. Download ZIP from GitHub Release"
Write-Host "  2. Extract folder"
Write-Host "  3. chrome://extensions -> Developer mode -> Load unpacked"
Write-Host "  4. Select extracted E0001-cookie-bridge folder"
Write-Host "  5. Open P0020 Data Box /cookie -> Link extension"
Write-Host ""

  if ($CreateRelease) {
  $tag = "v$Version"
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  gh release view $tag *> $null
  $releaseExists = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = $prevEap
  if ($releaseExists) {
    gh release upload $tag $zipPath --clobber
    Write-Host "Uploaded asset to existing release $tag"
  } else {
    gh release create $tag $zipPath `
      --title "E0001 Cookie Bridge $tag" `
      --notes "Chrome MV3 extension ZIP for Load unpacked install. Pair with P0020-Data-Box at https://databox.infi.io.vn/cookie"
    Write-Host "Created GitHub release $tag"
  }

  # Keep tool.manifest latestPublished aligned for P0020 downloadVersion sync
  $toolManifestPath = Join-Path $Root "tool.manifest.json"
  if (Test-Path $toolManifestPath) {
    $tool = Get-Content -Raw -Path $toolManifestPath | ConvertFrom-Json
    if (-not $tool.release) { $tool | Add-Member -NotePropertyName release -NotePropertyValue (@{}) }
    $tool.release.latestPublished = @{
      tag = $tag
      url = "https://github.com/tuanhoangfx/E0001-cookie-bridge/releases/tag/$tag"
      publishedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    $tool.manifestUpdatedAt = (Get-Date).ToUniversalTime().ToString("o")
    $jsonOut = $tool | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($toolManifestPath, $jsonOut, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Updated tool.manifest.json latestPublished -> $tag"
  }

  Try-SyncP0020ExtensionVersion $Version
}
