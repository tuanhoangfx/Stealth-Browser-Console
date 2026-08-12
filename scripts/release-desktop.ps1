param(
  [string]$Version = "",
  [ValidateSet("", "patch", "minor", "major")]
  [string]$Bump = "",
  [switch]$Publish,
  [switch]$SkipInstall,
  [switch]$ForceInstall,
  [switch]$SkipTests,
  [switch]$SkipBuild,
  [switch]$WithPortable,
  [switch]$SkipPreRelease,
  [switch]$FastTests,
  # UI-first release budget: skip install/tests/native/sign; prepackaged NSIS when win-unpacked warm.
  # Target: <120s. Opt out: DESKTOP_RELEASE_FAST=0. Force full pack: -IncludeUnpacked.
  [switch]$Fast,
  [switch]$IncludeUnpacked
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ToolScripts = (Resolve-Path (Join-Path $PSScriptRoot "../../scripts")).Path
$RunPnpm = Join-Path $ToolScripts "run-pnpm.mjs"
$ReleaseStarted = Get-Date
$StepTimes = [System.Collections.Generic.List[object]]::new()
$pkgVersion = (Get-Content -Raw (Join-Path $RepoRoot "package.json") | ConvertFrom-Json).version

# Default Fast for Publish unless DESKTOP_RELEASE_FAST=0
if (-not $Fast -and $Publish -and $env:DESKTOP_RELEASE_FAST -ne "0") {
  $Fast = $true
}

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )
  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  $t0 = Get-Date
  & $Action
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "$Name failed (exit $LASTEXITCODE)"
  }
  $sec = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
  $StepTimes.Add([pscustomobject]@{ Step = $Name; Seconds = $sec })
  Write-Host "    ($sec s)" -ForegroundColor DarkGray
}

if ($Publish -and -not $env:GH_TOKEN -and -not $env:GITHUB_TOKEN) {
  throw "Publishing to GitHub Releases requires GH_TOKEN or GITHUB_TOKEN in the current shell."
}

if ($Version.Trim() -and $Bump.Trim()) {
  throw "Use either -Version or -Bump, not both."
}

if ($Fast) {
  Write-Host "==> Fast release mode (installer-only / prepackaged NSIS; skip install+tests+native when warm)" -ForegroundColor DarkYellow
  if (-not $SkipTests) { $SkipTests = $true }
  if (-not $SkipPreRelease) { $SkipPreRelease = $true }
}

$hasDesktopDeps =
  (Test-Path (Join-Path $RepoRoot "node_modules\electron")) -and
  (Test-Path (Join-Path $RepoRoot "node_modules\electron-builder"))
$doInstall = $ForceInstall -or (-not $SkipInstall -and -not $hasDesktopDeps)
if ($Fast -and -not $ForceInstall -and $hasDesktopDeps) {
  $doInstall = $false
}
if (-not $doInstall -and -not $ForceInstall) {
  Write-Host "==> Skip pnpm install (electron deps present; pass -ForceInstall to refresh)" -ForegroundColor DarkYellow
}

Push-Location $RepoRoot
try {
  if (-not $SkipPreRelease) {
    Invoke-Step "Pre-release (check-only - does not stop dev/exe)" {
      powershell -ExecutionPolicy Bypass -File scripts/pre-release-desktop.ps1
    }
  }

  if ($doInstall) {
    Invoke-Step "Install locked dependencies" {
      node $RunPnpm install --frozen-lockfile
    }
  }

  Invoke-Step "Verify cloakbrowser engine pin" {
    node scripts/check-cloakbrowser-pin.mjs
  }

  if ($Version.Trim()) {
    Invoke-Step "Set desktop version to $Version" {
      node $RunPnpm version $Version --no-git-tag-version
      node scripts/sync-app-version.mjs
    }
  }

  if ($Bump.Trim()) {
    Invoke-Step "Bump desktop version ($Bump)" {
      node $RunPnpm version $Bump --no-git-tag-version
      node scripts/sync-app-version.mjs
    }
  }

  # Snapshot version once — parallel agents must not race package.json mid-build.
  $pkgVersion = (Get-Content -Raw package.json | ConvertFrom-Json).version
  $env:STEALTH_RELEASE_VERSION = $pkgVersion

  if (-not $SkipTests) {
    $testLabel = if ($FastTests) { "Quality gates (test:fast)" } else { "Quality gates (test:unit full)" }
    Invoke-Step $testLabel {
      if ($FastTests) {
        node scripts/run-unit-tests.mjs --fast
      } else {
        node scripts/run-unit-tests.mjs
      }
    }

    # Hard launch-speed gate (skipped on Fast — uses last recorded warm open).
    Invoke-Step "Launch-speed regression gate (warm full-open < 1500ms)" {
      node scripts/check-launch-speed.mjs
    }
  }

  $bundledE0001 = Join-Path $RepoRoot "build\bundled-extensions"
  $skipNative = $SkipBuild -or ($Fast -and (Test-Path (Join-Path $RepoRoot "node_modules\better-sqlite3")))
  if (-not $skipNative) {
    Invoke-Step "Verify Visual Studio Build Tools" {
      powershell -ExecutionPolicy Bypass -File scripts/ensure-vs-build-tools.ps1
    }

    Invoke-Step "Rebuild native modules for Electron" {
      node scripts/ensure-better-sqlite3.mjs
    }

    Invoke-Step "Refresh bundled E0001 snapshot" {
      node scripts/sync-bundled-e0001.mjs
    }
  } else {
    Write-Host "==> Skip VS/native/E0001 rebuild (Fast or -SkipBuild; bundled snapshot kept)" -ForegroundColor DarkYellow
    if (-not (Test-Path $bundledE0001)) {
      Invoke-Step "Seed bundled E0001 snapshot (missing)" {
        node scripts/sync-bundled-e0001.mjs
      }
    }
  }

  if ($Publish) {
    $tag = "v$pkgVersion"
    Invoke-Step "Ensure git tag $tag for GitHub Release" {
      $existing = git tag -l $tag
      if (-not $existing) {
        git tag -a $tag -m "P0003 v$pkgVersion desktop release"
        if ($LASTEXITCODE -ne 0) { throw "git tag failed" }
      }
      $remoteTag = git ls-remote --tags origin "refs/tags/$tag"
      if (-not $remoteTag) {
        git push origin $tag
        if ($LASTEXITCODE -ne 0) { throw "git push tag failed" }
      } else {
        Write-Host "Tag $tag already on origin - skip push"
      }
    }
  }

  Invoke-Step "Build Vite UI for desktop" {
    $distJs = Join-Path $RepoRoot "dist\assets"
    $skipVite = $false
    if (($Fast -or $SkipBuild) -and (Test-Path (Join-Path $RepoRoot "dist\index.html")) -and (Test-Path $distJs)) {
      $hit = Get-ChildItem $distJs -Filter "*.js" -ErrorAction SilentlyContinue |
        Where-Object { Select-String -Path $_.FullName -Pattern ([regex]::Escape($pkgVersion)) -Quiet } |
        Select-Object -First 1
      if ($hit) {
        $skipVite = $true
        Write-Host "    Skip Vite (dist already bakes v$pkgVersion)" -ForegroundColor DarkYellow
      }
    }
    if (-not $skipVite) {
      if ($Fast) { $env:DESKTOP_RELEASE_FAST = "1" }
      $buildArgs = @("scripts/run-build.mjs")
      if ($Fast) { $buildArgs += "--fast" }
      node @buildArgs
      if ($LASTEXITCODE -ne 0) { throw "run-build.mjs failed" }
    }
  }

  $PublishMode = if ($Publish) { "always" } else { "never" }
  $packArgs = @("scripts/run-electron-package.mjs", "--publish", $PublishMode, "--skip-build")
  if ($WithPortable) { $packArgs += "--with-portable" }

  $targetLabel = if ($WithPortable) { "NSIS + portable" } else { "NSIS installer only" }
  Invoke-Step "Build Windows $targetLabel (publish: $PublishMode)" {
    if ($Fast -and -not $IncludeUnpacked -and -not $WithPortable) {
      $env:DESKTOP_RELEASE_INSTALLER_ONLY = "1"
      $env:DESKTOP_RELEASE_FAST = "1"
    }
    node @packArgs
  }

  if ($Publish) {
    $tag = "v$pkgVersion"
    Invoke-Step "Sync release metadata (post-gh-release)" {
      node (Join-Path $ToolScripts "post-gh-release.mjs") --product-root $RepoRoot --tag $tag
    }
    Invoke-Step "Verify auto-update feed (latest.yml + installer)" {
      $verifyArgs = @(
        (Join-Path $ToolScripts "verify-desktop-auto-update.mjs"),
        "--product-root", $RepoRoot,
        "--tag", $tag,
        "--release"
      )
      if ($WithPortable) { $verifyArgs += "--require-portable" }
      node @verifyArgs
    }

    Invoke-Step "Snapshot known-good (installer backup)" {
      node scripts/snapshot-known-good.mjs --label "v$pkgVersion-stable"
    }

    Invoke-Step "Ship smoke checklist (manual gate)" {
      node scripts/print-ship-smoke-checklist.mjs
    }
  }
}
finally {
  Pop-Location
  Remove-Item Env:DESKTOP_RELEASE_INSTALLER_ONLY -ErrorAction SilentlyContinue
  Remove-Item Env:STEALTH_RELEASE_VERSION -ErrorAction SilentlyContinue
}

$totalSec = [math]::Round(((Get-Date) - $ReleaseStarted).TotalSeconds, 1)
Write-Host ""
Write-Host "==> Release timing (v$pkgVersion total ${totalSec}s)" -ForegroundColor Cyan
foreach ($row in $StepTimes) {
  Write-Host ("    {0,6} s  {1}" -f $row.Seconds, $row.Step)
}
if ($Fast -and $totalSec -le 120) {
  Write-Host "    BUDGET OK (under 2m Fast path)" -ForegroundColor Green
} elseif ($Fast -and $totalSec -gt 120) {
  Write-Host "    BUDGET MISS: ${totalSec}s over 120s (Fast) - check signing / Vite / full pack / NSIS" -ForegroundColor Yellow
} elseif (-not $Fast) {
  Write-Host "    Full release (not Fast) - under-2m budget applies when -Fast / DESKTOP_RELEASE_FAST default" -ForegroundColor DarkYellow
}
