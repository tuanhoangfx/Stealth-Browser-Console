# Persistent PowerShell worker — reads JSON lines from stdin, writes JSON responses to stdout.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'stealth-taskbar-apply-lib.ps1')
Ensure-StealthTaskbarWinType | Out-Null
Write-Output '{"ready":true}'

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  try {
    $req = $line | ConvertFrom-Json
    if ($req.warm -eq $true) {
      Write-Output (@{ id = $req.id; result = 'OK_WARM'; wmiSkipped = $true } | ConvertTo-Json -Compress)
      continue
    }
    $out = Invoke-StealthTaskbarApply `
      -UserDataDir ([string]$req.UserDataDir) `
      -Title ([string]$req.Title) `
      -Ico ([string]$req.Ico) `
      -AppId ([string]$req.AppId) `
      -HintPid ([int]($req.HintPid))
    Write-Output (@{
      id = $req.id
      result = $out.result
      wmiSkipped = [bool]$out.wmiSkipped
    } | ConvertTo-Json -Compress)
  } catch {
    Write-Output (@{ id = $req.id; result = 'ERROR'; error = $_.Exception.Message; wmiSkipped = $false } | ConvertTo-Json -Compress)
  }
}
