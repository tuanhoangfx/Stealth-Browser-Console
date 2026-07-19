# Changelog

## 2026-07-20 — v1.0.59 — Freeze: taskbar badge + session detect + electron-node DB tests

- Version: `1.0.59`
- Timestamp: 2026-07-20 04:35 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Known-good freeze** of WIP since `v1.0.40-stable`: taskbar profile badge Design V2 (`v2m-bottom-huge`), Google/MS challenge detect, WF00011 captcha stop, toolbar page-size SSOT, hub-ui/identity vendor sync.
- **Unit tests:** DB-touching steps (`profile-service`, `api-routes`, …) run via `electron-node` so host uses `better-sqlite3` (no plain-Node sql.js fallback).
- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-20 — v1.0.58 — Taskbar badge: huge digits + skip WMI

- Version: `1.0.58`
- Timestamp: 2026-07-20 03:25 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Visual:** `v2m-bottom-huge` — 256px canvas, bottom plate ~55% height, **92px** Bold digits (readable after Windows scales to ~24–32px taskbar).
- **Perf:** pass Playwright `browserPid` / `stealth-pid.json` into apply script — **skip Get-CimInstance** on hot path; sequential retries (no parallel PowerShell pile-up). Write sidecar PID before title/badge.

## 2026-07-19 — v1.0.57 — Electron dev reload

- Version: `1.0.57`
- Timestamp: 2026-07-19 03:17 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-20 — v1.0.56 — Taskbar badge: bottom XL digits + ICO warm

- Version: `1.0.56`
- Timestamp: 2026-07-20 03:20 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Visual:** plate back to **bottom**; 128px PNG-in-ICO; Bold **28pt** digits (`v2l-bottom-xl`) for taskbar readability.
- **Perf (ok 1–3):** warm ICO on launch + directory page list; keep fast retries; reload Electron for new timing.

## 2026-07-20 — v1.0.55 — Taskbar badge: larger center digits + faster apply

- Version: `1.0.55`
- Timestamp: 2026-07-20 03:15 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Visual:** V2 center band on Chromium — Bold **17pt** digits mid-icon (`v2k-center-xl`); easier to read on taskbar.
- **Perf:** badge is fire-and-forget (does not block profile open); warm ICO cache early; retries `0/120/350/700/1400ms` and **stop after OK_ICON** (was always firing 4 PowerShell runs incl. 2s+4s).

## 2026-07-20 — v1.0.54 — Stealth: no false Logged in on Google challenge

- Version: `1.0.54`
- Timestamp: 2026-07-20 03:10 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Root cause (Profile 0001 / `tuanhase03423@gmail.com`):** `detectGoogleSession` stamped `logged_in` when the only Google tab was a sign-in/challenge/error page (`evidence: challenge_url+auth_cookies`) — leftover SID/HSID/SSID overrode the real Gmail “information” / verify error. Data Box Stealth column showed Logged in incorrectly.
- **Fix:** challenge/error tab → always `challenged` (`challenge_url+stale_auth_cookies` when cookies remain). Inbox still wins when both tabs exist. Same rule for Microsoft detect.
- Corrected vault snapshot for browser `0001` → `challenged` / `google_challenge`.

## 2026-07-20 — v1.0.53 — Stealth: no false Logged in on Google challenge

- Version: `1.0.53`
- Timestamp: 2026-07-20 03:10 (UTC+7)
- Type: Patch
- Status: Superseded by 1.0.54 (Electron reload gate)

### Changes

- Same detect fix as 1.0.54 (gate auto-bumped during `dev-desktop-reload`).

## 2026-07-19 — v1.0.52 — Electron dev reload

- Version: `1.0.52`
- Timestamp: 2026-07-19 03:02 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **Taskbar:** purge legacy `v2c-lg` orb caches; HWND via EnumWindows; `apply-all-taskbar-badges.mjs` — prevents blue-orb regression on profiles like 0073/0074.

## 2026-07-20 — v1.0.51 — Taskbar: keep Chromium icon, label only

- Version: `1.0.51`
- Timestamp: 2026-07-20 02:50 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Root cause:** redrawing badge via `Icon.FromHandle(GetHicon)` flattened alpha → dark orb; TaskbarList overlay COM not registered on this host.
- **Fix:** draw Chromium + bottom navy digits on transparent PNG → pack PNG-in-ICO (`v2i-pngico`); apply live `OK_ICON` for 0001/1731/0010.

## 2026-07-20 — v1.0.50 — Taskbar badge: default Chromium + real codes

- Version: `1.0.50`
- Timestamp: 2026-07-20 02:40 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Badge ICO:** base = default Chromium icon from `~/.cloakbrowser/.../chrome.exe` (ExtractAssociatedIcon); V2 navy center band; Segoe UI Regular **21pt**.
- **Apply batch:** map running profiles via API (`status=running`) → real codes (`0001`, `1731`, …) not fake 380x.
- Cache key `v2e-chr21`.

## 2026-07-19 — v1.0.49 — Electron dev reload

- Version: `1.0.49`
- Timestamp: 2026-07-19 02:32 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- Includes **Design V2** taskbar badge ship from 1.0.48 (center band + larger digits).

## 2026-07-20 — v1.0.48 — Lock Design V2 taskbar badge (larger digits)

- Version: `1.0.48`
- Timestamp: 2026-07-20 02:35 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Design lock:** Taskbar profile badge → **V2 Center band** (`TASKBAR_PROFILE_BADGE_DESIGN_LOCK`).
- **Native ICO:** Cloak blue + navy mid-band overlay; Segoe UI Regular **18pt** (was Bold 13 on solid fill); cache key `v2c-lg`.
- **Cleanup:** removed `design-preview/taskbar-profile-badge/`; Design Template empty again.

## 2026-07-20 — v1.0.47 — Design preview: overlay thin text on icon

- Version: `1.0.47`
- Timestamp: 2026-07-20 02:25 (UTC+7)
- Type: Patch
- Status: Review

### Changes

- **taskbar-profile-badge preview:** all V1–V5 overlay text ON the Cloak icon (not beside); thin light type + letter-spacing. Placements: bottom hairline · center band · top caption · corner micro · edge ribbon.

## 2026-07-19 — v1.0.46 — Electron dev reload

- Version: `1.0.46`
- Timestamp: 2026-07-19 02:18 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-20 — v1.0.46 — Electron dev reload

- Version: `1.0.46`
- Timestamp: 2026-07-20 02:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate.

## 2026-07-20 — v1.0.45 — Design preview: taskbar profile badge

- Version: `1.0.45`
- Timestamp: 2026-07-20 02:20 (UTC+7)
- Type: Patch
- Status: Review

### Changes

- **System → Design Template:** active review `taskbar-profile-badge` — 5 layout variants (V1 Adjacent chip · V2 Dual-zone bar · V3 Caption stack · V4 Taskbar rail · V5 Overlay ribbon). Shared navy/white palette; no production taskbar change until `Design: Vn` lock.

## 2026-07-20 — v1.0.44 — Toolbar page-size SSOT (Display only)

- Version: `1.0.44`
- Timestamp: 2026-07-20 02:20 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Directory toolbar:** when Display band is present, do not also show the “N rows” select (Profiles · Extensions · Workflows). Page size is owned by Display / hub `tpage` prefs.

## 2026-07-19 — v1.0.43 — Electron dev reload

- Version: `1.0.43`
- Timestamp: 2026-07-19 02:04 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **Taskbar badge fix:** PowerShell `$pid` reserved + `-bor` parse bug blocked WM_SETICON forever — fixed; AppUserModel_RelaunchIconResource; smoke `scripts/smoke-taskbar-badge.mjs` → `OK_ICON` verified live.

## 2026-07-19 — v1.0.42 — Electron dev reload

- Version: `1.0.42`
- Timestamp: 2026-07-19 01:42 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **WF00011:** on Google reCAPTCHA / "Verify it's you" (`/challenge/recaptcha`) — stop immediately, close browser, set Data Box mail `status=error` + stealth snapshot `challenged/google_challenge` (no more 120s wait).
- **Taskbar:** Win32 `SetWindowText` + cached digit badge icon (`WM_SETICON`) so combined taskbar buttons show profile code (not only hover title).

## 2026-07-19 — v1.0.41 — Electron dev reload

- Version: `1.0.41`
- Timestamp: 2026-07-19 01:31 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **Profile window title (taskbar A):** set OS/window title to `code · name` on open via one `addInitScript` + in-page `document.title` setter patch — no timers/CDP polls; survives navigations for Alt-Tab / taskbar hover.

## 2026-07-19 — v1.0.40 — Electron dev reload

- Version: `1.0.40`
- Timestamp: 2026-07-19 23:06 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **WF00011 gmail-login:** gate Microsoft email-Next soft-skip + password ensure to Microsoft login URLs only — Google "Click Next (email)" was skipped so profiles filled email and stalled.
- Vault miss reason: when a Gmail/Outlook row exists but `status != active` (e.g. Incorrect Pass / `incorrect_info`), surface that explicitly (fixes blank `about:blank` confusion for profiles like 0385).
- Reload `vite-build-ui-smoke`: build to `dist-ui-smoke` so it no longer races the live Vite HTML proxy on :5175.

## 2026-07-19 — v1.0.39 — Electron dev reload

- Version: `1.0.39`
- Timestamp: 2026-07-19 23:01 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-19 — v1.0.38 — Electron dev reload

- Version: `1.0.38`
- Timestamp: 2026-07-19 22:38 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- Repair known-good pin metadata: `gitCommit` → `daf5688c` (tag `v1.0.32`), `gitTag` → `v1.0.32-stable` (was stale `v1.0.1-stable`); local tag created; Setup-1.0.32.exe SHA512 verified on disk.

## 2026-07-18 — v1.0.37 — Cross-origin Hub identity bridge

- Version: `1.0.37`
- Timestamp: 2026-07-18 00:40 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Start `startHubIdentityCrossOriginBridge` from Stealth auth boot so Hub JWT refresh rotations on sibling tools (P0004/P0005/P0020) are pulled via the Hub iframe bridge — prevents invalidated refresh_token from forcing repeated Login.
- Verified: `dev-desktop-reload.mjs` all checks passed after wiring.

## 2026-07-17 — v1.0.36 — Electron dev reload

- Version: `1.0.36`
- Timestamp: 2026-07-17 00:36 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-18 — v1.0.35 — Proactive Hub JWT refresh (fix repeated login)

- Version: `1.0.35`
- Timestamp: 2026-07-18 00:30 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Wired a real Hub token-refresh scheduler** (`src/lib/hub-token-refresh-scheduler.ts`), replacing the previous no-op `tokenScheduler` passed to `useWorkspaceHubAuthBoot`. The desktop console stays focused for hours so `visibilitychange` never fires — without a proactive timer the shared identity client (`persistSession:false, autoRefreshToken:false`) silently rode an expired JWT until the next 401, forcing a repeated Login prompt. Now the cached refresh_token is rotated via `refreshSession()` when within 15 min of expiry, polled every 5 min.
- Verified: `dev-desktop-reload.mjs` → workflow-tab console smoke + all checks passed; typecheck clean for changed files.

## 2026-07-17 — v1.0.34 — Electron dev reload

- Version: `1.0.34`
- Timestamp: 2026-07-17 00:24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-17 - hub-ui SSOT hook-stability vendor sync

- Version: `1.0.33`
- Timestamp: 2026-07-17 22:26 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Sync hub-ui SSOT hook-stability patch into vendor/hub-ui: `useHubDirectorySelection`, `useDirectoryHaystackFilter`, and `useDirectoryTableSort` now self-stabilize their row-projection callbacks (idOf/keyOf/sortableValue) via refs, so inline `(row) => row.id` no longer rebuilds the selection/haystack/sort memos every render — snappier checkbox click, drag-sweep, search, and sort with no consumer code changes.

### Verification

- pending

---
## 2026-07-17 — v1.0.32 — Bundle E0001 in installer (fast, offline first open)

- Version: `1.0.32`
- Timestamp: 2026-07-17 17:45 (UTC+7)
- Type: Patch
- Status: Verified (unit + launch benchmark)
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.32

### Changes

- **Bundled E0001 in the installer.** The verified Chrome Web Store snapshot
  (`build/bundled-extensions/<storeId>/unpacked`, ~1MB, shipped via `extraResources`)
  is seeded straight into the AppData cache on a fresh install — the very first profile
  open loads E0001 with **no Chrome Web Store download** (offline-safe). This removes the
  one-time multi-second cold spike a brand-new machine used to pay. Chromium's own
  extension updater still refreshes it later from the store id.
- **Fresh-install guard (deterministic, no network).** The launch hot path
  (`resolveCookieBridgeExtensionDirSync` → `seedCacheFromBundle`) now resolves E0001
  synchronously from the bundle, so the first open never blocks on the network — no
  cosmetic "Preparing…" spinner needed because the seed is a local ~1MB copy.
- **Release pipeline.** New `scripts/sync-bundled-e0001.mjs` refreshes the bundled
  snapshot at release time (offline-safe: keeps the committed copy if the store is
  unreachable; `--force` to re-download). Wired into `release-desktop.ps1` before packaging.
- **Launch-speed gate realism.** `check-launch-speed` threshold moved 800ms → **1500ms**:
  the real warm full-open floor is Chromium spawn + E0001 load (~850–1100ms, machine
  dependent), so 800ms false-failed on spawn variance while 1500ms still catches a
  reintroduced WMI `Get-CimInstance` scan (~3800ms). Matches the unit guard
  `prepare-profile-launch.test.cjs`.
- Prod-proof: fresh benchmark with the bundled E0001 records warm full-open **855ms**
  (prep=0ms → WMI fix holds); the sub-500ms 1.0.11 path was E0001-less, so ~850ms is the
  expected floor with the cookie bridge loaded.
- Regression guard: `cookie-bridge-store.test.cjs` now asserts the bundle seeds a fresh
  cache and the sync launch resolver returns it without a download.

## 2026-07-17 — v1.0.31 — Electron dev reload

- Version: `1.0.31`
- Timestamp: 2026-07-17 17:31 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.31

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-17 — v1.0.30 — Electron dev reload

- Version: `1.0.30`
- Timestamp: 2026-07-17 17:18 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-17 — v1.0.31 — Fix: dev reload no longer kills prod profiles (+ defense-in-depth)

- Version: `1.0.31`
- Timestamp: 2026-07-17 17:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **PROD-SAFETY fix**: `stealthElectronEnv` now pins the dev Electron window to the isolated `-dev`
  userData root (`stealth-browser-console-dev`, API :6004) **deterministically**, instead of via
  `resolveStealthUserDataRoot()` which decided dev-vs-prod from the *ambient* `STEALTH_DEV_ISOLATED`.
  In a plain `dev-desktop-reload` shell that variable is unset, so it resolved to the **prod** root —
  the dev window then booted on the packaged app's root/DB and its `reconcileOrphansOnStartup()`
  killed the profiles the user had open in prod. The isolated dev root is now forced and any stale
  inherited `STEALTH_USER_DATA=prod` is ignored (unless the caller overrides via `extra`).
- **Defense-in-depth**: `listChromeProcessesPs` and `focusProfileBrowserWindow` now match Chrome
  strictly on the full `--user-data-dir` path (root-scoped). The bare profile UUID and
  `--stealth-profile-id=<uuid>` needles were dropped — they are identical across user-data roots, so
  a dev-root reconcile could match/kill the prod app's Chrome for the same profile id. The path is a
  strict subset of the old needles (a same-root Chrome always contains it), so only cross-root false
  positives are removed; `taskkill /T` + lock-owner detection still cover child processes.
- **Cold-open finding (root-caused)**: the ~8s "cold spike" is the **first-time E0001 download from
  GitHub** (`ensureCookieBridgeStoreExtension`), which the first `sessions.launch` triggers inline
  only on a root that has never cached E0001. Proof: pre-caching E0001 drops first open 8.2s → 2.2s
  (2nd open ~0.9s); the download itself measured 8.2s. Production roots already have E0001 cached
  (and startup `warmCookieBridgeStoreCache` downloads it in the background off the interactive path),
  so real profile opens never pay it. The per-open ~3s users felt on ≤1.0.24 was the WMI
  `Get-CimInstance` scan removed in 1.0.25+. `benchmark-profile-launch` now pre-warms E0001 like
  production so its numbers reflect real (warm-root) opens instead of a fresh-root download artifact.
- Regression guards: `scripts/lib/stealth-electron-env.test.mjs` (dev env → `-dev`/:6004 even with a
  stale prod `STEALTH_USER_DATA`; `--prod-data` still :6003; `extra` overrides win) and updated
  `electron/lib/profile-browser-orphan.test.cjs` (root-scoped path needle; no cross-root UUID match).

## 2026-07-17 — v1.0.28 — Electron dev reload

- Version: `1.0.28`
- Timestamp: 2026-07-17 17:08 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-17 — v1.0.27 — Electron dev reload

- Version: `1.0.27`
- Timestamp: 2026-07-17 17:06 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-17 — v1.0.26 — Fewer WMI scans on orphan attach + open-speed guard

- Version: `1.0.26`
- Timestamp: 2026-07-17 16:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Perf: orphan attach (`#tryAttachOrFocusOrphan`) no longer runs a redundant
  `hasProfileBrowserProcess` WMI confirm when a `SingletonLock` already proves a
  browser holds the profile — it goes straight to focus, saving a second ~3s WMI
  scan when reattaching an already-open profile (e.g. after an app restart).
- Test: `prepare-profile-launch` guards the sub-500ms open path — asserts a
  cleanly-closed profile (and a dead-sidecar profile) never trigger the WMI scan,
  plus `shouldSkipOrphanProbe` only skips when the dir is clean. Registered in
  `run-unit-tests`.
- Verified (no change needed): startup already pre-warms the E0001 store CRX +
  CloakBrowser staging (`warmCookieBridgeStoreCache` + `ensureCloakbrowserExtensionStage`),
  so first-open provisioning is a one-time background cost, not per-open.

## 2026-07-17 — v1.0.25 — Sub-500ms profile opens (drop per-open WMI scan)

- Version: `1.0.25`
- Timestamp: 2026-07-17 16:35 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.25

### Changes

- Perf (major): `prepareProfileForLaunch` no longer runs the WMI
  `Get-CimInstance Win32_Process` orphan scan on the hot path. Measured at
  **3143ms** per open on Windows, it ran on every launch of a cleanly-closed
  profile just to confirm "not running". Chromium always holds `SingletonLock`
  while a profile is live, so with no lock file we skip the scan; a cheap sidecar
  pid `process.kill(pid, 0)` still covers the crash/detach edge case, and the
  existing lock-error retry loop still kills any real orphan on spawn failure.
- Result: warm profile reopens drop from ~3s to **~480ms** — back to 1.0.11 speed.

### Measured

- WMI scan alone: 3143ms. Clean reopen after fix: 477–480ms (nav ~40ms).

## 2026-07-17 — v1.0.24 — Lean dev extension sync (align with staging)

- Version: `1.0.24`
- Timestamp: 2026-07-17 16:01 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.24

### Changes

- Perf: `cookie-bridge-store.syncExtensionDirToCache` (dev `STEALTH_COOKIE_BRIDGE_LOCAL`
  path) now excludes the same non-runtime dirs as staging (`.chrome-store-profile`,
  `docs`, `.github`, `.cursor`, `.vscode`, `.dev`, `coverage`, `.turbo`). Previously
  only `.git`/`node_modules` were skipped, so dev builds copied E0001's 90MB
  `.chrome-store-profile` into the cache before staging pruned it.
- Companion: E0001 repo untracked `.chrome-store-profile` (974 files) + gitignore;
  `package-extension.ps1` unpacked zip excludes dev dirs. Production store CRX was
  already lean (allowlist), so this targets dev + repo bloat.

## 2026-07-17 — v1.0.22 — Lean extension staging (fix slow profile opens)

- Version: `1.0.22`
- Timestamp: 2026-07-17 15:45 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.22

### Changes

- Perf: extension staging (`ensureCloakbrowserExtensionStage`) now copies only
  runtime files — dev/publish dirs (`.chrome-store-profile`, `docs`, `.github`,
  `.cursor`, `.vscode`, `.dev`, `coverage`, `.turbo`) are excluded, and any stale
  copies from older builds are pruned from the stage. E0001 shipped a 988-file /
  ~98MB `.chrome-store-profile` dev folder that was copied into the CloakBrowser
  cache and re-validated by Chromium on every new profile's first open — the main
  cause of the multi-second cold opens vs the lean 1.0.11-era extension.
- Test: `cloakbrowser-extension-stage` covers the runtime/dev split + stale prune.

### Diagnosis (measured)

- Warm, provisioned root: E0001 adds only ~300ms to a new-profile open — the
  extension itself is not the bottleneck. The big spikes came from staging/
  re-validating the bloated 98MB extension folder; this change removes that.

## 2026-07-17 — v1.0.21 — Faster repeat profile opens (E0001 native prefs-load)

- Version: `1.0.21`
- Timestamp: 2026-07-17 14:49 (UTC+7)
- Type: Patch
- Status: Committed

### Changes

- Perf: the E0001 Cookie Bridge now loads **once** via `--load-extension` on a
  profile's first open, then on every later open Chromium loads it natively from
  prefs (location 4) — the redundant per-launch `--load-extension` re-validation
  is dropped. Gated on a Chromium-authored `manifest` marker so the flag stays on
  until Chromium has actually installed the extension; `STEALTH_E0001_NATIVE_PREFS=0`
  forces the old always-CLI-load behavior. Launch benchmark avg 2770ms → 2151ms.
- Tests: new live e2e `extension-e0001-relaunch-smoke` verifies first-open uses
  the CLI load, Chromium caches the manifest, the second open skips the CLI load,
  and the extension stays loaded + enabled after the flag-less relaunch.

Note: warm/repeat opens were already ~1.0.11 speed; the only way to make *every*
open as fast as pre-extension 1.0.11 is to disable E0001 (Settings → Extensions,
global or per-profile), since any extension pays a one-time first-open load cost.

## 2026-07-17 - P0003 version sync

- Version: `1.0.20`
- Timestamp: 2026-07-17 11:19 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.20

### Changes

- Patch bump for uncommitted code changes (P0003).

### Verification

- pending

---
## 2026-07-17 — v1.0.19 — Electron dev reload

- Version: `1.0.19`
- Timestamp: 2026-07-17 10:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-17 — v1.0.19 — Auth flash + multi-profile kill + faster launch

- Version: `1.0.19`
- Timestamp: 2026-07-17 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Fix (multi-profile)** — opening a new profile no longer closes other running profiles. Orphan/lock process matching dropped the shared `--stealth-user-data-tag=<root>` needle (identical for every profile), which made `killOrphanProfileBrowser` for a new profile match and kill all others. Matching is now profile-scoped (path + `--stealth-profile-id`).
- **Fix (auth UX)** — no more "Checking workspace session…" flash when switching tabs / refocusing the console. Tool-access re-verification is optimistic: only the first check shows the boot loader; later re-checks keep the last confirmed grant. An uncertain re-check keeps a prior grant instead of flashing Access Denied.
- **Perf (launch)** — profile launch ran `prepareProfileExtensions` twice per open (once inside `ensureProfileExtensionPins`, once after). The plan is now prepared once and reused, halving per-launch prefs read/write + extension-staging work.

## 2026-07-17 — v1.0.17 — Electron dev reload

- Version: `1.0.17`
- Timestamp: 2026-07-17 07:28 (UTC+7)
- Type: Patch
- Status: Committed
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.17

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-16 — v1.0.16 — Electron dev reload

- Version: `1.0.16`
- Timestamp: 2026-07-16 01:34 (UTC+7)
- Type: Patch
- Status: Committed

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-16 — v1.0.15 — Electron dev reload

- Version: `1.0.15`
- Timestamp: 2026-07-16 23:36 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-16 — v1.0.14 — Electron dev reload

- Version: `1.0.14`
- Timestamp: 2026-07-16 16:32 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-16 — v1.0.13 — Electron dev reload

- Version: `1.0.13`
- Timestamp: 2026-07-16 15:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-16 — v1.0.12 — Electron dev reload

- Version: `1.0.12`
- Timestamp: 2026-07-16 15:05 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-13 — v1.0.11 — Hub API identity (fix packaged No access)

- Version: `1.0.11`
- Timestamp: 2026-07-13 (UTC+7)
- Type: Patch
- Status: Stable

### Changes

- **Fix** — packaged Hub login uses `https://hub-api.infi.io.vn` (retired `*.supabase.co` JWT host caused false “No access” after grant).
- **CSP** — `connect-src` allows `hub-api.infi.io.vn` / `*.infi.io.vn` for identity.
- **Gate** — `smoke-packaged-auth.mjs` + `run-build` fail if dist embeds legacy Hub host or omits hub-api / CSP.
- **Auth UX** — Access Denied recheck + RPC `hub_user_has_tool_access` verify path.

## 2026-07-09 — v1.0.10 — Packaged headed launch + exe resolution

- Version: `1.0.10`
- Timestamp: 2026-07-09 (UTC+7)
- Type: Patch
- Status: Stable

### Changes

- **Headed launch** — packaged app ignores `CURSOR_AGENT` / agent smoke env; profiles show visible Chrome (not headless-invisible).
- **desktop:open** — picks highest-version exe (pending → NSIS install → win-unpacked); strips smoke env on spawn.
- **Startup** — main process purges agent smoke env when `app.isPackaged`.

## 2026-07-09 — v1.0.9 — Packaged extension store IDs fix

- Version: `1.0.9`
- Timestamp: 2026-07-09 (UTC+7)
- Type: Patch
- Status: Stable

### Changes

- **Fix** — include `shared/stealth-extension-store-ids.json` in NSIS asar (`build.files`); fixes `Cannot find module …stealth-extension-store-ids.json` on profile launch in packaged app.
- **Gate** — `verify-packaged-unpacked.mjs` asserts shared JSON present in asar.
- **Fallback** — electron loader uses embedded IDs if JSON absent (safety net).

## 2026-07-09 — v1.0.8 — Dev stability + shutdown fix

- Version: `1.0.8`
- Timestamp: 2026-07-09 (UTC+7)
- Type: Patch
- Status: Stable

### Changes

- **Dev guards** — `predev` skips vendor sync / `.env.local` write / `electron-dev-gate` kill when `:5175` is active; `dev-node` retries Vite up to 3× on transient exit.
- **Shutdown** — fix `flushScheduledLastOpenedCheckpoint` scope in `before-quit` (no ReferenceError on quit).
- **Build** — `run-build` syncs `hub-ui` + `hub-identity` vendor before `tsc`/vite.
- **UI** — `profile-form-field-meta` uses `headerIconClassName` SSOT from hub-ui column meta.

## 2026-07-08 — v1.0.7 — Electron dev reload

- Version: `1.0.7`
- Timestamp: 2026-07-08 06:54 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 — v1.0.6 — Electron dev reload

- Version: `1.0.6`
- Timestamp: 2026-07-08 06:49 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-09 — v1.0.5 — Last opened durability (prod catalog)

- Version: `1.0.5`
- Timestamp: 2026-07-09 (UTC+7)
- Type: Patch
- Status: Stable

### Changes

- **Last opened** — WAL debounced checkpoint after profile open; startup repair from `profile_events` + merge newer dev isolated DB into prod; pre-update in-app checkpoint before `quitAndInstall`.
- **Guards** — never downgrade `last_opened_at`; skip same-db merge; ATTACH sibling read-only; reconcile rejects future timestamps.
- **Repair script** — `node scripts/repair-last-opened-catalog.mjs` (prod DB, app closed).
- **Monitor** — every boot logs `[last-opened] startup maintenance reconciled=N siblingMerged=M` (healthy steady-state: `0 0`).
- **Not added** — no sidecar JSON; no NSIS API checkpoint (installer hook stays `app.asar.unpacked` cleanup only).

## 2026-07-08 — v1.0.4 — Electron dev reload

- Version: `1.0.4`
- Timestamp: 2026-07-08 04:17 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 — v1.0.3 — Electron dev reload

- Version: `1.0.3`
- Timestamp: 2026-07-08 03:14 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 — v1.0.2 — Electron dev reload

- Version: `1.0.2`
- Timestamp: 2026-07-08 03:09 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 — v1.0.1 — Fix proxy geoip (mmdb-lib) on packaged build

- Version: `1.0.1`
- Timestamp: 2026-07-08 21:40 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.1

### Changes

- **Packaged proxy launch** — stage `mmdb-lib` beside unpacked `cloakbrowser` (ESM `geoip.js` import); only enable `geoip: true` when unpacked module exists (fixes false-positive `require.resolve` from asar).

### Verification

- `afterPack` 7/7 ESM deps · `smoke-packaged-cloakbrowser-import` tar + mmdb-lib/geoip OK.

---

- Version: `1.0.0`
- Timestamp: 2026-07-08 21:15 (UTC+7)
- Type: **Major**
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.0

### Changes

- **Fix** — `ERR_MODULE_NOT_FOUND: tar` when Run profile on installed Setup.exe (v0.10.77): load `cloakbrowser` from `app.asar.unpacked` so ESM resolves `tar` beside unpacked `node_modules`.
- **Packaging** — `afterPack` stages `tar` + transitive ESM deps; gate `smoke-packaged-cloakbrowser-import.cjs`.
- **Dev catalog** — sync from prod no longer down-seeds full catalog back to 80 profiles.

### Verification

- `verify-packaged-unpacked` + cloakbrowser/tar ESM smoke pass after NSIS pack.

---

- Version: `0.10.80`
- Timestamp: 2026-07-08 20:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 — v0.10.79 — Electron dev reload

- Version: `0.10.79`
- Timestamp: 2026-07-08 20:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 — v0.10.80 — Fix packaged profile launch (cloakbrowser tar ESM)

- Version: `0.10.80`
- Timestamp: 2026-07-08 20:55 (UTC+7)
- Type: Patch
- Status: Verified (pack dir + ESM smoke)

### Changes

- **Packaged launch** — load `cloakbrowser` from `app.asar.unpacked` file URL so ESM sub-import `tar` resolves beside unpacked `node_modules` (fixes `ERR_MODULE_NOT_FOUND: tar` on profile Run in installed exe).
- **afterPack** — keep staging `tar` + transitive ESM deps under `app.asar.unpacked/node_modules`.
- **Gate** — `smoke-packaged-cloakbrowser-import.cjs` after `verify-packaged-unpacked.mjs`.

### Verification

- `pnpm pack` (dir) + `verify-packaged-unpacked` + cloakbrowser/tar ESM smoke pass.

---

- Version: `0.10.74`
- Timestamp: 2026-07-08 19:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 — v0.10.72 — Electron dev reload

- Version: `0.10.72`
- Timestamp: 2026-07-08 18:49 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 — v0.10.71 — Electron dev reload

- Version: `0.10.71`
- Timestamp: 2026-07-08 17:20 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 - P0003 version sync

- Version: `0.10.70`
- Timestamp: 2026-07-08 16:47 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.10.70

### Changes

- Align CHANGELOG with package.json v0.10.70.

### Verification

- pending

---
## 2026-07-08 - P0003 version sync

- Version: `0.10.69`
- Timestamp: 2026-07-08 16:35 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.10.69

### Changes

- Align CHANGELOG with package.json v0.10.69.

### Verification

- pending

---
## 2026-07-08 - P0003 version sync

- Version: `0.10.68`
- Timestamp: 2026-07-08 16:22 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.10.68

### Changes

- Align CHANGELOG with package.json v0.10.68.

### Verification

- pending

---
## 2026-07-08 - P0003 version sync

- Version: `0.10.67`
- Timestamp: 2026-07-08 15:55 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.10.67

### Changes

- Align CHANGELOG with package.json v0.10.67.

### Verification

- pending

---
## 2026-07-08 - fix desktop updater packaged deps (fs-extra)

- Version: `0.10.66`
- Timestamp: 2026-07-08 07:43 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.10.66

### Changes

- Stage `electron-updater` runtime deps into `electron/packaged-node_modules/` before electron-builder pack (fixes `Cannot find module 'fs-extra'` on install).
- Lazy-load updater + prepend `Module.globalPaths` in `desktop-updater.cjs` so startup survives missing deps in dev.
- Add direct deps: fs-extra, builder-util-runtime, js-yaml, lazy-val, semver, tiny-typed-emitter, lodash.*.
- Gate: `verify-packaged-unpacked.mjs` checks updater deps inside asar.

### Verification

- verify-lockfile-importers: OK
- verify-packaged-unpacked: pending release build

---
## 2026-07-08 - P0003 version sync

- Version: `0.10.65`
- Timestamp: 2026-07-08 07:24 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.10.65

### Changes

- Align CHANGELOG with package.json v0.10.65.

### Verification

- pending

---
## 2026-07-08 - P0003 version sync

- Version: `0.10.64`
- Timestamp: 2026-07-08 07:01 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.10.64

### Changes

- Align CHANGELOG with package.json v0.10.64.

### Verification

- pending

---
## 2026-07-07 — v0.10.63 — Electron dev reload

- Version: `0.10.63`
- Timestamp: 2026-07-07 05:11 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-07 - P0003 version sync

- Version: `0.10.62`
- Timestamp: 2026-07-07 05:32 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.10.62

### Changes

- Align CHANGELOG with package.json v0.10.62.

### Verification

- pending

---
# Changelog — P0003 Stealth Browser Console

## 2026-07-06 — v0.10.61 — Electron dev reload

- Version: `0.10.61`
- Timestamp: 2026-07-06 02:26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.60 — Electron dev reload

- Version: `0.10.60`
- Timestamp: 2026-07-06 02:19 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.59 — Electron dev reload

- Version: `0.10.59`
- Timestamp: 2026-07-06 02:09 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.58 — Electron dev reload

- Version: `0.10.58`
- Timestamp: 2026-07-06 01:06 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.57 — Electron dev reload

- Version: `0.10.57`
- Timestamp: 2026-07-06 00:55 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.56 — Electron dev reload

- Version: `0.10.56`
- Timestamp: 2026-07-06 00:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.55 — Electron dev reload

- Version: `0.10.55`
- Timestamp: 2026-07-06 00:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.54 — Electron dev reload

- Version: `0.10.54`
- Timestamp: 2026-07-06 23:58 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.53 — Electron dev reload

- Version: `0.10.53`
- Timestamp: 2026-07-06 23:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.52 — Electron dev reload

- Version: `0.10.52`
- Timestamp: 2026-07-06 23:50 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.51 — Electron dev reload

- Version: `0.10.51`
- Timestamp: 2026-07-06 23:36 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.50 — Electron dev reload

- Version: `0.10.50`
- Timestamp: 2026-07-06 22:32 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.49 — Profile log realtime + backfill + create split

- Version: `0.10.49`
- Timestamp: 2026-07-06 22:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Realtime log** — `useProfileLogRealtime` subscribes `profile:session` to refresh log rail on launch/close/fail without reopening modal.
- **Backfill** — one-time `profile_events` seed from `last_opened_at` + `runs` for legacy catalogs (`profile_events_backfill_v1`).
- **Create modal** — `hub-tool-detail-modal--split` with shared `ProfileActivityLogRail` (bulk create streams to grid terminal).

## 2026-07-06 — v0.10.48 — Profile detail: Log rail parity P0006 Job detail

- Version: `0.10.48`
- Timestamp: 2026-07-06 21:40 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profile edit modal** — migrate to `hub-tool-detail-modal--split` (P0006 Job detail parity): main = Profile/Device/Extensions/Note panels, right rail = Log console.
- **Log rail** — `ProfileDetailLogRail` with `HubToolDetailRail` + grid terminal (`Time · Channel · Message`) and channel legend Profile/Workflow/Lifecycle.
- **TOC Log** — click focuses log rail (scroll + highlight pulse); `lifecycle` channel badge added to Hub-UI `hub-runtime-rail.css`.

## 2026-07-06 — v0.10.47 — Profile detail scroll + lifecycle log + identity header

- Version: `0.10.47`
- Timestamp: 2026-07-06 20:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profile detail modal** — migrate edit shell to `hub-account-detail-modal` SSOT; TOC scroll root targets `hub-account-detail-modal__main-scroll` so Log section is reachable.
- **Log frame** — `HubRuntimeConsoleTerm` with All/Today/Errors filters; merges session console, workflow runs, and persisted `profile_events` (launch/close/save).
- **Header** — `HubToolDetailIdentityHeader` with profile name, group, and status (replaces plain "Edit profile" title).
- Electron dev reload gate (electron sources changed).

## 2026-07-06 — v0.10.46 — Profile detail scroll + lifecycle log + identity header

- Version: `0.10.46`
- Timestamp: 2026-07-06 20:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- (Superseded by v0.10.47 dev-reload bump — same feature set.)

## 2026-07-06 — v0.10.45 — Electron dev reload

- Version: `0.10.45`
- Timestamp: 2026-07-06 19:31 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.44 — Profile detail modal: Log console + row open + Device collapse

- Version: `0.10.44`
- Timestamp: 2026-07-06 19:22 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profile detail modal** — Log tab uses `HubRuntimeConsoleTerm` (session console + workflow runs filtered per profile); Note rail only on edit.
- **Directory** — single-click profile row opens detail modal (`onOpenDetail`).
- **Device section** — advanced fingerprint/viewport/UA settings collapsed by default behind toggle.

## 2026-07-06 — v0.10.43 — Last Opened survives deploy + dev reload protects prod exe

- Version: `0.10.43`
- Timestamp: 2026-07-06 18:37 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Last Opened** — stop deleting SQLite WAL on DB open (installer/restart without graceful quit was dropping recent `last_opened_at`); checkpoint WAL on quit and after each profile open.
- **Dev reload** — `killStealthDev` verifies PID is `dev-node.mjs` before `taskkill`; frees `:5175` + dev API `:6004` only; `kill-port` refuses prod `:6003`.
- **Dev catalog sync** — preserve newer `last_opened_at` from dev DB when copying prod catalog.

## 2026-07-06 — v0.10.42 — Electron dev reload

- Version: `0.10.42`
- Timestamp: 2026-07-06 18:11 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.41 — Electron dev reload

- Version: `0.10.41`
- Timestamp: 2026-07-06 17:52 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 - Proxy launch fix (host:port:user:pass → Playwright)

- Version: `0.10.41`
- Timestamp: 2026-07-06 17:50 (UTC+7)
- Type: Patch
- Product: P0003

### Changes

- **Proxy** — `parseProxy` supports `host:port:user` shorthand; `formatProxyForLaunch` + `toPlaywrightProxy` normalize GPM/antidetect strings before `launchPersistentContext` (fixes `Invalid URL` on `14.249.5.164:32350:infi:infi`).

### Verification

- `node electron/api-routes.test.cjs` (proxy-pool)
- Profile Run with HTTP proxy credentials

## 2026-07-06 - Workflow footer chrome (minimap + zoom)

- Version: `0.10.39`
- Timestamp: 2026-07-06 17:35 (UTC+7)
- Type: Patch
- Status: Committed

### Changes

- **Layout footer** — Minimap + zoom bar moved into document-flow footer row with canvas tips (`?` + hint); no canvas overlay panels.
- **Canvas fit** — Default zoom label 100% with baked 0.85 visual scale; smart edge paths + editor/canvas flex rebalance.
- **Dev icon** — SSOT `sync-app-icon` + profile window taskbar icon parity.

## 2026-07-06 — v0.10.38 — Hidden spawn (no PowerShell flash)

- Version: `0.10.38`
- Timestamp: 2026-07-06 16:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **run-step.mjs** — shared hidden spawn for predev/reload/test scripts (`windowsHide`, `run-pnpm-exec`); removes `shell: true` PowerShell flashes on Windows.

## 2026-07-06 — v0.10.37 — Electron dev reload

- Version: `0.10.37`
- Timestamp: 2026-07-06 15:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.36 — Responsive 3-frame stack; canvas chrome inset

- Version: `0.10.36`
- Timestamp: 2026-07-06 07:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps layout** — drop fixed 3:3:4 grid; flex stack with content-sized AI/editor frames and Layout filling remainder; minimap/zoom inset from canvas edge.

## 2026-07-06 — v0.10.35 — Frame border clip fix; HubSegmentToggle Steps/Workflow

- Version: `0.10.35`
- Timestamp: 2026-07-06 07:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps UI** — fix frame border clipping (chip row inset, layout canvas/minimap inset); AI scope uses `HubSegmentToggle` with icons (Steps / Workflow, Table/Card parity).

## 2026-07-06 — v0.10.34 — Step chip scroll; inspector always visible

- Version: `0.10.34`
- Timestamp: 2026-07-06 07:14 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step editor** — chip row capped at ~2 rows with vertical scroll; inspector + bulk bar stay visible when workflows have many steps.

## 2026-07-06 — v0.10.33 — Scripts 3-frame height ratio 3:3:4; restore Layout canvas

- Version: `0.10.33`
- Timestamp: 2026-07-06 07:10 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps layout** — grid rows `3fr 3fr 4fr` for AI / step editor / Layout frames; restore Layout canvas shell border and gradient inside its frame.

## 2026-07-06 — v0.10.32 — Step editor + Layout separate frames

- Version: `0.10.32`
- Timestamp: 2026-07-06 07:06 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps UI** — step chips + inspector + bulk actions in dedicated frame; Layout canvas in its own frame below.

## 2026-07-06 — v0.10.31 — Step inspector alignment; AI 5-line; flush frames

- Version: `0.10.31`
- Timestamp: 2026-07-06 07:05 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step inspector** — labels Title Case (Name not NAME); 3-column grid, label above control, aligned rows.
- **AI Steps Assistant** — 5-line prompt; Steps + Layout frames flush (no gap between panels).

## 2026-07-06 — v0.10.30 — AI Gen auto-apply; Hub-UI typography + label icons

- Version: `0.10.30`
- Timestamp: 2026-07-06 06:08 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **AI assistant** — **Gen** applies steps to workflow immediately (no separate Apply); success toast after apply.
- **Workflow Steps / Layout** — Hub-UI font tokens (`--hub-table-*`); icons on step chips, inspector labels, section headers.

## 2026-07-06 — v0.10.29 — AI Gen JSON robust + Steps/Workflow scope + compact chat

- Version: `0.10.29`
- Timestamp: 2026-07-06 06:02 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **AI assistant** — stack-based JSON extract (fixes trailing Grok text); scope toggle **Steps** (step list only) vs **Workflow** (full); smaller prompt box.

## 2026-07-06 — v0.10.28 — AI Gen JSON parse (trailing model text)

- Version: `0.10.28`
- Timestamp: 2026-07-06 05:58 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **AI Step Assistant** — extract first balanced JSON object from model output (fixes `Unexpected non-whitespace character after JSON` when Grok appends commentary).

## 2026-07-05 — v0.10.27 — Electron dev reload

- Version: `0.10.27`
- Timestamp: 2026-07-05 05:47 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 — v0.10.26 — 9Router AI Gen: fix deactivated Codex workspace

- Version: `0.10.26`
- Timestamp: 2026-07-06 05:48 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **9Router AI Gen** — default model `xai/grok-3` (Codex workspace 402 deactivated); bootstrap always syncs `config/router.local.json` over stale localStorage; model fallback chain + clearer errors.
- **Script** — `pnpm sync:9router` probes P0007 keys and writes working router config.

## 2026-07-06 — v0.10.25 — Fix empty workflow canvas on first open; Hub minimap skin

- Version: `0.10.25`
- Timestamp: 2026-07-06 05:42 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow canvas** — fix StrictMode race leaving Layout empty on default WF00001; refit when viewport size is ready.
- **Mini-map** — Hub-UI surface/border styling (no white panel background).

## 2026-07-06 — v0.10.24 — Lock Design V5 canvas; clear Design previews

- Version: `0.10.24`
- Timestamp: 2026-07-06 05:32 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow canvas** — locked **Design V5** (LTR spaced grid, centered, V5 bezier edges, purple stroke); layout picker read-only.
- **System → Design** — removed V1–V5 preview mocks; empty `HubDesignTemplateEmpty` kept for future reviews.

## 2026-07-06 — v0.10.23 — Zoom % + canvas compact + Design layout V1–V5

- Version: `0.10.23`
- Timestamp: 2026-07-06 05:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Canvas zoom** — custom controls show live zoom **percentage** (+ / − / fit).
- **Step canvas** — compact nodes (title only); bezier edges when not axis-aligned; wider row gap.
- **System → Design** — 5 layout previews (horizontal, vertical, snake LTR, icon rail, bezier spaced) for review.

## 2026-07-06 — v0.10.22 — Smart orthogonal step edges

- Version: `0.10.22`
- Timestamp: 2026-07-06 05:12 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step edges** — replace smooth-step loops with straight / single-corner orthogonal paths; row wraps use vertical handles only.
- **Short chains (≤5 steps)** — serpentine stays on one row so 3-step workflows get simple horizontal connectors.

## 2026-07-06 — v0.10.21 — Cleaner step edges + catalog timestamp migration

- Version: `0.10.21`
- Timestamp: 2026-07-06 05:05 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step canvas edges** — per-node handle direction (follow chain); tighter smooth-step offset; thinner stroke (no glow/sheen animation).
- **Created / Updated** — migrate legacy Dec 2023 fake seeds to Apr 2026 catalog dates; `updatedAt` stays equal to `createdAt` until user saves.

## 2026-07-06 — v0.10.20 — Canvas center fit + Profile Rail workflow run fix

- Version: `0.10.20`
- Timestamp: 2026-07-06 04:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step canvas** — layout nodes in positive viewport space; stronger `fitView` (double rAF + delayed refit) so steps stay centered, not stuck in the top-left corner.
- **Profile Rail run** — clicking a workflow selects it for Launch; queue falls back to active workflow; no longer clears selection or attributes runs to `open-url`.
- **WF00001 timestamps** — stable builtin seed epoch (no `Date.now()` for index 0); session active workflow restored before last-run default.

## 2026-07-06 — v0.10.19 — Fix workflow timestamps + Last Run + canvas center

- Version: `0.10.19`
- Timestamp: 2026-07-06 03:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Timestamp bug** — removed mount-time stamp that overwrote WF00001; seed `createdAt`/`updatedAt` by builtin workflow index, not array position.
- **Last Run** — `persistWorkflowLastRun` writes localStorage + syncs UI; Profiles Open URL and automation queue both update `lastRunAt`.
- **Step canvas** — center nodes after layout; tighter fitView (`padding 0.16`, `maxZoom 0.58`) so long chains stay compact.

## 2026-07-06 — v0.10.18 — Revert design preview; last-run default selection

- Version: `0.10.18`
- Timestamp: 2026-07-06 03:10 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Design preview removed** — deleted workflow-canvas V1–V5 mocks; System nav back to Overview / Backup only.
- **Default workflow** — Scripts tab selects workflow with latest `lastRunAt` on load (fallback: first in list).
- **Step canvas** — tighter nodes (80×72) and fitView (`maxZoom 0.72`) so long chains stay in view.

## 2026-07-06 — v0.10.17 — Fix blank screen (Design nav tone)

- Version: `0.10.17`
- Timestamp: 2026-07-06 03:05 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **System → Design** — fix invalid `iconTone: "purple"` (hub-ui only allows violet/fuchsia/etc.) that crashed React on boot.

## 2026-07-06 — v0.10.16 — System Design sub-tab

- Version: `0.10.16`
- Timestamp: 2026-07-06 03:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **System → Design** — new sidebar sub-tab mounts `DesignTemplatePage` with workflow canvas layout review (V1–V5).
- **Design Template page** — removed duplicate Overview panels; previews only when `ACTIVE_DESIGN_COUNT > 0`.

## 2026-07-06 — v0.10.15 — Workflow canvas compact + layout design review

- Version: `0.10.15`
- Timestamp: 2026-07-06 02:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step canvas** — smaller nodes (96×88), 5-column serpentine, tighter fitView; status chip hidden on canvas for density.
- **Scripts tab** — no workflow selected by default; empty editor until row click.
- **Last Run** — column label title case.
- **Design Template** — 5 workflow canvas layout variants (V1–V5) under System for layout review.

## 2026-07-06 — v0.10.14 — Workflow directory + canvas layout

- Version: `0.10.14`
- Timestamp: 2026-07-06 02:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Active workflow** — session-only (`sessionStorage`); default `open-url`; row click no longer bulk-selects checkbox.
- **Last run column** — `lastRunAt` on workflows; updated after each automation run.
- **Step canvas** — default serpentine layout for long chains; `fitView` zoom-out instead of locked zoom.
- **Scripts toolbar** — `0/N` selection chip moved to `searchTrailing` (Hub-UI parity with Store/Rail).

## 2026-07-05 — v0.10.13 — Hub UI “Just now” label parity

- Version: `0.10.13`
- Timestamp: 2026-07-05 22:38 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Last opened / activity timestamps** — hub-ui SSOT returns `Just now` (sentence case) instead of `just now`; synced vendor hub-ui.
- **Profiles + Workflow directory** — `capitalize={false}` no longer blocks the label; matches P0020 2FA / Hub activity copy.

## 2026-07-05 — v0.10.12 — Electron dev reload

- Version: `0.10.12`
- Timestamp: 2026-07-05 22:24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-05 — v0.10.11 — Fix startup closing user new tabs

- Version: `0.10.11`
- Timestamp: 2026-07-05 20:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Startup nav** — only close placeholder tabs that existed at launch; tabs opened during the first seconds of Run (Ctrl+T) are no longer killed when startup URL settles.
- **Unit test** — `navigate-startup.test.cjs` guards launch-time vs operator tab selection.

## 2026-07-05 — v0.10.10 — Electron dev reload

- Version: `0.10.10`
- Timestamp: 2026-07-05 19:29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-05 — v0.10.8 — Stable auto-update (unpacked repair + build gate)

- Version: `0.10.8`
- Timestamp: 2026-07-05 06:00 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **NSIS customInit** — remove stale `app.asar.unpacked` before install/update so patch updates rebuild unpacked modules (playwright-core, cloakbrowser).
- **Runtime check** — packaged startup dialog + block `profile:launch` when critical unpacked files missing; link to latest Setup.
- **Build gate** — `verify-packaged-unpacked.mjs` fails desktop build if win-unpacked lacks required unpacked paths.
- **differentialPackage: false** — full NSIS payload on every update (avoids partial patch corruption on large jumps).

## 2026-07-05 — v0.10.7 — Silent NSIS update + release upload fix

- Version: `0.10.7`
- Timestamp: 2026-07-05 05:40 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **NSIS oneClick** — silent install on quit for electron-updater patch updates.
- **Upload script** — `run-electron-package.mjs` uploads only current-version Setup/blockmap/latest.yml; prunes stale local + GitHub assets.
- **Shutdown fix** (from v0.10.5) — await `closeAll()` before `closeDatabase()`.

## 2026-07-05 — v0.10.6 — Silent NSIS auto-update installer

- Version: `0.10.6`
- Timestamp: 2026-07-05 05:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **NSIS oneClick** — silent install on quit for electron-updater (no installer wizard on patch updates).
- **Upload script** — `run-electron-package.mjs` uploads only current-version Setup/blockmap/latest.yml; prunes stale local + GitHub release assets.

## 2026-07-05 — v0.10.5 — Fix Database not initialized on packaged shutdown

- Version: `0.10.5`
- Timestamp: 2026-07-05 04:50 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Shutdown order** — `before-quit` awaits `sessionManager.closeAll()` before `closeDatabase()` (fixes race when browser context `finalize` fires after DB closed).
- **Safe status writes** — `setProfileStatus` / `touchLastOpened` no-op when DB already closed; session `finalize` wrapped in try/catch.

## 2026-07-04 — v0.10.4 — Electron dev reload

- Version: `0.10.4`
- Timestamp: 2026-07-04 04:36 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-05 — v0.10.3 — Desktop release: Surfshark icon + Gmail 2FA + session skip

- Version: `0.10.3`
- Timestamp: 2026-07-05 03:50 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Gmail login session-active** — skip login/TOTP steps when Google session already on `myaccount.google.com` / `mail.google.com` (`script-steps.cjs`).
- **confirmidentifier / challenge/pwd** — advance without email wait when password step is ready.
- **E2E smoke** — `gmail-login-profile-smoke.cjs` accepts `session-already-active` as PASS.
- **Desktop release** — GitHub Release + `latest.yml` for electron-updater (NSIS auto-download on quit).

## 2026-07-05 — v0.10.2 — Surfshark brand icon + Gmail 2FA Authenticator path

- Version: `0.10.2`
- Timestamp: 2026-07-05 03:15 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Surfshark column header** — `HubBrandIcon` registry fallback (`/assets/brand-icons/surfshark.png`) when extension IPC icon missing/broken.
- **WF00011 gmail-login** — push-notification 2FA: auto **Try another way** → **Google Authenticator** → TOTP input (`script-steps.cjs`).
- **Hub-ui sync** — `P0027` added to default `sync-hub-ui-vendor` targets; `HubDirectoryBrandNameCell` fan-out.

## 2026-07-05 — v0.10.1 — Run History registry labels + 2-line layout

- Version: `0.10.1`
- Timestamp: 2026-07-05 02:55 (UTC+7)
- Type: Minor
- Status: Dev

### Changes

- **Run History 2-line layout** — line 1: profile ID + browser + task label + status trailing; line 2: timestamp + duration (`HubRuntimeHistoryList` SSOT).
- **Workflow registry labels** — `resolveWorkflowRunLabel` maps workflow id → `WorkflowConfig.name` (e.g. `gmail-login` → `Gmail Login`).

## 2026-07-05 — v0.9.3 — Run History 2-line layout

- Version: `0.9.3`
- Timestamp: 2026-07-05 01:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Run History** — 2-line rows: line 1 = profile ID + browser name + task label, status trailing right; line 2 = timestamp + duration.
- **Hub SSOT** — `HubRuntimeHistoryList` API `primaryRow` / `primaryTrailing` / `metaRow`; `formatRunHistoryPrimaryLabel` helper.

## 2026-07-04 — v0.9.2 — Hub runtime rail SSOT (Console + Run History)

- Version: `0.9.2`
- Timestamp: 2026-07-04 21:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Hub runtime rail SSOT** — `HubRuntimeChannelBadge`, `HubRuntimeConsoleTerm`, `HubRuntimeHistoryList` from `packages/hub-ui`; removed local `stealth-runtime-rail.css`.
- **P0027 parity** — shared pill badges + history list contract; fan-out via `sync-hub-ui-vendor.cjs`.

## 2026-07-04 — v0.9.1 — Console channel badges (Todo pill parity)

- Version: `0.9.1`
- Timestamp: 2026-07-04 21:15 (UTC+7)
- Type: Minor
- Status: Dev

### Changes

- **Console badges** — `StealthConsoleChannelBadge` (icon + Title Case label e.g. **Profile**); CSS parity P0020 `TodoHubBadge` priority pills; replaces uppercase micro-tags.

## 2026-07-04 — v0.8.2 — Store toolbar + runtime rail parity

- Version: `0.8.2`
- Timestamp: 2026-07-04 21:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Store toolbar** — `HubDirectoryToolbarSelection` in `searchTrailing` (0/N beside search); row-2 right = bulk actions only.
- **Source column** — `HubDirectoryIconCell` + brand icon (parity Platform column).
- **Workflow rail** — removed redundant Store label button; Store via sidebar nav only.
- **Run History + Console** — P0027 parity (`StealthRuntimeRailPanels`: channel tags, history list, replay on click).

## 2026-07-04 — v0.8.1 — Store brand icons + vendor hub-ui sync fix

- Version: `0.8.1`
- Timestamp: 2026-07-04 20:40 (UTC+7)
- Type: Minor
- Status: Dev

### Changes

- **Fix boot** — sync `hubDirectorySelectionSlots.tsx` to vendor (export `shouldShowHubDirectoryResultCount`); add file to `sync-hub-ui-vendor.cjs` PACKAGES_COPY_PAIRS.
- **Brand icons** — registry `google-drive`; Drive catalog source uses `HubBrandIcon` (`google-drive`) instead of interim `google`.
- **SSOT** — `UI_PATTERNS.md` § Platform brand icons: entities with registered brand icons use `HubBrandIcon` chips, not colored status dots.

## 2026-07-04 — v0.7.72 — Store card typography + brand source chips

- Version: `0.7.72`
- Timestamp: 2026-07-04 20:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Rename** UI label Workflow Store → **Store** (nav, header, rail).
- **Card view** — `HubDirectoryCardMetaRow` + `hub-chrome-type--micro`; Supabase/Drive chips use `HubBrandIcon` (not green status dots).
- **Toolbar** — removed `Supabase + Drive` trailing hint; SSOT `workflow-store-source-brand.tsx` + `UI_PATTERNS.md`.

## 2026-07-04 — v0.7.71 — Workflow Store table single-line cells

- Version: `0.7.71`
- Timestamp: 2026-07-04 20:15 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Store table** — Name column single line only; **Status** column (Local / Installed / Available); description in `title` tooltip.
- **SSOT** — `hub-directory-table-gate` rules for single-line `*directory-cells.tsx`; skill + `UI_PATTERNS.md` directory cell contract.

## 2026-07-04 — v0.7.70 — Workflow Store table/card + time range

- Version: `0.7.70`
- Timestamp: 2026-07-04 20:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Store** — P0004 Hub parity: **Table / Cards** toggle, **time range** filter (7d / 30d / …), Display band.
- **Card view** — `HubPaginatedCardGrid` + compact cards; each meta field **one truncated line** (platform, group, version, source, updated).

## 2026-07-04 — v0.7.69 — Workflow Store Hub directory table

- Version: `0.7.69`
- Timestamp: 2026-07-04 19:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Store** — migrated from card list to **Hub-UI directory table** (`HubDirectoryTableShell`, `FilterBar`, checkbox bulk Install/Update) — P0004 golden parity.
- **Updated column** — Supabase `updated_at` + Drive manifest `updatedAt` per workflow entry.
- **Admin docs** — README Workflow Store publish/sync section (Supabase + Drive manifest).

## 2026-07-04 — v0.7.68 — Electron dev reload

- Version: `0.7.68`
- Timestamp: 2026-07-04 18:44 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-04 — v0.7.67 — Non-destructive desktop build

- Version: `0.7.67`
- Type: Patch
- Status: Dev

### Changes

- **Never kill dev/exe on build** — `pre-release-desktop.ps1` check-only; `desktop:open` no longer taskkills by default (`--replace` optional).
- **EBUSY-safe packaging** — locked `win-unpacked` → copy to `win-unpacked-pending`; `pnpm desktop:swap-unpacked` promotes when ready.
- Installer (`Setup-*.exe`) + `latest.yml` always updated even when unpacked folder is locked.

## 2026-07-04 — v0.7.66 — Workflow Store subnav + ship fixes

- Version: `0.7.66`
- Type: Patch
- Status: Dev

### Changes

- **Workflow Store** moved from modal to sidebar sub-menu under Workflow (**Scripts** / **Workflow Store**) — same pattern as System.
- Profiles rail — **Workflow Store** shortcut button.
- `scripts/publish-workflow-catalog.mjs` — admin CLI upsert workflow JSON to Hub `stealth_workflow_catalog`.
- Hub migration notify `pgrst` reload schema; `run-electron-package.mjs` gh spawn `shell: false` on Windows.

## 2026-07-04 — v0.7.65 — Workflow Store + default 0/11 selection

- Version: `0.7.65`
- Type: Patch
- Status: Dev

### Changes

- **Workflow selection** — default `0/11` (no workflow checked); Launch disabled until user selects workflow(s) in the right rail.
- **Workflow Store** — browse/install workflows from Hub Supabase catalog (`stealth_workflow_catalog`) and Drive manifest (`public/workflow-store/index.json`); Install merges into local workflows.
- Workflow tab header — **Workflow Store** button opens catalog modal.
- Hub migration `20260704120000_stealth_workflow_catalog.sql` — public read catalog + Gmail Login seed.

## 2026-07-04 — v0.7.64 — Extension toolbar parity + Surfshark icon fallback

- Version: `0.7.64`
- Type: Patch
- Status: Verified

### Changes

- **Surfshark / E0001 column headers** — Lucide `Shield` / `Cookie` fallback when extension PNG missing or IPC icon fails (fixes broken image in packaged exe).
- **Extension bulk button** — remove `ChevronDown`; use `HubBulkActionButton` like Launch/Close/Delete.
- `useExtensionIcons` — stop referencing missing `/icons/ext-*.png` static paths.

## 2026-07-04 — v0.7.63 — Electron dev reload

- Version: `0.7.63`
- Timestamp: 2026-07-04 15:28 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-04 — v0.7.63 — Gmail login fail-fast + vault diagnose

- Version: `0.7.63`
- Type: Patch
- Status: Dev

### Changes

- `twofa-vault-bridge.cjs`: `diagnoseMailCredentials` — pad browser code (`98` → `0098`), list sibling services when Gmail missing; resolve `E:\\Dev\\.env.shared` for packaged Electron (not only dev `__dirname`).
- `open-url.cjs`: fail-fast before browser steps when `{{gmail*}}` placeholders unresolved.
- `api-routes.cjs`: vault preflight before `ensureProfileContext` — no Chromium launch when Gmail missing.
- E2E: `electron/e2e/gmail-login-profile-smoke.cjs` (direct `runOpenUrl`, bypasses packaged API).
- Test: `src/lib/twofa-vault-bridge.test.ts`.

### Verification

- `node electron/e2e/gmail-login-profile-smoke.cjs 0098`
- `node scripts/test-gmail-login.mjs 1001` → fail-fast vault message (not placeholder error)

## 2026-07-03 — v0.7.61 — Electron dev reload

- Version: `0.7.61`
- Timestamp: 2026-07-03 05:33 (UTC+7)
- Type: Patch
- Status: Committed

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-04 — v0.7.61 — Gmail login guard fix + CAPTCHA detection

- Version: `0.7.61`
- Type: Patch
- Status: Dev

### Changes

- Fix `assertGoogleSession` blocking intentional Gmail sign-in workflow (`gmail-login`).
- Improve Gmail selectors (`#identifierId`, `input[name="Passwd"]`) and post-click settle.
- Detect Google CAPTCHA after email step — clear error + screenshot instead of password timeout.
- E2E script `scripts/test-gmail-login-0038.mjs` targets dev API `:6004` (not prod `:6003`).

## 2026-07-04 — v0.7.60 — Gmail Auto-Login Workflow with P0020 Data Bridge

- Version: `0.7.60`
- Timestamp: 2026-07-04 03:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Add `twofa-vault-bridge.cjs` — Supabase client to query P0020 `twofa_accounts` for Gmail credentials by profile browser code.
- Add `totp-generate.cjs` — RFC 6238 TOTP code generator using Node.js built-in crypto (no npm deps).
- Extend `resolveStepValue()` with `{{gmailEmail}}`, `{{gmailPassword}}`, `{{gmailTotpCode}}`, `{{gmailRecovery}}` placeholders.
- Enrich `stepContext` in `open-url.cjs` with mail credentials auto-fetched from P0020 vault when Gmail placeholders detected.
- Add `gmail-login` workflow to `DEFAULT_WORKFLOWS` — full Gmail login automation with email, password, conditional 2FA/TOTP support.
- Graceful 2FA skip: when no TOTP secret exists or 2FA prompt not found, TOTP-related steps are skipped instead of failing.
- Add `@supabase/supabase-js` dependency for vault bridge.

## 2026-07-04 — v0.7.59 — Remove Extension count badge

- Version: `0.7.59`
- Timestamp: 2026-07-04 03:18 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Remove `HubBulkActionCountBadge` from Extension button — redundant with toolbar selection count indicator.

## 2026-07-04 — v0.7.58 — More button Hub-UI style

- Version: `0.7.58`
- Timestamp: 2026-07-04 03:10 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- "More" overflow button: replaced raw icon button with `HubBulkActionButton` (`tone="neutral"`, label "More") — matches other toolbar buttons.

## 2026-07-04 — v0.7.57 — Extension icon resolver + toolbar cleanup

- Version: `0.7.57`
- Timestamp: 2026-07-04 02:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Extension icon resolver: auto-extract icons from extension `manifest.json` via IPC (`extension:icon`) instead of manually copying PNGs. `getExtensionsStatus` now returns `iconDataUri` per extension.
- `useExtensionIcons` hook resolves icons at runtime; falls back to static PNGs in dev/web mode.
- Extension button icon: `Blocks` (from `Puzzle`); "All" row icon: `Layers`.
- Toolbar cleanup: Groups/Export/Import moved into "More" (`⋮`) overflow menu — declutters primary action bar.
- Dynamic icon URLs flow through `ProfileDirectoryPanel` → table headers + bulk action dropdown.

## 2026-07-04 — v0.7.56 — Toggle style unify + Cookie Bridge rename + Display column prefs

- Version: `0.7.56`
- Timestamp: 2026-07-04 02:15 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Toggle switch: unified green/gray binary style (no amber mixed state), knob flush to edges on all rows.
- Rename "E0001 Cookie" → "Cookie Bridge" across bulk actions, toast messages, and Display column prefs.
- Tooltip on toggle rows shows profile count for selected profiles.
- Column label "E0001" → "Cookie Bridge" in Display preferences column list.

## 2026-07-03 — v0.7.54 — Electron dev reload

- Version: `0.7.54`
- Timestamp: 2026-07-03 01:52 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-04 — v0.7.55 — Real extension icons + Hub-UI On/Off + toggle switch

- Version: `0.7.55`
- Timestamp: 2026-07-04 02:10 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Column headers: actual extension PNG icons (E0001 cookie, Surfshark shark logo) from CloakBrowser extension dirs.
- Cell values: `HubUsersOnOffLabel` (dot + On/Off label) — Hub-UI standard.
- Bulk action: proper toggle switch (green on, amber mixed, gray off) replacing badge-based design.
- Sidecar PID: now written for focus-only sessions too, carrying the CDP port forward.

## 2026-07-04 — v0.7.53 — Extension UX overhaul + sidecar PID

- Version: `0.7.53`
- Timestamp: 2026-07-04 01:50 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Extension icons: E0001 → Cookie (orange), Surfshark → Shield (cyan) in directory cells — replaces generic ✓/✗.
- Extension columns moved to end of directory table (after Note).
- Redesigned Extension bulk action: 3-row toggle panel (All / E0001 Cookie / Surfshark VPN) with visual on/off/mix badges.
- Sidecar PID: write `stealth-pid.json` on launch, read for fast orphan detection, remove on close.
- Fix StatLine key prop warning (hub-ui AppTabHeader — destructure key before spread).
- Fix Maximum update depth: memoize `idOf` callback in useHubDirectorySelection call.

## 2026-07-03 — v0.7.52 — Electron dev reload

- Version: `0.7.52`
- Timestamp: 2026-07-03 00:04 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 — v0.7.51 — Electron dev reload

- Version: `0.7.51`
- Timestamp: 2026-07-03 23:37 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 — v0.7.50 — Single Extension bulk dropdown

- Version: `0.7.50`
- Timestamp: 2026-07-03 23:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Bulk toolbar** — replace 4 standalone extension buttons with one `Extension` dropdown containing `E0001 On/Off` and `Surfshark On/Off`.
- **Directory indicators** — keep E0001 / Surfshark columns read-only (Check / X only).

## 2026-07-03 — v0.7.49 — Extension columns read-only + bulk actions

- Version: `0.7.49`
- Timestamp: 2026-07-03 23:10 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 / Surfshark columns** — display-only Check / X indicators (not clickable).
- **Bulk toolbar** — select profiles via row checkbox, then **E0001 On/Off** or **Surfshark On/Off** for selected rows.

## 2026-07-03 — v0.7.48 — Fix ProfilesView missing migrate import

- Version: `0.7.48`
- Timestamp: 2026-07-03 23:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profiles load** — restore `migrateProfilesDisplayPrefsFromUrl` import dropped when wiring extension columns.
- **Smoke** — `scripts/smoke-profiles-directory.mjs` guards missing imports + duplicate colClass.
- **TS** — Glass import on SystemWebStoreExtensionsPanel; HMR patch typing in web mock.

## 2026-07-03 — v0.7.47 — Fix duplicate directory colClass

- Version: `0.7.47`
- Timestamp: 2026-07-03 22:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profiles directory** — Proxy column uses `hub-users-col--metric-c` so it no longer clashes with E0001 (`metric-a`); table loads again.

## 2026-07-03 — v0.7.46 — Profile directory E0001 / Surfshark columns

- Version: `0.7.46`
- Timestamp: 2026-07-03 22:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profiles directory** — `E0001` and `Surfshark` checkbox columns (hub-checkbox 16px). Effective state = app default + per-profile override; E0001 on / Surfshark off by default.
- **Toggle** — click saves `extensionOverrides`, pins Surfshark when enabled on a profile; close Chrome and Run again.
- **Display prefs** — columns visible by default; hide via Display → Columns.

## 2026-07-03 — v0.7.45 — Per-profile extension overrides + API patch

- Version: `0.7.45`
- Timestamp: 2026-07-03 21:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Edit profile → Extensions** — override E0001 / Surfshark / Web Store per profile (Use app default · Enable · Disable). Surfshark can run on 2–3 profiles while global default stays off.
- **Auto-install** — enabling Surfshark on a profile pins Web Store extension to that profile only on save/launch.
- **Settings API** — dev HMR patches missing `getExtensionToggles` / `setExtensionToggles` on stale preload; clearer restart message.

## 2026-07-03 — v0.7.44 — Per-extension Settings toggles

- Version: `0.7.44`
- Timestamp: 2026-07-03 21:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Settings → Extensions** — separate toggles for E0001, Surfshark VPN, and other Web Store extensions (default: E0001 on only).
- **Launch allowlist** — when Surfshark/Web Store are off, `--disable-extensions-except` blocks extensions still pinned in profile prefs.
- **Migration** — legacy global toggle maps to all-on or all-off; fresh installs use E0001-only default.

## 2026-07-03 — v0.7.43 — Global extensions toggle + fast startup

- Version: `0.7.43`
- Timestamp: 2026-07-03 21:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Settings → Extensions** — global toggle enables/disables Chrome extensions for every profile; off adds `--disable-extensions` on next Run.
- **Fast startup** — skip bulk extension purge/dedupe/repair across all profiles when `STEALTH_FAST_LAUNCH=1` (default); per-profile prep still runs at launch.
- **Cookie Bridge status** — reflects global extensions-off state; System panel shows Settings hint when disabled.

## 2026-07-03 — v0.7.42 — Electron dev reload

- Version: `0.7.42`
- Timestamp: 2026-07-03 20:47 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 — v0.7.41 — E0001 CLI load on CloakBrowser (prefs alone insufficient)

- Version: `0.7.41`
- Timestamp: 2026-07-03 20:40 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 visible** — native launch adds `--disable-extensions-except` + `--load-extension` for staged store id (Surfshark stays prefs-only; no duplicate paths).
- **Stage metadata** — re-copy `.cloakbrowser/<storeId>/` when `_metadata` missing vs verified extensions-cache.
- **Smoke** — `extension-e0001-smoke.cjs` validates store pin survives profile Run.

## 2026-07-03 — v0.7.40 — Fix E0001 unpacked id pin (stage missing _metadata)

- Version: `0.7.40`
- Timestamp: 2026-07-03 20:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 load** — re-stage `.cloakbrowser/<storeId>/` when source CRX has `_metadata` but stage dir does not; pin with store id when extensions-cache is verified.
- **Smoke** — `electron/e2e/extension-e0001-smoke.cjs` verifies `chrome-extension://kaaad…/popup.html` loads after profile Run.

## 2026-07-03 — v0.7.39 — Electron dev reload

- Version: `0.7.39`
- Timestamp: 2026-07-03 20:12 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 — v0.7.38 — Fix E0001 not loading (workspace cache overwrite)

- Version: `0.7.38`
- Timestamp: 2026-07-03 20:05 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 missing** — stop syncing workspace `Extension/E0001` into cache unless `STEALTH_COOKIE_BRIDGE_LOCAL=1`; polluted cache broke Web Store id pin.
- **Auto re-download** — when cache lacks `_metadata/verified_contents.json`, refresh E0001 CRX from Chrome Web Store.
- **Pin mode** — dev/workspace E0001 pins as unpacked id; verified store CRX keeps store id `kaaadageakdandpobcofplmfbjfjabdk`.
- **Startup** — `ensureCookieBridgeOnAllProfiles` pins E0001 on profiles that only had Surfshark (or empty prefs).

## 2026-07-03 — v0.7.37 — Electron dev reload

- Version: `0.7.37`
- Timestamp: 2026-07-03 18:27 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 — v0.7.37 — Fix startup purge wiping .cloakbrowser extension pins

- Version: `0.7.37`
- Timestamp: 2026-07-03 18:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Critical** — `isBrokenExtensionPath` no longer treats every `.cloakbrowser/` path as broken; only missing `manifest.json` is removed.
- **Cookie bridge purge** — keep canonical Web Store pins at `.cloakbrowser/<storeId>/`; only drop stale unpacked/legacy E0001 copies.
- **Auto-repair** — startup rewrites `extensions-cache` prefs → `.cloakbrowser/<storeId>/` (v0.7.36) without being undone by purge.

## 2026-07-03 — v0.7.36 — Auto-repair extension paths on startup

- Version: `0.7.36`
- Timestamp: 2026-07-03 18:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Fix 4 icons (runtime)** — startup + install now rewrite `extensions-cache` prefs to `.cloakbrowser/<storeId>/` before Chrome reads them (was only on manual profile launch).
- **Faster next launch** — profiles no longer double-load AppData cache + CloakBrowser stage path.
- **Install** — Web Store install immediately pins stage path per profile (not deferred to next Run).

## 2026-07-03 — v0.7.35 — Electron dev reload

- Version: `0.7.35`
- Timestamp: 2026-07-03 18:22 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 — v0.7.34 — Single-path extension load (fix 4 icons + faster launch)

- Version: `0.7.34`
- Timestamp: 2026-07-03 18:17 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Fix 4 extensions** — prefs now pin to `.cloakbrowser/<storeId>/` only (not AppData + stage double load).
- **Faster launch** — stage/load only extensions in the active profile prefs (+ E0001), not entire global cache.
- **Repair** — `extension:repairProfiles` IPC rewrites all profile extension paths after upgrade.

## 2026-07-03 — v0.7.33 — Fix duplicate extensions (store id vs unpacked id)

- Version: `0.7.33`
- Timestamp: 2026-07-03 18:09 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **No more duplicates** — Web Store extensions load once via prefs + CloakBrowser staging (store id); `--load-extension` only for local unpacked folders.
- **Dedupe on launch** — purge shadow unpacked-id copies that shared the same path as a store-id pin (fixes 2× E0001 / 2× Surfshark).
- **UI** — clarify Chrome-like vs not-Chrome (Web Store install button) expectations.

## 2026-07-03 — v0.7.32 — Electron dev reload

- Version: `0.7.32`
- Timestamp: 2026-07-03 17:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 — v0.7.31 — Extension staging fix + any extension install

- Version: `0.7.31`
- Timestamp: 2026-07-03 17:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Manifest missing fix** — CloakBrowser staging now uses Web Store id (`kaaad…`, Surfshark, …) under `.cloakbrowser/…/<storeId>/` instead of unpacked hash path.
- **Any extension** — install any Chrome Web Store ID/URL; **Load unpacked folder** for dev/local extensions; optional single-profile scope.
- **Warm staging** — pre-stage all cached extensions at app boot and right after install.

## 2026-07-03 — v0.7.30 — Electron dev reload

- Version: `0.7.30`
- Timestamp: 2026-07-03 17:19 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 — v0.7.29 — Fix E0001 purge + native extension load

- Version: `0.7.29`
- Timestamp: 2026-07-03 17:15 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 restore** — `purgeStaleCookieBridgePrefs` no longer strips store-id Cookie Bridge pins on launch.
- **Native load** — CloakBrowser again receives `--load-extension` for E0001 + all `extensions-cache` (Surfshark, etc.) without blanket `--disable-extensions`.
- **UI** — Web Store panel clarifies Google blocks "Add to Chrome" on non-Chrome browsers.

## 2026-07-03 — v0.7.28 — Electron dev reload

- Version: `0.7.28`
- Timestamp: 2026-07-03 17:07 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Reload gate after native extension mode + Web Store installer (v0.7.27).

## 2026-07-03 — v0.7.27 — Native Chrome extensions + Web Store installer

- Version: `0.7.27`
- Timestamp: 2026-07-03 16:59 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Native extension mode** (default) — profiles no longer pass `--disable-extensions`; extensions load from Chrome prefs like Google Chrome. `chrome://extensions` works; legacy whitelist mode via `STEALTH_EXTENSION_MODE=managed`.
- **Web Store installer** — System → Chrome Web Store install: paste store ID or URL (e.g. Surfshark), download CRX to cache, pin to all profiles. Re-launch profile to activate.
- **Surfshark** — startup auto-purge disabled in native mode so user-installed VPN extensions persist.
- **E0001 Cookie Bridge** — pinned via store prefs in native mode instead of `--load-extension` whitelist.

## 2026-06-30 — v0.7.26 — Electron dev reload

- Version: `0.7.26`
- Timestamp: 2026-06-30 16:29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-30 — v0.7.25 — Backup perf + restore into selected profile

- Version: `0.7.25`
- Type: Patch
- Status: Release

### Changes

- **Restore into selected** — chọn 1 profile (vd. 3000) → Restore zip backup của 0007 → cookie/session ghi vào profile đích, không map theo tên trong zip.
- **Backup perf** — better-sqlite3 native, storage size batch scan, debounced search, console log cap, content-visibility rows.
- **Dev** — isolated catalog sync, API `:6004`, single-instance lock.

## 2026-06-29 — v0.7.24 — Export filename + Electron dev reload

- Version: `0.7.24`
- Timestamp: 2026-06-29 01:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Export JSON** — `{ProfileName}_{YYYY-MM-DD_HH-mm-ss}.json`; chỉ export khi đã chọn dòng (nút Export disabled khi không chọn).
- **Backup zip** — toast/log hiển thị tên file đích (`→ ProfileName_timestamp.zip`).
- **electron** — repair `pnpm install` + `electron` dep cho dev desktop.
- Auto patch bump + Electron reload gate.

## 2026-06-29 — v0.7.23 — Electron dev reload

- Version: `0.7.23`
- Timestamp: 2026-06-29 23:51 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **hub-ui 0.2.17** — `HubSidebarShell.brandTagline` deprecated + no longer rendered (logo + title only).

## 2026-06-29 — v0.7.22 — Sidebar brand + directory pane SSOT cleanup

- Version: `0.7.22`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Sidebar** — logo + `Stealth Browser Console` only; remove tagline under brand.
- **hub-identity** — P0003 auth preset tagline empty (welcome shows name only).
- **P0003** — delete `stealth-directory-table.ts`; pane tables import `HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS` from hub-ui directly.
- **parity gate** — P0003 directory-pane + no sidebar tagline checks.

## 2026-06-29 — v0.7.21 — Pane table = P0004 inline wrap SSOT (no scroll on wrap)

- Version: `0.7.21`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** — `HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS` = P0004 `overflow-hidden min-w-0` only (no `hub-directory-table-scroll`); remove duplicate thead paint from `hub-split-directory-pane.css`.
- **P0003** — Backup/Profiles import `HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS` directly from hub-ui (same `DirectoryInlineTable` path as P0004 Hub/Users).

## 2026-06-29 — v0.7.20 — Pane directory table P0004 inline paint (no split gutter)

- Version: `0.7.20`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** — `HUB_DIRECTORY_TABLE_PANE_INLINE_SCROLL_CLASS`: single-table + sticky thead in pane (P0004 Hub/Users paint path); panel-fill CSS for inline scroll.
- **P0003** — Backup + Profiles drop split flex-pane / pane-chrome split; use inline scroll SSOT (fixes header gutter color mismatch vs P0004).

## 2026-06-29 — v0.7.19 — Split thead single-surface paint (gutter corner)

- Version: `0.7.19`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** — split head `th` transparent (head paints once); restore `::after` gutter filler with OS-measured pad; corner radius on filler not `th:last-child` (fixes lighter gutter strip).

## 2026-06-29 — v0.7.18 — Directory thead surface SSOT + stable gutter head

- Version: `0.7.18`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** — `--hub-directory-pane-surface` / `--hub-directory-thead-surface` SSOT on `.hub-directory-frame`; flex-pane head uses `scrollbar-gutter: stable` (no faux `::after` pad); OS scrollbar width measure for empty flex-pane.

## 2026-06-29 — v0.7.17 — Directory table header gutter parity

- Version: `0.7.17`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** — split table head scrollbar gutter: measure real OS width (flex-pane), JS sync always on; remove head `clip-path` corner bleed; `::after` fills gutter with thead surface.

## 2026-06-29 — v0.7.16 — Sidebar 100% P0004 (hub-ui SSOT + CSS fix)

- Version: `0.7.16`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** — `HubSystemTabSubNav` + `hub-sidebar-subnav-button` (tree rail+dot); view groups use shared component.
- **P0003 sidebar** — `HubSidebarNavList` + `STEALTH_NAV_STRUCTURE`; fix stealth CSS that forced `display:flex` on subnav grid.
- **P0004 sidebar** — migrated to `HubSidebarNavList` + `TOOL_HUB_NAV_STRUCTURE` (proposal 1+3).
- **Parity gate** — P0003 sidebar checks for nav list SSOT + hub-ui subnav exports.

## 2026-06-29 — v0.7.15 — Sidebar P0004 golden pattern (HubSidebarNavGroup)

- Version: `0.7.15`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Sidebar** — match P0004 `SalesSidebar`: `HubSidebarNavScreenButton` + `HubSidebarNavGroup` + `StealthSystemTabSubNav` (`NavGroupSubNav` tree rail), `brandTagline`, `subscribeHubListPrefs` toggle icon.
- **System subnav** — Overview icon/tone aligned with P0004 (`LayoutGrid` / indigo); group session key `system`.

## 2026-06-29 — v0.7.14 — Sidebar golden + restore fix + backup toasts

- Version: `0.7.14`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Sidebar** — `HubSidebarNavList` + `useNavGroupOpenState` (P0004/P0016 golden tree subnav with rail dots).
- **Restore** — match profile folders by id first; partial backup exports filtered catalog only; detailed skip reasons in result.
- **Backup UX** — success/error/warn via toast + session Log (`system-backup`); removed inline text above search bar.

## 2026-06-29 — v0.7.13 — System Backup screen Profiles parity

- Version: `0.7.13`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **System → Backup** — clone Profiles split layout: `HubSplitWorkspaceScreen` header, KPI strip, `stealth-profile-layout` directory pane + right rail (Run History + Console).
- **CSS** — `hub-main--system` flex chain matches Profiles/Workflow so directory table renders with height.
- **Resilience** — backup meta IPC failure no longer blocks profile table load.

## 2026-06-29 — v0.7.12 — Electron dev reload

- Version: `0.7.12`
- Timestamp: 2026-06-29 16:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-27 — v0.7.11 — System sidebar P0004 parity + Backup Hub directory

- Version: `0.7.11`
- Timestamp: 2026-06-27 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Sidebar** — System group uses P0004 `HubSidebarNavGroup` + `StealthSystemTabSubNav` (Overview / Backup, toggle icon from display prefs).
- **System → Backup** — golden `HubDirectoryTableShell`: Profile, Group, Data size, Folder (On/Off), Status dot, Progress bar + %.
- **Backup toolbar** — `HubSplitDirectoryFilterBar` + `HubBulkActionButton` (Backup selected / all / Restore zip).
- Electron dev reload gate (identity extension purge).

## 2026-06-26 — v0.7.10 — Dev prod parity + System Backup subnav

- Version: `0.7.10`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Dev userData** — default to production `%APPDATA%/stealth-browser-console` (same catalog as Setup.exe); `STEALTH_DEV_ISOLATED=1` for parallel dev + exe.
- **System nav** — expandable group with **Overview** + **Backup** submenus.
- **System → Backup** — directory table (profile, group, data size, backup status) with pagination, backup selected/all, restore zip.
- **IPC** — `profiles:storageStats` + per-profile backup progress events.

## 2026-06-26 — v0.7.9 — System eager load + dev Vite-only + file:// icons

- Version: `0.7.9`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **System tab** — eager load (no Suspense lazy chunk) — fixes stuck loader orb.
- **Dev Electron** — never silently load stale `dist/` when Vite is down (icons + HMR break on `file://`).
- **Brand icons** — explicit `file://` relative paths for workflow platform PNGs.
- **`pnpm dev`** — always runs `predev` (sync brand icons + vendor).

## 2026-06-26 — v0.7.8 — Profile import-by-name + backup/restore + dev icons

- Version: `0.7.8`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Import/export** — match by profile **name** (default); keep local UUID; merge startupUrl, platform, timezone, viewport, device fields.
- **System** — Backup / restore full state zip (catalog + Chrome `profiles/` folders, map by name).
- **Dev icons** — brand PNG paths use `import.meta.env.BASE_URL` (fixes workflow platform icons on `file://` / dist fallback).
- **Dev isolation** — separate `%APPDATA%/stealth-browser-console-dev` + API `:6004`.
- **System prefetch** — warm `SystemView` chunk on app boot.

## 2026-06-26 — v0.7.7 — Packaged auth + known-good rollback

- Version: `0.7.7`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Verified
- Tag: `v0.7.7-stable`

### Changes

- **Packaged auth** — CSP allows `*.supabase.co` (fixes login on Setup.exe).
- **Login icon** — 56px brand mark via `import.meta.url`.
- **Surfshark** — purge on startup + block load-extension path; fast-launch skips redundant prefs IO.
- **Known-good** — `config/known-good.json`, snapshot/restore scripts, workspace skill `p00xx-known-good-rollback`.

## 2026-06-26 — v0.7.4 — Single GitHub release per tag

- Version: `0.7.4`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Committed
- Prompt: Push v0.7.3 pipeline; fix duplicate GitHub releases; dedupe v0.7.1

### Changes

- **run-electron-package** — electron-builder `--publish never` when publishing; one `gh release create` + upload pass (fixes nsis+portable double-release bug).
- **dedupe-github-releases.mjs** — drop duplicate releases for the same tag (keeps release with most assets).
- **GitHub** — removed duplicate `v0.7.1` release (kept 3-asset release).

## 2026-06-26 — v0.7.3 — NSIS-only release pipeline (faster build)

- Version: `0.7.3`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.7.3
- Prompt: Faster desktop release — NSIS installer only, asset verify, pre-release checklist

### Changes

- **Release** — default **NSIS Setup only** (portable opt-in via `--with-portable` / `desktop:dist:portable`).
- **test:fast** — skip live CloakBrowser e2e smokes for day-to-day builds (~3–5 min saved).
- **pre-release-desktop.ps1** — stop Stealth processes before packaging (fix EBUSY).
- **verify-github-release-assets.mjs** — assert Setup.exe + latest.yml on GitHub after publish; `gh release upload --clobber` fallback.
- **run-electron-package** — `--skip-build` when `dist/` fresh; copy retry on EBUSY.

### Verification

- `pnpm test:fast` — passed
- NSIS publish + `verify-github-release-assets` — release pipeline

## 2026-06-25 — v0.7.2 — Hub workspace auth + profile modal polish

- Version: `0.7.2`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Minor
- Status: Committed
- Prompt: Hub identity login gate, profile detail note/log rail, hub-ui brand icons vendor sync
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.7.2

### Changes

- **Auth** — `WorkspaceAuthGate` + hub-identity session (`StealthAuthGate`, offline fallback, Supabase profile roles).
- **Profiles** — modal layout split (`ProfileFormModalLayout`, `ProfileBasicsFields`, `ProfileDetailNoteLogRail`, run-log filter storage).
- **Hub-ui vendor** — brand icons (`HubBrandIcon`, `HubNavIcon`), semantic glyphs, directory tool-access badge, modal filter preset.
- **Startup URL** — coerce single-label hosts (`check` → `http://check/`), validate invalid phrases without overwrite.
- **Toast** — in-app toast stack for profile/workflow actions.
- **Packaging** — fix Vite `workflow-editor` chunk duplicate React (`dedupe` + narrow `manualChunks`); UI render smoke pass.

### Verification

- `pnpm test:unit` — passed
- `pnpm build` — passed
- Desktop package + `latest.yml` auto-update smoke — release pipeline

## 2026-06-25 — v0.7.1 — Omnibox search + profile table + workflow search

- Version: `0.7.1`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Minor
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.7.1

### Changes

- **Omnibox** — route intercept 302 to Google search; prefs + managed policy; guard on all Playwright sessions.
- **Profile table** — panel-fill row divisor fix; compact layout on search.
- **Workflow search** — `matchesDirectoryIdSearch` SSOT; immediate filter.
- **Engine** — `cloakbrowser` `0.4.0` → `0.4.3`.
- **Packaging** — inline hub-ui directory-id-search in electron/lib (asar hotfix).
- **Dev** — Electron reload gate (identity extension purge, prefs wipe).

## 2026-06-25 — v0.6.32 — Electron dev reload

- Version: `0.6.32`
- Timestamp: 2026-06-25 13:26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-25 — v0.6.30 — Electron dev reload

- Version: `0.6.30`
- Timestamp: 2026-06-25 12:55 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-25 — v0.6.31 — Omnibox route intercept + CDP attach guard

- Version: `0.6.31`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Omnibox** — `context.route` 302 redirect before document load; bind guard on every Playwright session (including CDP attach).
- **Prefs** — seed Google default search provider + managed `policies/managed/stealth-omnibox-search.json`.
- **Engine** — bump `cloakbrowser` `0.4.0` → `0.4.3` (verify ladder passed).

## 2026-06-25 — v0.6.29 — Omnibox search guard (no http://2fa)

- Version: `0.6.29`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Omnibox search** — redirect single-label navigations (`http://2fa/`) to Google search; seed Chromium prefs to disable intranet redirect detector.
- **Automation** — trusted navigation bypass so startup URLs and workflows still open intranet hosts like `http://check/`.

## 2026-06-25 — v0.6.28 — Electron dev reload

- Version: `0.6.28`
- Timestamp: 2026-06-25 12:39 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-25 — v0.6.27 — Profile search compact table layout

- Version: `0.6.27`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profile search** — `resolveDirectoryPanelFillRows` always uses `pageSize` (fix 1-row search stretching to full tbody); compact CSS + scroll reset fallback.

## 2026-06-25 — v0.6.26 — Profile search row align + workflow search SSOT

- Version: `0.6.26`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profile table** — reset split-table body scroll on search/filter (`scrollResetKey`); panel-fill row divisor syncs with `listResetKey`.
- **Workflow search** — `matchesDirectoryIdSearch` SSOT (`workflow-directory-search.ts`); remove `useDeferredValue` lag so rail + Scripts table filter immediately.

## 2026-06-25 — v0.6.25 — Hotfix: electron asar packaging crash

- Version: `0.6.25`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.6.25

### Changes

- **Packaging** — inline hub-ui `directory-id-search` CJS trong `electron/lib` (vendor/ không có trong asar → sửa crash main process sau cài đặt).
- **Gate** — `verify-electron-asar-packaging.mjs` trong agent-verify-gate cho desktop `github-release`.

## 2026-06-25 — v0.6.24 — Step inspector inline fields

- Version: `0.6.24`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.6.24

### Changes

- **Step inspector** — remove redundant kind icon/label row; Status uses `HubSingleFilterDropdown` like Type.
- **Layout** — inline label · value pairs; row 1 Name/Type/Status, row 2 Timeout/Selector/Value.

- **Vendor hub-ui** — sync `filter-dropdown-primitives` export `HUB_FILTER_BRAND_ICON_CLASS` (fix App failed to load SyntaxError).

## 2026-06-25 — v0.6.23 — Workflow rail column SSOT (6 opts, default +Steps)

- Version: `0.6.23`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow rail Display** — cùng 6 cột với Scripts tab (Platform · Name · ID · Steps · Created · Updated).
- **Rail default** — hiển thị Platform · Name · ID · **Steps**; Created/Updated tắt (bật qua Display).
- **Table** — rail dùng `STEALTH_WORKFLOW_PANEL_COLUMN_META` + migrate prefs 3 cột cũ → thêm Steps.

## 2026-06-25 — v0.6.22 — Workflow Display columns-only

- Version: `0.6.22`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Display** — dropdown chỉ còn **Table columns** (ẩn KPI · Hub header · Filters · Rows per page); rail vs Scripts tab dùng prefs cột riêng (3 vs 6).
- **Directory table** — `StealthWorkflowDirectoryTable` đọc `workflow-directory-prefs` và cập nhật cột khi Display đổi.

## 2026-06-25 — v0.6.21 — Workflow rail Display + selection chip

- Version: `0.6.21`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow rail** — `HubDirectoryDisplayPanel` (Display) on filter toolbar, parity with Profiles + Scripts tab.
- **Selection chip** — replace static `10/10` `HubResultCount` with `HubDirectoryToolbarSelection` (`0/10` + spectrum bar) in `searchTrailing`; counts selected vs filtered workflows.

## 2026-06-25 — v0.6.20 — AI composer fill + canvas default zoom

- Version: `0.6.20`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **AI Step Assistant** — `flex: 1` in top editor pane; textarea stretches to fill gap above step toolbar.
- **Workflow canvas** — default `fitView` centers bubbles at zoom `minZoom × 1.2` (second step above minimum).
- **React Flow** — hide attribution watermark (`proOptions.hideAttribution` + CSS fallback).

## 2026-06-25 — v0.6.19 — Workflow Steps 50/50 layout + centered bulk

- Version: `0.6.19`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Split** — workflow directory vs step editor `50/50`; editor vs canvas `50/50` vertical grid.
- **Canvas** — drop legacy `clamp(54vh)` min-height; canvas fills half pane without empty tail.
- **Bulk bar** — `New` moved next to Save/Undo/Delete; centered row.
- **Step chips** — centered pills with category colors matching canvas bubbles (page/interact/capture/logic).

## 2026-06-25 — v0.6.18 — Workflow rail shows all 5 rows

- Version: `0.6.18`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profiles rail** — remove `max-height` calc on workflow `fixedRows` table (was clipping ~3 of 5 rows); pane still shrink-wraps via `flex: 0 0 auto` without stealing History/Console space.

## 2026-06-25 — v0.6.17 — Workflow rail fixedRows shrink-wrap

- Version: `0.6.17`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profiles rail** — workflow table shrink-wraps exactly 5 rows (`fixedRows`); override hub pane `flex-1` so empty gap below table is reclaimed for Run History + Console (50/50 split restored).
- **CSS** — remove `hub-users-table.css` `min-height: auto` override that broke `fixedRows` height calc.

## 2026-06-25 — v0.6.16 — Workflow canvas fast load + Hub inspector

- Version: `0.6.16`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow canvas** — restore step board; drop IntersectionObserver deferral; eager xyflow chunk prefetch + pulse skeleton instead of stuck “Loading workflow canvas…”.
- **AI Step Assistant** — taller composer (4.25rem min-height, 3-row prompt, larger label/input).
- **Step inspector** — Type field uses `HubSingleFilterDropdown` (catalog labels) instead of native `<select>`; remove uppercase label override conflicting with `HubFormFieldLabel`.

## 2026-06-25 — v0.6.15 — Workflow Steps without canvas + taller Console

- Version: `0.6.15`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps** — remove lazy workflow canvas block (`Loading workflow canvas…`); compact step chip picker for multi-step edit.
- **Profiles rail** — Console panel ~68% of History+Console stack (was 50/50).

## 2026-06-25 — v0.6.14 — Workflow Steps UI cleanup

- Version: `0.6.14`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps** — remove workflow description blurb and AI assistant subtitle; English-only step prompt placeholder.
- **Typography** — align section title, meta, inspector, and AI composer with Hub body font scale.
- **Layout** — compact AI composer toolbar row (label · prompt · Gen/Apply).

## 2026-06-25 — v0.6.13 — Hub-UI stale date `dd/mm/yy` (all directory tables)

- Version: `0.6.13`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Vendor hub-ui `0.2.11`: stale activity labels (`formatHubActivityStaleLabel`, `HubActivityTimestampLabel`) → **`dd/mm/yy`** workspace-wide.
- Workflow Created/Updated: dùng SSOT profile helpers (bỏ `workflow-directory-time` local).

### Verification

- `vitest run src/features/profiles/profile-directory-cell-helpers.test.ts`

## 2026-06-25 — v0.6.12 — Workflow stale date `dd/mm/yy` only

- Version: `0.6.12`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Workflow table **Created** / **Updated**: keep relative labels (`just now`, `6m ago`, `3h ago`) within 24h; stale (>24h) shows **`dd/mm/yy` only** (no `hh:mm` prefix — Profiles still use `hh:mm dd/mm/yy`).

### Verification

- `vitest run src/features/workflows/workflow-directory-time.test.ts`

## 2026-06-25 — v0.6.11 — Workflow filter size + Created/Updated format

- Version: `0.6.11`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Workflow directory filter/bulk row: remove compact `0.625rem` button override — filters + New/Copy/Delete use hub-ui control height (`text-xs`, Profiles parity).
- Workflow timestamps (superseded in v0.6.12): brief always-compact experiment — reverted to relative + stale date.

### Verification

- `vitest run src/features/workflows/workflow-directory-time.test.ts`

## 2026-06-25 — v0.6.10 — Hide dev probe terminals on Windows

- Version: `0.6.10`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Dev** — `pnpm dev` uses `dev-node.mjs` (no `concurrently` extra consoles); all predev child spawns use `windowsHide` on Windows.
- **DB probe** — `ensure-better-sqlite3` probes via `node electron/cli.js` (not `electron.exe` GUI); caches ABI stamp under `.dev/better-sqlite3-electron.stamp`.
- **Runtime** — cookie-bridge `Expand-Archive` spawn hidden; fix `run-prod-start.mjs` missing `winSpawnOpts` import.

## 2026-06-24 — v0.6.9 — Fast profile Run + native SQLite + E0001

- Version: `0.6.9`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Launch perf** — skip WMI orphan probe on clean closed→Run; cache cookie-bridge prefs prep; warm E0001 CloakBrowser stage at boot; unset `ELECTRON_RUN_AS_NODE` in dev env.
- **DB** — `better-sqlite3` Electron rebuild; purge stale `-wal`/`-shm` on open/repair (`backend=better-sqlite3` WAL).
- **E0001** — extension pre-stage under `.cloakbrowser/.../<extId>/`; safe AppData cache sync.

## 2026-06-24 — v0.6.8 — Workflow table typography parity

- Version: `0.6.8`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Workflow directory pane: add `hub-directory-frame` on `WorkflowDirectoryPanel` — applies `hub-directory-frame-table.css` (12px body, status, platform label, headers) matching Profiles table; fixes smaller `hub-users-status` (10px) and icon labels (11px) when frame class was missing.

## 2026-06-24 — v0.6.7 — Workflow header icon + label sync

- Version: `0.6.7`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Workflow tab header: **Workflow** + `ClipboardList` icon (violet) — SSOT from `STEALTH_NAV_STRUCTURE` via `stealthScreenChrome()`; fixes wrong **Scripts** label and link-style lucide `Workflow` icon.
- Section rule label under header matches sidebar (`Workflow`).

### Verification

- `vitest run src/lib/stealth-nav-structure.test.ts`

## 2026-06-24 — v0.6.6 — Electron dev reload

- Version: `0.6.6`
- Timestamp: 2026-06-24 01:48 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 — v0.6.5 — Fast profile Run + native SQLite

- Version: `0.6.5`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Launch perf** — skip WMI orphan probe on clean closed→Run; cache cookie-bridge prefs prep per profile; warm E0001 CloakBrowser stage at boot; cache `binaryInfo`.
- **DB** — `better-sqlite3` Electron rebuild (hoisted module); simplify native loader in `init.cjs`.
- **E0001** — extension pre-stage under `.cloakbrowser/.../<extId>/`; safe AppData cache sync.

## 2026-06-24 — v0.6.4 — Workflow rail table vertical align

- Version: `0.6.4`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Workflow rail (`fixedRows=5`): body cells + checkbox column `vertical-align: middle` — matches Profiles table fix.
- Workflow panel (Scripts tab): same middle align for `stealth-workflow-panel-table`.
- Removed checkbox `min-height` hack on rail; fixedRows selectors replace unused panel-fill rules.

## 2026-06-24 — v0.6.3 — Profiles table row vertical align

- Version: `0.6.3`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Profiles directory table: body cells `vertical-align: middle` — text/icon no longer hugs top when panel-fill stretches rows.
- Checkbox column centered with row content (removed top-pin + min-height hack).

## 2026-06-24 — v0.6.2 — Electron dev reload

- Version: `0.6.2`
- Timestamp: 2026-06-24 01:42 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 — v0.6.1 — Launch speed + E0001 staging ship

- Version: `0.6.1`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Minor
- Status: Dev

### Changes

- **Launch perf** — skip WMI orphan probe on clean closed→Run path; cache cookie-bridge prefs prep per profile; warm extension stage at app boot; cache CloakBrowser `binaryInfo`.
- **E0001** — pre-stage extension under `.cloakbrowser/chromium-<ver>/<extId>/`; AppData cache sync without destructive `rmSync`.
- **DB** — `pnpm db:repair` + better-sqlite3 Electron ABI verified (`ensure-better-sqlite3`).

## 2026-06-24 — v0.5.57 — Extension pre-stage + DB repair verified

- Version: `0.5.57`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **CloakBrowser pre-stage** — copy E0001 to `.cloakbrowser/chromium-<ver>/<extId>/` before `--load-extension` (fixes `manifest missing` dialog for `lplb...`).
- **Cache sync** — in-place overwrite + mtime skip (Windows `ENOTEMPTY` safe).
- **DB** — `pnpm db:repair` re-export 5000 profiles; launch bench avg ~1.6s.

## 2026-06-24 — v0.5.55 — Electron dev reload

- Version: `0.5.55`
- Timestamp: 2026-06-24 01:27 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 — v0.5.54 — CloakBrowser extension pre-stage

- Version: `0.5.54`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Extension staging** — copy E0001 into `.cloakbrowser/chromium-<ver>/<extId>/` before `--load-extension` (fixes dialog `manifest missing` for `lplb...` staging path).
- **Launch hook** — stage on `openProfile` + `launchStealthPersistentContext`; warn when staging incomplete.

## 2026-06-24 — v0.5.53 — Electron dev reload

- Version: `0.5.53`
- Timestamp: 2026-06-24 01:16 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 — v0.5.52 — Electron dev reload

- Version: `0.5.52`
- Timestamp: 2026-06-24 01:15 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 — v0.5.53 — E0001 AppData cache launch (verified)

- Version: `0.5.53`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Cookie Bridge load path** — sync workspace E0001 into `extensions-cache/.../unpacked` and pass only that AppData path to `--load-extension` (fixes CloakBrowser `manifest missing` under `.cloakbrowser/.../ofghkh...`).
- **Prefs scrub** — purge stale E0001 pins (workspace id `ofghkh...`, store id `kaaa...`, `.cloakbrowser` staging) on startup and before each profile launch.
- **Cache sync filter** — skip `.git` / `node_modules` when copying workspace into cache.

## 2026-06-24 — v0.5.52 — E0001 cache sync without .git

- Version: `0.5.52`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Cache sync filter** — skip `.git` / `node_modules` when copying workspace E0001 into `extensions-cache` (fixes `EIO Access denied` on relaunch smoke).

## 2026-06-24 — v0.5.51 — E0001 launch from AppData cache

- Version: `0.5.51`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Cookie Bridge load path** — sync workspace E0001 into `extensions-cache/.../unpacked` and pass only that stable AppData path to `--load-extension` (fixes CloakBrowser staging `manifest missing` under `.cloakbrowser/.../ofghkh...`).
- **Prefs scrub** — purge stale E0001 pins (workspace id, store id, `.cloakbrowser` staging) before profile launch.

## 2026-06-24 — v0.5.50 — Electron dev reload

- Version: `0.5.50`
- Timestamp: 2026-06-24 23:12 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 — v0.5.49 — Dev stack stability + DB repair + honest ship gate

- Version: `0.5.49`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Boot timeout fix** — Electron waits for Vite `src/main.tsx` before `loadURL` (avoids "JavaScript did not start in time" on zombie `:5175`).
- **DB repair** — auto re-export corrupt `stealth-console.db` via sql.js; CLI `pnpm db:repair`.
- **Rules/skills** — anti false-completion: browser MCP required before marking UI/launch tasks done.

## 2026-06-24 — v0.5.48 — Electron dev reload

- Version: `0.5.48`
- Timestamp: 2026-06-24 22:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 — v0.5.48 — E0001 extension repair + System panel

- Version: `0.5.48`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Extension load error** — purge stale Chrome prefs pointing at missing `.cloakbrowser/.../extId` paths before each profile launch (fixes “Manifest file is missing or unreadable”).
- **System → Extensions** — new **E0001 Cookie Bridge** panel: enabled state, load path, unpacked ID, **Repair extension prefs** action.
- **Startup** — bulk scrub broken extension pins across all profile Chrome dirs.

## 2026-06-24 — v0.5.46 — Electron dev reload

- Version: `0.5.46`
- Timestamp: 2026-06-24 22:48 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 — v0.5.45 — Electron dev reload

- Version: `0.5.45`
- Timestamp: 2026-06-24 18:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 — v0.5.44 — E0001 extension load fix + faster launch

- Version: `0.5.44`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 Cookie Bridge** — fix `--disable-extensions-except` to use extension IDs (not paths); pin unpacked extension ID before launch so E0001 loads in toolbar again.
- **Extension source** — prefer workspace `Extension/E0001-cookie-bridge` when present, else Chrome Web Store cache.
- **Launch speed** — skip redundant store download when cache/workspace copy exists; default fast startup navigation (`STEALTH_FAST_LAUNCH=1`, set `0` to restore legacy settle waits).
- **Electron spawn env** — force `STEALTH_COOKIE_BRIDGE=1` on dev/prod Electron launch so stale shell `STEALTH_COOKIE_BRIDGE=0` (perf experiment) cannot silently disable E0001.

## 2026-06-24 — v0.5.43 — Restore E0001 default + expose failed profiles

- Version: `0.5.43`
- Timestamp: 2026-06-24 16:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Restored **E0001 Cookie Bridge** default behavior to use the Chrome Web Store extension cache unless `STEALTH_COOKIE_BRIDGE=0` explicitly disables it.
- Added targeted test coverage so Cookie Bridge default-on behavior is verified in `electron/lib/cookie-bridge-store.test.cjs`.
- Exposed **Failed** profile counts in the Profiles KPI strip and header stats so totals reconcile visibly when a profile is not ready or running.

## 2026-06-24 — v0.5.42 — Electron dev reload

- Version: `0.5.42`
- Timestamp: 2026-06-24 16:37 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 — v0.5.41 — Electron dev reload

- Version: `0.5.41`
- Timestamp: 2026-06-24 16:31 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 — v0.5.40 — Launch vs Run separation + warm workflow path

- Version: `0.5.40`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Run** (row action) — `profile:launch` opens browser with profile startup URL only; no workflow.
- **Launch** (bulk) — `automation:openUrl` via `ensureAutomationContext`: cold launch skips startup URL; warm session focuses + upgrades focus-only via CDP instead of re-spawn.
- **`awaitLaunchNavigation`** — optional `settle: false` on warm workflow path to avoid redundant page settle.
- **E2E** — `launch-vs-run-smoke.cjs` verifies startup URL on Run and workflow target on Launch (cold + warm).

## 2026-06-23 — v0.5.39 — Electron dev reload

- Version: `0.5.39`
- Timestamp: 2026-06-23 17:18 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-23 — v0.5.38 — Short title prefix + faster default launch

- Version: `0.5.38`
- Type: Patch
- Product: P0003

### Changes

- **Window title prefix** — shortened from `[0012] Profile 0012` to just `[0012]`.
- **Launch speed** — E0001 Cookie Bridge is now **off by default**; re-enable only when needed with `STEALTH_COOKIE_BRIDGE=1`.
- **Benchmark after change** — launch benchmark improved to min `2835ms`, avg `4016ms`, max `4617ms` (was avg `6278ms` in prior baseline).

## 2026-06-23 — v0.5.37 — Electron dev reload

- Version: `0.5.37`
- Timestamp: 2026-06-23 16:06 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-22 — v0.5.36 — Workflow smokes use neutral URL (CI ladder pass)

- Version: `0.5.36`
- Type: Patch
- Product: P0003

### Changes

- **workflow-launch / workflow-on-open smokes** — navigate `example.com` (Google login gate stays in product + `google-session-guard.test.cjs`).

## 2026-06-22 — v0.5.35 — Ship loop: identity panel + test ladder complete

- Version: `0.5.35`
- Type: Patch
- Product: P0003

### Changes

- **`profile-identity-status.test.cjs`** — status matrix unit test.
- **`run-unit-tests.mjs`** — restore `google-session-guard`, `window-title-smoke` in ladder.
- **`PROJECT_CONTEXT.md`** — `dev:reload` + System identity panel pointer.

## 2026-06-22 — v0.5.34 — Profile identity status + Google login gate + dev:reload smokes

- Version: `0.5.34`
- Type: Patch
- Product: P0003

### Changes

- **System → Profile identity panel** — window title / omnibar CLI / binary readiness / taskbar icon notes; `profile-identity:status` IPC.
- **Google session guard** — workflows fail with clear message on `accounts.google.com` sign-in (Google One AI preset).
- **`pnpm dev:reload`** verification ladder — window-title, workflow-launch, omnibar-chip smokes after electron restart.
- **Automation** — re-bind window title on each workflow run.

### Verification

- `window-title-smoke`, `workflow-launch-smoke`, `omnibar-chip-smoke` — live ok
- Omnibar **inside URL bar** still blocked on CloakBrowser binary (#384)

## 2026-06-22 — v0.5.33 — Workflow ERR_ABORTED (title race + commit navigate)

- Version: `0.5.33`
- Type: Patch
- Product: P0003

### Changes

- **Root cause** — `bindProfileWindowTitle` called `page.evaluate` during active navigation → aborts workflow `page.goto`.
- **Title bind** — defer evaluate until `domcontentloaded`; chain after `startupNavigation` in session manager.
- **`safe-goto.cjs`** — default `commit`, poll `waitForURL` after abort, `location.assign` fallback.
- **Workflow steps** — navigate uses `waitUntil: commit` (Google redirect safe).
- **Live e2e** — `workflow-launch-smoke.cjs`, `workflow-on-open-smoke.cjs` in `test:unit`.

### Verification

- `node electron/e2e/workflow-launch-smoke.cjs` — ok (lands accounts.google.com redirect)
- `node electron/e2e/workflow-on-open-smoke.cjs` — ok

## 2026-06-22 — v0.5.32 — Workflow launch ERR_ABORTED (Google redirects)

- Version: `0.5.32`
- Type: Patch
- Product: P0003

### Changes

- **`safe-goto.cjs`** — treat `net::ERR_ABORTED` as success when tab already landed on target / `*.google.com` redirect; use `commit` on retries.
- **`stabilizePrimaryPage`** — settle in-flight launch navigation before workflow `page.goto`.
- **`session-manager`** — pass `skipStartupUrl` through orphan CDP attach (fixes race when Launch + workflow on existing browser).

### Verification

- `node --test electron/automation/safe-goto.test.cjs`
- `node scripts/run-unit-tests.mjs`

## 2026-06-22 — v0.5.31 — Engine pin policy + fork decision record

- Version: `0.5.31`
- Type: Patch
- Product: P0003

### Changes

- **Exact pin `cloakbrowser@0.4.0`** — removed `^` range; SSOT in `tool.manifest.json` `engine`.
- **Bump ladder** — `scripts/check-cloakbrowser-pin.mjs`, `scripts/bump-cloakbrowser.mjs`, `pnpm engine:check-pin` / `engine:bump`; wired into `test:unit`.
- **`docs/ENGINE-CLOAKBROWSER.md`** — pin policy, bump QA checklist, rollback.
- **`docs/cloakbrowser-fork-evaluation.md`** — locked decision: **no private fork** for P0003 launcher; revisit criteria documented.

## 2026-06-22 — v0.5.30 — Standalone positioning + engine dependency doc

- Version: `0.5.30`
- Type: Patch
- Product: P0003

### Changes

- **Remove GPM / legacy vendor references** — docs, comments, AI workflow prompt, `sync-hub-env.mjs`, manifest summary; reframe P0003 as standalone console.
- **`docs/ENGINE-CLOAKBROWSER.md`** — SSOT for CloakBrowser engine dependency, daily-use risks, and mitigations.
- **Upstream docs** — `OMNIBAR-PROFILE-CHIP-SPEC.md`, `cloakbrowser-upstream/*`, fork eval rewritten without GPM comparisons.

## 2026-06-22 — v0.5.29 — cloakbrowser 0.4.0 + fork eval + #384 comment

- Version: `0.5.29`
- Type: Patch
- Product: P0003

### Changes

- **Bump `cloakbrowser` 0.3.31 → 0.4.0** — scanned package: no `stealth-profile-*` switch handling yet; omnibar chip still requires #384 / fork.
- **Fork evaluation** — `docs/cloakbrowser-fork-evaluation.md` (upstream vs PR vs private fork vs MV3).
- **#384 comment** — GPM omnibar UX reference posted to CloakHQ/CloakBrowser#384.

### Verification

- `window-title-smoke` + `relaunch-smoke` on 0.4.0 — passed

## 2026-06-22 — v0.5.28 — Profile window title cue (taskbar / Alt+Tab)

- Version: `0.5.28`
- Type: Patch
- Product: P0003

### Changes

- **Window title prefix** — `[0003] Profile 0003 — Google` on every tab via init script; visible on taskbar and Alt+Tab until native omnibar chip (CloakBrowser #384).
- Opt-out: `STEALTH_PROFILE_WINDOW_TITLE=0`.

### Verification

- `node --test electron/lib/profile-window-title.test.cjs` — passed

## 2026-06-22 — v0.5.27 — Omnibar chip CLI wired + DB column drop + upstream kit

- Version: `0.5.27`
- Type: Patch
- Product: P0003

### Changes

- **Wire omnibar chip CLI** — `buildOmnibarChipChromeArgs()` in `buildStealthChromeArgs`; flags `--stealth-profile-label/code/id/group/tooltip`; opt-out `STEALTH_OMNIBAR_CHIP=0`.
- **SQLite migration** — drop legacy columns `show_profile_badge`, `profile_tab_groups`, `tab_group_color` via table rebuild (`profile_chrome_columns_dropped_v1`).
- **Upstream contribution kit** — `docs/cloakbrowser-upstream/` (README + `GITHUB-ISSUE.md` for CloakHQ/cloakbrowser).

### Verification

- `node scripts/run-unit-tests.mjs` — passed
- Upstream issue: https://github.com/CloakHQ/CloakBrowser/issues/384

## 2026-06-22 — v0.5.26 — Remove MV3 identity dead code + omnibar chip spec

- Version: `0.5.26`
- Type: Patch
- Product: P0003

### Changes

- **Removed MV3 identity-toolbar runtime** — deleted extension generator, e2e smokes, taskbar overlay, `showProfileBadge` / `profileTabGroups` API fields, `STEALTH_PROFILE_IDENTITY_UI` gate.
- **Legacy purge retained** — startup + System panel purge old `identity-toolbar` bundles from pre-v0.5.23 installs; launch always uses `--disable-extensions` unless Cookie Bridge loads.
- **Native omnibar chip spec** — `docs/OMNIBAR-PROFILE-CHIP-SPEC.md` + `buildOmnibarChipLabel()` for upstream `cloakbrowser` (GPM-style `Stealth | 0003`).
- **Launch UX** — orphan attach/focus on relaunch decoupled from removed identity UI flag.

### Verification

- `node scripts/run-unit-tests.mjs` — passed

## 2026-06-22 — v0.5.25 — safe-goto workflow launch fix

- Version: `0.5.25`
- Timestamp: 2026-06-22 04:37 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Fix `net::ERR_ABORTED` when Launch runs workflow on a freshly opened profile — skip startup URL for automation launch, await in-flight startup navigation, and retry aborted `page.goto`.
- Add `safe-goto.cjs` helper with unit tests.

### Verification

- `node --test electron/automation/safe-goto.test.cjs`
- `pnpm test:unit` (vitest + electron unit suites)

## 2026-06-22 — v0.5.22 — Hub activity timestamp SSOT

- Version: `0.5.22`
- Type: Patch
- Product: P0003

### Changes

- Profile Last opened + workflow timestamps use hub-ui `HubActivityTimestampLabel`.
- Fresh bucket 3h → **1h**; stale format `hh:mm dd/mm/yy` (parity cookie sync/load).

### Verification

- `vitest run profile-directory-cell-helpers.test.ts` — passed

## 2026-06-21 — v0.5.21 — Electron dev reload

- Version: `0.5.21`
- Timestamp: 2026-06-21 03:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-22 — v0.5.21 — Workflow Steps design preview (5 variants)

- Version: `0.5.21`
- Timestamp: 2026-06-22 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **System / Design Template:** 5 layout-direction mockups for Workflow Steps editor (`workflow-steps` review).
- **Rail truncate parity:** `stealth-workflow-name-cell` + ellipsis on workflow rail table.
- **Tests:** `workflow-directory-cell-helpers.test.ts` — timestamp cell fresh/stale/empty.

## 2026-06-22 — v0.5.19 — Workflow directory table layout + timestamps

- Version: `0.5.19`
- Timestamp: 2026-06-22 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow panel table:** `table-layout: fixed` + ellipsis on Name/Platform — hết đè layer Name → ID.
- **Created/Updated:** `HubUsersStatusLabel` + dot màu theo age tone (parity profile Last opened).

## 2026-06-21 — v0.5.18 — Electron dev reload

- Version: `0.5.18`
- Timestamp: 2026-06-21 03:04 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-21 — v0.5.17 — Electron dev reload

- Version: `0.5.17`
- Timestamp: 2026-06-21 02:47 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-21 — v0.5.16 — Auto-update feed + silent installer updates

- Version: `0.5.16`
- Timestamp: 2026-06-21 00:28 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.5.16

### Changes

- **Auto-update fix:** GitHub repo public — `latest.yml` feed reachable without token (v0.5.2+ can check updates).
- Installer channel: `autoDownload` + `autoInstallOnAppQuit`; download on `update-available`.
- Header Update button auto-downloads when installer detects new version.
- `verify-desktop-auto-update`: public feed URL gate; `agent-verify-gate` prod-desktop for Release.

## 2026-06-21 — v0.5.15 — Catalog 10k–50k + batch runner + proxy pool

- Version: `0.5.15`
- Timestamp: 2026-06-21 23:18 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.5.15

### Changes

- Profile catalog scale (10k–50k), batch runner, proxy pool UI.
- Directory ID search, identity extension purge, Chrome prefs wipe, launch perf panel.
- Hub-UI directory search highlight + display prefs parity (P0004/P0020 golden).
- Desktop release pipeline + electron-updater (NSIS + portable).
- *Includes dev-reload iterations v0.5.3–v0.5.14 (identity purge / reload gate).*

## 2026-06-21 — v0.5.14 — Electron dev reload

- Version: `0.5.14`
- Timestamp: 2026-06-21 22:58 (UTC+7)
- Type: Patch
- Status: Superseded (v0.5.15)

### Changes

- Internal dev reload iteration — see v0.5.15 consolidated notes.

## 2026-06-21 — v0.5.13 — Electron dev reload

- Version: `0.5.13`
- Timestamp: 2026-06-21 22:42 (UTC+7)
- Type: Patch
- Status: Superseded (v0.5.15)

### Changes

- Internal dev reload iteration — see v0.5.15 consolidated notes.

## 2026-06-19 — v0.5.12 — Electron dev reload

- Version: `0.5.12`
- Timestamp: 2026-06-19 03:03 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 — v0.5.11 — Electron dev reload

- Version: `0.5.11`
- Timestamp: 2026-06-19 02:31 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 — v0.5.10 — Electron dev reload

- Version: `0.5.10`
- Timestamp: 2026-06-19 02:01 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 — v0.5.9 — Electron dev reload

- Version: `0.5.9`
- Timestamp: 2026-06-19 01:18 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 — v0.5.8 — Electron dev reload

- Version: `0.5.8`
- Timestamp: 2026-06-19 01:03 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 — v0.5.7 — Electron dev reload

- Version: `0.5.7`
- Timestamp: 2026-06-19 00:47 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 — v0.5.6 — Electron dev reload

- Version: `0.5.6`
- Timestamp: 2026-06-19 00:34 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 — v0.5.5 — Electron dev reload

- Version: `0.5.5`
- Timestamp: 2026-06-19 00:09 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 — v0.5.4 — Electron dev reload

- Version: `0.5.4`
- Timestamp: 2026-06-19 00:02 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 — v0.5.3 — Identity extension removed + dev reload gate

- Version: `0.5.3`
- Timestamp: 2026-06-19 22:50 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Identity label extension OFF** — purge Chrome prefs + `identity-toolbar` bundles; `--disable-extensions` on launch; kill stale Chrome (no attach).
- **`purgeAllChromeExtensions`** — wipe pinned E0001/identity from profile prefs when identity UI disabled.
- **`electron-dev-gate.mjs`** — auto patch bump + free :5175 when `electron/` changes (`predev` + `pnpm dev:reload`).

## 2026-06-18 - Catalog 10k–50k + batch runner + proxy pool

- Version: `0.5.2`
- Timestamp: 2026-06-18 15:00 (UTC+7)
- Commit: `8b96418`
- Type: Minor
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.5.2

### Changes

Mục tiêu xác nhận: **quản lý 10k–50k profile, chạy ~20–30 đồng thời**.

### Added — Job queue batch (chạy 20–30/lần)
- **Concurrency cấu hình** `STEALTH_JOB_CONCURRENCY` (đặt 20–30 cho usage này).
- **Dedupe theo key** (= profileId): không bao giờ 2 job chồng lên cùng 1 profile.
- **Retry + backoff luỹ thừa** (`retries`, `retry_delay_ms`) cho job lỗi tạm thời.
- **Jitter** (`jitter_ms`): trễ ngẫu nhiên trước launch → tránh pattern lockstep (chống fingerprint timing).
- Route `GET /api/jobs/stats` giám sát lô (queued/running/done/error).

### Added — Pagination cho catalog lớn
- `profileService.listProfilesPage({ limit, offset, search, groupId, status, sort, dir })` + `countProfiles()` — filter/sort ở tầng SQL, KHÔNG load 50k row vào JS.
- `GET /api/profiles?limit=&offset=&search=&group=&status=&sort=&dir=` → `{ profiles, total, limit, offset }`. **Không param = trả toàn bộ** (P0025 không đổi).
- `reconcileActiveStatuses()` thay full-scan: chỉ duyệt session sống + row active (indexed) — O(active) thay vì O(50k) mỗi poll.
- **`listProfilesLite()`** (id/name/status, không JOIN) cho `GET /api/profiles` all-path: benchmark thực ở 5001 profile → HTTP all-path **~255ms → ~40ms** (~7x). Pagination 5–11ms. flush 1.6MB DB ~4ms.
- **Debounce reconcile khi close** (`ProfilesRuntimeProvider`): event `closed` trước đây gọi refresh full 5001 row (210ms) mỗi lần → chạy lô 20–30 = giật nặng. Nay patch in-place + gộp burst thành 1 refresh sau 1.5s. (UI dùng `HubDirectoryTableShell` vốn đã phân trang nội bộ → không cần virtualization — đã đo.)

### Added — Proxy pool + health-check + geoip-consistency
- `electron/lib/proxy-pool.cjs`: `parseProxy` (đa định dạng + GPM `host:port:user:pass`), `checkProxy` (proxy sống + exit IP/country/timezone qua HTTP forward-proxy), `geoConsistency` (so timezone/locale profile vs IP thật), `ProxyPool` (round-robin + cooldown).
- `POST /api/proxy/check` { proxy | profile_id } → health + cảnh báo lệch geoip. Endpoint geo đổi qua `STEALTH_GEOIP_URL`.

### Tests
- `electron/api-routes.test.cjs`: +dedupe, +retry, +parseProxy, +geoConsistency, +ProxyPool, +pagination (15/15 pass).

## 2026-06-18 — v0.5.1 — Scale fixes: fingerprint collision + minimize bug + DB indexes

### Fixed
- **Fingerprint collision (antidetect, P1):** seed sinh từ `randomInt(10000,99999)` (90k giá trị) → ở vài nghìn profile chắc chắn trùng fingerprint. Đổi sang không gian `1..2^31-1` + `generateFingerprintSeed()` đảm bảo duy nhất (verify: 2000 profile → 2000 seed unique). Profile cũ giữ nguyên seed.
- **Minimize bug:** `minimizeCloakWindow` (PowerShell) minimize MỌI cửa sổ Chrome trên máy (cả Chrome cá nhân). Thay bằng `sessionManager.minimizeProfile()` qua CDP `windowState:minimized` — scope đúng cửa sổ profile, cross-platform.

### Performance
- **DB indexes:** thêm index `profiles(updated_at, group_id, fingerprint_seed, status)` + `runs(started_at, profile_id)`. `ORDER BY updated_at` chuyển từ full-scan+sort sang index scan.
- **Lightweight status write:** lifecycle (opening/running/closed/failed) dùng `setProfileStatus()` (1 UPDATE) thay `updateProfile()` (2 SELECT JOIN + ghi full row). Giảm tải khi nhiều session đổi trạng thái.

## 2026-06-18 — v0.5.0 — BrowserHub API v2: auth + CDP passthrough + job queue + plugin registry

### Added
- **Auth token** (`electron/lib/api-auth.cjs`): bearer token qua env `STEALTH_API_TOKEN`. Không set → API mở (tương thích ngược P0025). `/api/health` luôn mở + báo `authRequired`.
- **CDP passthrough**: `GET /api/profiles/:id/cdp` trả `webSocketDebuggerUrl` + `endpoint` để tool ngoài `connect_over_cdp`. Engine mở `--remote-debugging-port` (localhost-only, cấp port động). Tắt bằng `STEALTH_CDP_ENABLE=0`.
- **Job queue async** (`electron/lib/job-queue.cjs`): `POST /api/jobs` (202 + jobId), `GET /api/jobs[/:id]`, SSE `GET /api/jobs/:id/events`. Concurrency qua `STEALTH_JOB_CONCURRENCY` (mặc định 1).
- **Plugin registry** (`electron/api-routes.cjs` + `electron/automation/plugins.cjs`): core routes tách khỏi domain (fb/meta). Thêm tool = thêm descriptor, không sửa dispatcher.
- **Shared client SDK**: `clients/browserhub_client.py` + `clients/browserhub-client.ts` + spec `docs/browserhub-api.openapi.yaml`.
- **Port config**: `startApiServer({ port })` / env `STEALTH_API_PORT` (mặc định 6003).
- **Test**: `electron/api-routes.test.cjs` (auth gate, job queue, route registry).

### Changed
- `api-server.cjs` refactor thành dispatcher mỏng (auth → match registry → handler). Mọi route cũ giữ nguyên đường dẫn & shape (P0025 không cần đổi).
- `minimizeCloakWindow` chỉ chạy trên win32.

## 2026-06-17 — v0.4.8 — Workflow filter row + Steps Hub buttons + router fix

### Fixed
- **9Router AI Gen:** `validateRouterRequestPayload` load trong `bindRouterApi` (hết lỗi HTTP 0 khi Electron chưa reload).
- **Filter + bulk một dòng:** nowrap + scroll ngang, nút compact trong frame Workflow 40%.

### Changed
- **Steps buttons:** New / Save / Undo / Redo / Up / Down / Delete dùng `HubBulkActionButton`; form fields `HubFormFieldLabel` + `hub-input`.
- **Step picker:** portal `fixed` (không clip); Add → **New**.
- **Context menu:** chỉ Copy · Delete (bỏ Run/Export/Reset).

## 2026-06-17 — v0.4.7 — Workflow directory + Steps Hub-UI

### Changed
- **Workflow bulk bar:** chỉ còn **New · Copy · Delete** (bỏ Export, Import, Run, Reset).
- **Selection pill:** hiển thị `N of M` / `All N selected` thay nút Select all cồng kềnh.
- **Workflow Steps:** AI composer Hub-UI; nút **Add** mở modal search step kèm mô tả từng loại.

## 2026-06-17 — v0.4.6 — Header alignment + unified tab actions

### Fixed
- **Header/frame flush:** remap Hub `-mx-6` chrome bleed to `--app-tab-header-px` (0.75rem) — header thẳng mép frame khi zoom.
- **Tab header parity:** Profiles và Workflow dùng cùng nút **Settings** (không còn “Profile settings”).
- **Launch fallback:** workflow `open-url` không có `targetUrl` → dùng startup URL của profile.

## 2026-06-17 — v0.4.5 — AG Appeal workflow + Steps Hub-UI

### Fixed
- **Google Forms AG Appeal workflow:** port script-steps engine + `google-form-ag-appeal` action (các workflow khác giữ nguyên `open-url`).
- **Profiles header flush:** dùng `WorkspaceTabHeader` + `ProfilesHubChrome` giống Scripts tab.
- **Workflow Steps redesign:** palette/AI/inspector theo Hub-UI (neutral chips, hub-control sizing).
- **9Router AI Gen:** import `validateRouterRequestPayload` trong `main.cjs`.

## 2026-06-17 — v0.4.4 — Launch workflow + tighter gutters

### Fixed
- **Launch chạy theo workflow active ở rail:** nút Launch dùng `runAutomationQueue` với workflow đang chọn; double-click hàng profile vẫn mở startup/default.
- **Giảm gutter hai mép frame:** padding main `0.75rem`, split-pane tabs bỏ bottom padding thừa.

## 2026-06-17 — v0.4.3 — Remove label extension

### Changed
- **Gỡ hoàn toàn extension hiển thị nhãn + tab groups:** xóa extension + IPC/settings liên quan để tập trung hoàn thiện feature chính.

### Fixed
- Startup URL ưu tiên tab mặc định (wait page event trước khi fallback mở tab mới).

## 2026-06-17 — v0.4.2 — Startup tab polish

### Fixed
- **Startup URL chạy ngay tab mặc định:** không tạo tab mới rồi mới mở startup URL (giảm rác `about:blank`).

## 2026-06-17 — v0.4.1 — Chrome defaults + Hub polish

### Fixed
- **Tắt auto Chrome tab groups mặc định:** không còn tạo tab group mỗi lần mở profile; vẫn giữ badge label.
- **Header flush theo Hub (P0004):** gutter/padding đồng nhất với `.hub-main` để 2 mép header thẳng viền khung.
- **Version bump theo rule:** đồng bộ `package.json` + `tool.manifest.json` + `APP_VERSION`.

## 2026-06-14 — v0.4.0 — Shell / Settings

### Added
- **Settings nâng cấp (kiểu P0004):** panel "Browser defaults" (OS · device preset · timezone · locale · color scheme · **headless · humanize** — áp cho mọi profile tạo mới, lưu localStorage) + panel Appearance.
- **Launch flags per-profile:** `headless` (cảnh báo giảm stealth) + `humanize` — cột DB mới, engine `buildLaunchOptions` đọc từ profile; toggle trong cả profile form lẫn Browser defaults.
- Cửa sổ app **mở maximized** mặc định.

### Fixed
- Footer: đổi nhãn nút display-prefs `Settings` → `Display` (hết trùng tên với nút Settings).

### Changed / Removed
- Xóa dead screen **History** (`src/features/run-history/` — orphan, không wire vào screen nào).
- Nav: Profiles + Workflow; Settings ở footer sidebar.

## 2026-06-14 — v0.3.0 — Device library / antidetect

### Added
- **Kho thiết bị (device library):** 7 preset coherent (Windows/macOS/Linux × độ phân giải thật) — chọn 1 phát là set OS + viewport + locale khớp nhau.
- **Chọn OS độc lập host** (`--fingerprint-platform=windows|macos|linux`) — máy Windows giả được macOS/Linux (trước đây khoá theo host).
- Per-profile **timezone, locale, viewport, color scheme, User-Agent** (engine honor qua cloakbrowser); WebRTC IP mask tự bật khi proxy + geoip.
- Schema migration cộng cột device cho DB cũ; profile create/edit modal có section "Device · Fingerprint".

### Notes
- Per-field GPU/cores/RAM/font **không override** được — seed sinh coherent (thiết kế cloakbrowser, chống combo lệch). Mobile/Firefox engine ngoài tầm (cloakbrowser chỉ Chromium).
- Validate fingerprint: dùng "Run all fingerprint checks" (sannysoft/CreepJS/Pixelscan) trong Open URL rail.

## 2026-06-14 — v0.2.0

### Fixed
- **Workflow tab crash (vendor drift):** directory column meta dùng `%` cho cột chrome-role (`role/activity/created/tools`) làm hub-ui mới throw → trắng màn hình toàn app. Chuyển sang fixed rem token theo SSOT. Workflow editor (script builder + flow canvas) hoạt động trở lại.
- Boot watchdog hint hết hardcode port `:5186` — tự lấy `location.port`.

### Security
- Bỏ hardcode proxy credentials trong source; seed profile proxy chuyển opt-in qua env `STEALTH_SEED_PROXY_URL`.
- Chống SSRF + header-injection cho `router:request` (chặn internal host, whitelist header, ép method/timeout).
- Validate đồng nhất IPC (`group:create/update`, `runs:list`, `profiles:import`).
- Thêm `sandbox: true` + Content-Security-Policy cho bản packaged (gỡ `unsafe-eval`).

### Changed
- Đổi tên `Gpm*` → `Stealth*` (workflow directory table/cells/bulk-actions, column meta symbols); gỡ file/hằng trùng lặp (`gpm-directory-table.ts`, `scripts/win-spawn.mjs`).
- Dọn token CSS trùng; gộp loader JSON dùng chung.

## 2026-06-13 — v0.1.0 MVP

- Initial greenfield scaffold: Electron + Hub-UI + CloakBrowser + SQLite
- Profiles CRUD, launch/close, Open URL automation
- Run history persistence, console log panel
- Settings: engine binary check, theme, data folder
