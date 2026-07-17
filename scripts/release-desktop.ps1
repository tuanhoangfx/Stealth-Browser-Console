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
$ToolScripts = (Resolve-Path (Join-Path $PSScriptRoot "../../scripts")).Path

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed (exit $LASTEXITCODE)"
  }
}

if ($Publish -and -not $env:GH_TOKEN -and -not $env:GITHUB_TOKEN) {
  throw "Publishing to GitHub Releases requires GH_TOKEN or GITHUB_TOKEN in the current shell."
}

if ($Version.Trim() -and $Bump.Trim()) {
  throw "Use either -Version or -Bump, not both."
}

Push-Location $RepoRoot
try {
  if (-not $SkipPreRelease) {
    Invoke-Step "Pre-release (check-only - does not stop dev/exe)" {
      powershell -ExecutionPolicy Bypass -File scripts/pre-release-desktop.ps1
    }
  }

  if (-not $SkipInstall) {
    Invoke-Step "Install locked dependencies" {
      node (Join-Path $ToolScripts "run-pnpm.mjs") install --frozen-lockfile
    }
  }

  Invoke-Step "Verify cloakbrowser engine pin" {
    node scripts/check-cloakbrowser-pin.mjs
  }

  if ($Version.Trim()) {
    Invoke-Step "Set desktop version to $Version" {
      node (Join-Path $ToolScripts "run-pnpm.mjs") version $Version --no-git-tag-version
      node scripts/sync-app-version.mjs
    }
  }

  if ($Bump.Trim()) {
    Invoke-Step "Bump desktop version ($Bump)" {
      node (Join-Path $ToolScripts "run-pnpm.mjs") version $Bump --no-git-tag-version
      node scripts/sync-app-version.mjs
    }
  }

  if (-not $SkipTests) {
    $testLabel = if ($FastTests) { "Quality gates (test:fast)" } else { "Quality gates (test:unit full)" }
    Invoke-Step $testLabel {
      if ($FastTests) {
        node scripts/run-unit-tests.mjs --fast
      } else {
        node scripts/run-unit-tests.mjs
      }
    }

    # Hard launch-speed gate: fail the release on a fresh per-open regression (e.g. the
    # WMI Get-CimInstance scan back on the hot path, ~3800ms). Enforces the last recorded
    # warm full-open (<1500ms — above the ~850-1100ms Chromium+E0001 spawn floor, below a
    # WMI regression); WARNs (does not block) when the benchmark is missing/stale, since
    # regenerating needs a browser. --FastTests skips the live benchmark, so this guards
    # against the most recent dev-reload benchmark instead of silently passing.
    Invoke-Step "Launch-speed regression gate (warm full-open < 1500ms)" {
      node scripts/check-launch-speed.mjs
    }
  }

  if (-not $SkipBuild) {
    Invoke-Step "Verify Visual Studio Build Tools" {
      powershell -ExecutionPolicy Bypass -File scripts/ensure-vs-build-tools.ps1
    }

    Invoke-Step "Rebuild native modules for Electron" {
      node scripts/ensure-better-sqlite3.mjs
    }

    # Ship a verified E0001 snapshot inside the installer (extraResources) so a fresh
    # install seeds the AppData cache with NO Chrome Web Store download on first open.
    # Keeps the committed snapshot when present (offline-safe); refresh with --force.
    Invoke-Step "Refresh bundled E0001 snapshot" {
      node scripts/sync-bundled-e0001.mjs
    }
  }

  if ($Publish) {
    $version = (Get-Content -Raw package.json | ConvertFrom-Json).version
    $tag = "v$version"
    Invoke-Step "Ensure git tag $tag for GitHub Release" {
      $existing = git tag -l $tag
      if (-not $existing) {
        git tag -a $tag -m "P0003 v$version desktop release"
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

  $PublishMode = if ($Publish) { "always" } else { "never" }
  $packArgs = @("scripts/run-electron-package.mjs", "--publish", $PublishMode)
  if ($WithPortable) { $packArgs += "--with-portable" }
  if ($SkipBuild) { $packArgs += "--skip-build" }

  $targetLabel = if ($WithPortable) { "NSIS + portable" } else { "NSIS installer only" }
  Invoke-Step "Build Windows $targetLabel (publish: $PublishMode)" {
    node @packArgs
  }

  if ($Publish) {
    $version = (Get-Content -Raw package.json | ConvertFrom-Json).version
    $tag = "v$version"
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
      node scripts/snapshot-known-good.mjs --label "v$version-stable"
    }

    Invoke-Step "Ship smoke checklist (manual gate)" {
      node scripts/print-ship-smoke-checklist.mjs
    }
  }
}
finally {
  Pop-Location
}
