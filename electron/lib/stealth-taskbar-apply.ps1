# Apply Win32 taskbar icon + title for a Cloak profile window. C# interop DLL cached in %TEMP%.
param(
  [Parameter(Mandatory = $true)][string]$UserDataDir,
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Ico,
  [Parameter(Mandatory = $true)][string]$AppId,
  [int]$HintPid = 0,
  [switch]$WarmOnly
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'stealth-taskbar-apply-lib.ps1')

if ($WarmOnly) {
  Ensure-StealthTaskbarWinType | Out-Null
  Write-Output 'OK_WARM'
  exit 0
}

$out = Invoke-StealthTaskbarApply -UserDataDir $UserDataDir -Title $Title -Ico $Ico -AppId $AppId -HintPid $HintPid
Write-Output $out.result
