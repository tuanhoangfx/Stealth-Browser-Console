param(
  [switch]$Install,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Find-VsWhere {
  foreach ($p in @(
      "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe",
      "$env:ProgramFiles\Microsoft Visual Studio\Installer\vswhere.exe"
    )) {
    if (Test-Path -LiteralPath $p) { return $p }
  }
  return $null
}

function Get-VcToolsInstallPath {
  $vswhere = Find-VsWhere
  if (-not $vswhere) { return $null }
  $path = & $vswhere -latest -products * `
    -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 `
    -property installationPath 2>$null
  if ($path -and (Test-Path -LiteralPath $path)) { return $path.Trim() }
  return $null
}

function Write-Info([string]$Message) {
  if (-not $Quiet) { Write-Host $Message }
}

$installPath = Get-VcToolsInstallPath
if ($installPath) {
  Write-Info "ensure-vs-build-tools: OK ($installPath)"
  exit 0
}

if (-not $Install) {
  Write-Host ""
  Write-Host "ensure-vs-build-tools: Visual Studio Build Tools (C++ x64) required for electron native rebuild (better-sqlite3)." -ForegroundColor Yellow
  Write-Host "Fix: powershell -ExecutionPolicy Bypass -File scripts/ensure-vs-build-tools.ps1 -Install"
  Write-Host "Or install manually: Visual Studio 2022 Build Tools with Desktop development with C++ workload."
  Write-Host ""
  exit 1
}

Write-Info "ensure-vs-build-tools: installing VS 2022 Build Tools (C++ workload, passive)..."
$winget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $winget) {
  throw "winget not found. Install Visual Studio Build Tools manually."
}

$override = "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
& winget install --id Microsoft.VisualStudio.2022.BuildTools -e --source winget `
  --accept-package-agreements --accept-source-agreements `
  --override $override
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) {
  Write-Info "ensure-vs-build-tools: winget failed (exit $LASTEXITCODE), trying vs_buildtools bootstrapper..."
  $bootstrap = Join-Path $env:TEMP "vs_buildtools.exe"
  Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vs_buildtools.exe" -OutFile $bootstrap -UseBasicParsing
  & $bootstrap $override.Split(" ")
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) {
    throw "VS Build Tools install failed (exit $LASTEXITCODE)"
  }
}

$installPath = Get-VcToolsInstallPath
if (-not $installPath) {
  throw "Build Tools install finished but VC++ tools not detected. Restart shell and retry."
}

Write-Info "ensure-vs-build-tools: installed OK ($installPath)"
exit 0
