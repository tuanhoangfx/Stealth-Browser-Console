param(
  [switch]$Install,
  [switch]$PurgeSurfshark,
  [switch]$Verify,
  [switch]$GitCheckout,
  [switch]$LaunchOnly
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ConfigPath = Join-Path $RepoRoot "config\known-good.json"

if (-not (Test-Path $ConfigPath)) {
  throw "Missing $ConfigPath — run: node scripts/snapshot-known-good.mjs"
}

$cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$backupRoot = Join-Path $RepoRoot ($cfg.backup.dir -replace "/", "\")
$installer = Join-Path $backupRoot $cfg.backup.installer
$unpackedExe = Join-Path $backupRoot $cfg.backup.winUnpacked "Stealth Browser Console.exe"

Write-Host ""
Write-Host "==> Known-good restore: $($cfg.label) v$($cfg.version)" -ForegroundColor Cyan
if ($cfg.gitCommit) { Write-Host "    git: $($cfg.gitCommit)" }
if ($cfg.backup.capturedAt) { Write-Host "    snapshot: $($cfg.backup.capturedAt)" }

function Stop-Stealth {
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and $_.Path -match "Stealth Browser Console"
  } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

Stop-Stealth

if ($GitCheckout) {
  if (-not $cfg.gitCommit) {
    Write-Warning "known-good.json has no gitCommit — commit+tag first, then re-run snapshot-known-good.mjs"
  } else {
    Write-Host "==> git checkout $($cfg.gitTag) ($($cfg.gitCommit))" -ForegroundColor Cyan
    Push-Location $RepoRoot
    try {
      git fetch origin 2>$null
      if ($cfg.gitTag) {
        git checkout $cfg.gitTag 2>$null
        if ($LASTEXITCODE -ne 0) { git checkout $cfg.gitCommit }
      } else {
        git checkout $cfg.gitCommit
      }
      if ($LASTEXITCODE -ne 0) { throw "git checkout failed" }
    } finally {
      Pop-Location
    }
  }
}

if (-not (Test-Path $installer) -and -not (Test-Path $unpackedExe)) {
  throw @"
No backup found under $($cfg.backup.dir).
Run once when stable:
  pnpm desktop:dist
  node scripts/snapshot-known-good.mjs
"@
}

if ($cfg.backup.sha512 -and (Test-Path $installer)) {
  $bytes = [IO.File]::ReadAllBytes($installer)
  $sha = [Convert]::ToBase64String(([Security.Cryptography.SHA512]::Create().ComputeHash($bytes)))
  if ($sha -ne $cfg.backup.sha512) {
    Write-Warning "Installer SHA512 mismatch — backup may be stale. Re-run snapshot-known-good.mjs"
  } else {
    Write-Host "    installer SHA512 OK" -ForegroundColor DarkGreen
  }
}

if ($Install -and (Test-Path $installer)) {
  Write-Host "==> Install $installer" -ForegroundColor Cyan
  $proc = Start-Process -FilePath $installer -ArgumentList "/CURRENTUSER", "/S" -PassThru -Wait
  Write-Host "    installer exit: $($proc.ExitCode)"
} elseif ($Install) {
  Write-Warning "No installer backup — use -LaunchOnly or build snapshot with desktop:dist"
}

if ($PurgeSurfshark) {
  Write-Host "==> Purge Surfshark runtime" -ForegroundColor Cyan
  Push-Location $RepoRoot
  node scripts/purge-surfshark-runtime.mjs
  Pop-Location
}

if ($Verify) {
  Write-Host "==> Verify packaged auth smoke" -ForegroundColor Cyan
  Push-Location $RepoRoot
  if (-not (Test-Path "dist\index.html")) { pnpm build }
  node scripts/smoke-packaged-auth.mjs dist/index.html
  if ($LASTEXITCODE -ne 0) { throw "smoke-packaged-auth failed" }
  Pop-Location
}

if ($LaunchOnly -or (-not $Install)) {
  if (Test-Path $unpackedExe) {
    Write-Host "==> Launch $unpackedExe" -ForegroundColor Cyan
    Start-Process $unpackedExe
  } elseif (Test-Path "$env:LOCALAPPDATA\Programs\Stealth Browser Console\Stealth Browser Console.exe") {
    Start-Process "$env:LOCALAPPDATA\Programs\Stealth Browser Console\Stealth Browser Console.exe"
  }
}

Write-Host ""
Write-Host "Restore done. Typical full rollback:" -ForegroundColor Green
Write-Host "  powershell -File scripts/restore-known-good.ps1 -GitCheckout -Install -PurgeSurfshark -Verify"
