#!/usr/bin/env pwsh
# Check-only preflight for desktop packaging — NEVER stops dev (:5175) or running packaged exe.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$distDesktop = Join-Path $repoRoot "dist-desktop"
$winUnpacked = Join-Path $distDesktop "win-unpacked"
$winPending = Join-Path $distDesktop "win-unpacked-pending"

Write-Host "pre-release: check-only - will NOT stop Stealth dev or packaged exe."

$running = @()
foreach ($name in @("Stealth Browser Console", "electron", "node")) {
  Get-Process -Name $name -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -match 'P0003|Stealth-Browser-Console|stealth-browser' } |
    ForEach-Object { $running += $_ }
}

if ($running.Count -gt 0) {
  Write-Host "pre-release: running P0003-related processes (left untouched):"
  $running | Sort-Object Id -Unique | ForEach-Object {
    Write-Host "  - $($_.ProcessName) pid=$($_.Id)"
  }
  if (Test-Path -LiteralPath $winUnpacked) {
    Write-Host "pre-release: if packaging hits EBUSY, output goes to dist-desktop\win-unpacked-pending"
    Write-Host "pre-release: then run: pnpm desktop:swap-unpacked"
  }
} else {
  Write-Host "pre-release: no P0003 Stealth/electron processes detected."
}

foreach ($dir in @($winUnpacked, $winPending, $distDesktop)) {
  if (Test-Path -LiteralPath $dir) {
    Write-Host "pre-release: present $dir"
  }
}

Write-Host "pre-release: OK (non-destructive)."
