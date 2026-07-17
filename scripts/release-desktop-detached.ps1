# Internal wrapper — tee release output to log and write status JSON (used by release-desktop-background.ps1).
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ReleaseArgs
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogFile = $env:STEALTH_RELEASE_LOG
$StatusFile = $env:STEALTH_RELEASE_STATUS

if (-not $LogFile -or -not $StatusFile) {
  throw "STEALTH_RELEASE_LOG and STEALTH_RELEASE_STATUS must be set"
}

function Write-Status {
  param(
    [string]$State,
    [int]$ExitCode = 0,
    [string]$Error = ""
  )
  $payload = @{
    state     = $State
    exitCode  = $ExitCode
    logFile   = $LogFile
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  if ($Error) { $payload.error = $Error }
  if ($env:STEALTH_RELEASE_STARTED_AT) { $payload.startedAt = $env:STEALTH_RELEASE_STARTED_AT }
  if ($env:STEALTH_RELEASE_ARGS) { $payload.args = $env:STEALTH_RELEASE_ARGS }
  $payload | ConvertTo-Json -Depth 4 | Set-Content -Path $StatusFile -Encoding UTF8
}

Push-Location $RepoRoot
try {
  Write-Status -State "running" -ExitCode 0
  Add-Content -Path $LogFile -Value "`n==> release-desktop-detached $(Get-Date -Format o) args: $($ReleaseArgs -join ' ')`n"

  & (Join-Path $PSScriptRoot "release-desktop.ps1") @ReleaseArgs *>&1 | Tee-Object -FilePath $LogFile -Append
  $exit = $LASTEXITCODE
  if ($exit -ne 0) {
    Write-Status -State "failed" -ExitCode $exit -Error "release-desktop.ps1 exit $exit"
    exit $exit
  }
  Write-Status -State "done" -ExitCode 0
  Copy-Item -Path $LogFile -Destination (Join-Path (Split-Path $LogFile -Parent) "release-latest.log") -Force
  exit 0
}
catch {
  $msg = $_.Exception.Message
  $_ | Tee-Object -FilePath $LogFile -Append
  Write-Status -State "failed" -ExitCode 1 -Error $msg
  Copy-Item -Path $LogFile -Destination (Join-Path (Split-Path $LogFile -Parent) "release-latest.log") -Force -ErrorAction SilentlyContinue
  exit 1
}
finally {
  Pop-Location
}
