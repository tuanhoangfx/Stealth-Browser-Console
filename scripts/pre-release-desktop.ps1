#!/usr/bin/env pwsh
# Stop Stealth Browser + dev processes that lock dist-desktop / CloakBrowser profiles.
Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

$names = @(
  "Stealth Browser Console",
  "electron"
)

foreach ($name in $names) {
  Get-Process -Name $name -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -match 'P0003|Stealth-Browser-Console|stealth-browser' } |
    ForEach-Object {
      Write-Host "pre-release: stop $($_.ProcessName) pid=$($_.Id)"
      Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 2

$locked = @(
  (Join-Path $PSScriptRoot "..\dist-desktop\win-unpacked"),
  (Join-Path $PSScriptRoot "..\dist-desktop")
)

foreach ($dir in $locked) {
  if (Test-Path -LiteralPath $dir) {
    Write-Host "pre-release: dist-desktop present at $dir"
  }
}

Write-Host "pre-release: OK - close any remaining Stealth Browser window if packaging still hits EBUSY."
