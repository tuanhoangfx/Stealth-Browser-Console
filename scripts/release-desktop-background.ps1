param(
  [string]$Version = "",
  [ValidateSet("", "patch", "minor", "major")]
  [string]$Bump = "",
  [switch]$Publish,
  [switch]$SkipInstall,
  [switch]$SkipTests,
  [switch]$SkipBuild,
  [switch]$WithPortable,
  [switch]$SkipPreRelease,
  [switch]$FastTests
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$OutDir = Join-Path $RepoRoot "dist-desktop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$versionHint = ""
try {
  $versionHint = (Get-Content -Raw (Join-Path $RepoRoot "package.json") | ConvertFrom-Json).version
} catch {
  $versionHint = "unknown"
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$LogFile = Join-Path $OutDir "release-$versionHint-$stamp.log"
$StatusFile = Join-Path $OutDir "release-status.json"
$forwardArgs = @()
if ($Version.Trim()) { $forwardArgs += "-Version"; $forwardArgs += $Version.Trim() }
if ($Bump.Trim()) { $forwardArgs += "-Bump"; $forwardArgs += $Bump.Trim() }
if ($Publish) { $forwardArgs += "-Publish" }
if ($SkipInstall) { $forwardArgs += "-SkipInstall" }
if ($SkipTests) { $forwardArgs += "-SkipTests" }
if ($SkipBuild) { $forwardArgs += "-SkipBuild" }
if ($WithPortable) { $forwardArgs += "-WithPortable" }
if ($SkipPreRelease) { $forwardArgs += "-SkipPreRelease" }
if ($FastTests) { $forwardArgs += "-FastTests" }

$startedAt = (Get-Date).ToUniversalTime().ToString("o")
$env:STEALTH_RELEASE_LOG = $LogFile
$env:STEALTH_RELEASE_STATUS = $StatusFile
$env:STEALTH_RELEASE_STARTED_AT = $startedAt
$env:STEALTH_RELEASE_ARGS = ($forwardArgs -join " ")

@{
  state     = "starting"
  logFile   = $LogFile
  statusFile = $StatusFile
  startedAt = $startedAt
  args      = $forwardArgs
} | ConvertTo-Json -Depth 4 | Set-Content -Path $StatusFile -Encoding UTF8

Add-Content -Path $LogFile -Value "=== Stealth Browser Console release (background) ===`nstarted: $startedAt`nargs: $($forwardArgs -join ' ')`n"

$detachedScript = Join-Path $PSScriptRoot "release-desktop-detached.ps1"
$argList = @("-ExecutionPolicy", "Bypass", "-NoProfile", "-File", $detachedScript) + $forwardArgs

$proc = Start-Process -FilePath "powershell.exe" `
  -ArgumentList $argList `
  -WorkingDirectory $RepoRoot `
  -WindowStyle Hidden `
  -PassThru

@{
  state     = "running"
  pid       = $proc.Id
  logFile   = $LogFile
  statusFile = $StatusFile
  startedAt = $startedAt
  args      = $forwardArgs
} | ConvertTo-Json -Depth 4 | Set-Content -Path $StatusFile -Encoding UTF8

Write-Host ""
Write-Host "Release started in background (PID $($proc.Id))" -ForegroundColor Green
Write-Host "  Log:    $LogFile"
Write-Host "  Status: $StatusFile"
Write-Host ""
Write-Host "Tail log:       Get-Content -Path '$LogFile' -Wait -Tail 40"
Write-Host "Check status:   pnpm desktop:release:status"
Write-Host "Watch status:   pnpm desktop:release:status -- --watch"
Write-Host ""
