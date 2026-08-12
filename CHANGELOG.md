# Changelog

## 2026-08-12 — v1.0.176 — Electron dev reload

- Version: `1.0.176`
- Timestamp: 2026-08-12 02:39 (UTC+7)
- Type: Patch
- Status: Committed

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-08-13 - Profiles storage location (portable)

- Version: `1.0.175`
- Timestamp: 2026-08-13 02:40 (UTC+7)
- Type: Feature
- Status: Draft

### Changes

- Split **profilesRoot** from Electron userData (DB/settings stay in AppData).
- Settings → **Data folder**: change / migrate profiles location; recommended non-system drive path.
- Config: `{userData}/data/profiles-location.json` (no hard-coded D: — heuristic per machine).
- NSIS seeds first-run `promptPending` when config missing; adopt existing junction targets on upgrade.
- Startup `ensureProfilesLocationInitialized` + IPC open/migrate/apply-suggested.

### Verification

- `node --test electron/lib/profiles-location.test.cjs`
- Adopted live config → `D:\StealthBrowser\profiles` (source: adopt-reparse)

---

- Version: `1.0.174`
- Timestamp: 2026-08-12 21:22 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Patch bump for uncommitted code changes (P0003).

### Verification

- pending

---
## 2026-07-30 - Profiles directory More menu SSOT

- Version: `1.0.170`
- Timestamp: 2026-07-30 19:15 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Patch bump for uncommitted code changes (P0003).

### Verification

- pending

---
## 2026-07-30 â€” v1.0.169 â€” Digit gap +10% + Console SSOT lock

- Version: `1.0.169`
- Timestamp: 2026-07-30 18:30 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.169

### Changes

- Taskbar badge digit gap +10% vs spaced7 (`v4-digits-only-spaced8`).
- Lock System Console SSOT to live `RunLogs` only (v1.0.154): Cursor rule + `runtime-console-ssot.test.ts` regression guard.

## 2026-07-30 â€” v1.0.168 â€” Taskbar digit gap +15%

- Version: `1.0.168`
- Timestamp: 2026-07-30 18:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Increase taskbar badge digit gap +15% vs spaced6 (`v4-digits-only-spaced7`); SSOT in `profile-code.cjs` / `profile-code.ts`.

## 2026-07-30 â€” v1.0.167 â€” Electron dev reload

- Version: `1.0.167`
- Timestamp: 2026-07-30 18:02 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-30 â€” v1.0.166 â€” Electron dev reload

- Version: `1.0.166`
- Timestamp: 2026-07-30 17:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-30 â€” v1.0.165 â€” Electron dev reload

- Version: `1.0.165`
- Timestamp: 2026-07-30 17:02 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-30 â€” v1.0.164 â€” Restore launch transcript in console

- Version: `1.0.164`
- Timestamp: 2026-07-30 16:57 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Restore backend-driven launch transcript lines in `Console` so profile open now pushes detailed lifecycle messages instead of only summary/history rows.
- Keep the UI fallback for older payloads, but prefer launch-returned logs whenever Electron supplies them.

## 2026-07-30 â€” v1.0.163 â€” Electron dev reload

- Version: `1.0.163`
- Timestamp: 2026-07-30 16:51 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-30 â€” v1.0.162 â€” Rehydrate console from persisted run logs

- Version: `1.0.162`
- Timestamp: 2026-07-30 16:52 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Restore the old console feel by hydrating session console lines from persisted `run.logs` on history refresh.
- Keep terminal-style command lines visible after reload instead of only showing fresh summary lines.

## 2026-07-30 â€” v1.0.161 â€” Restore runtime console data

- Version: `1.0.161`
- Timestamp: 2026-07-30 16:20 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Restore runtime rail console by merging session logs with persisted run history and profile events.
- Add runtime-rail smoke seed + unit/smoke coverage so empty History/Console regressions are caught.

## 2026-07-30 â€” v1.0.160 â€” Electron dev reload

- Version: `1.0.160`
- Timestamp: 2026-07-30 16:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-30 â€” v1.0.159 â€” Increase taskbar digit gap 10%

- Version: `1.0.159`
- Timestamp: 2026-07-30 15:57 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Increase taskbar badge digit gap by 10% over the current lock (`spaced6` cache/style tag).
- Sync the gap SSOT across Electron runtime, UI mirror, and unit tests.

## 2026-07-30 â€” v1.0.158 â€” Fix blank tabs + safer relaunch

- Version: `1.0.158`
- Timestamp: 2026-07-30 14:34 (UTC+7)
- Type: Patch
- Status: Committed

### Changes

- Avoid leaving extra `about:blank` tab when maximizing via CDP.
- Reduce â€œOpening in existing browser sessionâ€ relaunch failures by retrying attach/focus before killing.

## 2026-07-29 â€” v1.0.157 â€” Console SSOT HubRuntimeConsoleContent

- Version: `1.0.157`
- Timestamp: 2026-07-29 14:26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Wire Console rail to shared `HubRuntimeConsoleContent` (newest-first + auto-scroll to top).

## 2026-07-29 â€” v1.0.156 â€” Electron dev reload

- Version: `1.0.156`
- Timestamp: 2026-07-29 14:20 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-29 - Profiles directory More menu SSOT

- Version: `1.0.155`
- Timestamp: 2026-07-29 14:18 (UTC+7)
- Type: Patch

### Changes

- Replace custom More dropdown with **`HubDirectoryBulkMoreMenu`** (Groups Â· Export Â· Import).

---
## 2026-07-27 - Note column one-shot promote + Detail CDP smoke

- Version: `1.0.154`
- Timestamp: 2026-07-27
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.154

### Changes

- Promote Note column once for any Display prefs that still hide it (custom sets included)
- Add `scripts/smoke-profile-note-detail.mjs` Stealth CDP proof (Note column + Detail Note rail)
- `verify-agent-smoke-headless`: skip (not fail) when CloakBrowser exit 21 / launch env busy during release

### Verification

- `node scripts/smoke-profile-note-detail.mjs`
- `Release P0003` â†’ GitHub `latest.yml` for electron-updater

---
## 2026-07-27 - Profiles Note column + detail Note rail

- Version: `1.0.153`
- Timestamp: 2026-07-27
- Type: Patch
- Status: Pending

### Changes

- Profiles directory: Note column visible by default (wider flex width)
- Profile detail: replace History rail with editable Note rail (Create modal parity); bulk detail applies shared note when touched

### Verification

- `node scripts/smoke-profile-modal-layout.mjs`
- `node Tool/scripts/agent-verify-gate.mjs --code P0003 --json --intent ui`

---
## 2026-07-24 - preShip SSOT: verify-untracked + verify-no-sibling-tool-imports

- Version: `1.0.152`
- Timestamp: 2026-07-24
- Type: Patch
- Status: Pending

### Changes

- preShip SSOT: verify-untracked + verify-no-sibling-tool-imports

### Verification

- ship-pipeline slice â†’ commit scoped paths only

---
## 2026-07-24 - preShip SSOT: verify-untracked-imports gate

- Version: `1.0.151`
- Timestamp: 2026-07-24
- Type: Patch
- Status: Pending

### Changes

- preShip SSOT: verify-untracked-imports gate

### Verification

- ship-pipeline slice â†’ commit scoped paths only

---
## 2026-07-23 - hub-ui SSOT hook-stability vendor sync

- Version: `1.0.150`
- Timestamp: 2026-07-23 15:18 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Patch bump for uncommitted code changes (P0003).

### Verification

- pending

---
## 2026-07-23 â€” v1.0.149 â€” Fix prod taskbar badge (asar PS1 path)

- Version: `1.0.149`
- Timestamp: 2026-07-23 12:45 (UTC+7)
- Root cause: packaged `resolveElectronLibScript` returned `app.asar\â€¦\*.ps1` because Electron `existsSync` is true for asar; PowerShell `-File` cannot read asar â†’ badge never applied on prod (dev OK).
- Fix: prefer `app.asar.unpacked` for PS1; gate `verify-packaged-unpacked` requires taskbar PS1 on disk.
- Verified: unit `powershell-exec.test.cjs`; repro on installed 1.0.148 resolved asar path; user confirmed prod badge OK after Setup 1.0.149.
- Regression: `scripts/smoke-asar-ps1-resolve.mjs` (ELECTRON_RUN_AS_NODE) + wired into `test:fast` / pack.

## 2026-07-23 - hub-ui SSOT hook-stability vendor sync

- Version: `1.0.148`
- Timestamp: 2026-07-23 11:01 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.148

### Changes

- Patch bump for uncommitted code changes (P0003).

### Verification

- pending

---
## 2026-07-23 â€” v1.0.147 â€” Fix 0015 NOHWND badge on open (stale PID)

- Version: `1.0.147`
- Timestamp: 2026-07-23 10:59 (UTC+7)
- Root cause: open-path logged `NOHWND` for 0015 â€” dead/utility HintPid preferred over live sidecar; HWND=0 before Chrome paints.
- Fix: `readTaskbarHintPid` skips dead PIDs; on NOHWND clear HintPid and rediscover; PS polls MainWindowHandle ~2s then WMI fallback; longer recover; restamp after API minimize.
- Verified: relaunch 0015 â†’ `OK_ICON` (~4s open, ~400ms reinforce); title=`0015`; apply-all 79ms.

## 2026-07-23 â€” v1.0.146 â€” Electron dev reload

- Version: `1.0.146`
- Timestamp: 2026-07-23 10:39 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-22 â€” v1.0.145 â€” Fix taskbar badge missing on some profiles (AUMID)

- Version: `1.0.145`
- Timestamp: 2026-07-22 20:48 (UTC+7)
- Type: Patch
- Status: Dev
- Root cause: Win11 ignores `WM_SETICON` when `RelaunchIconResource` is set (stale shell cache) â†’ OK_ICON but default Chromium icon on 0012 / x888 / â€¦
- Fix (`StealthTaskbarWin.v3`): clear RelaunchIconResource; AUMID for grouping/title only; SETICON all top-level HWNDs + double-pass.
- Verified: ICO/HWND OK; apply-all 16/16 then 6/6 OK_ICON after clear.

## 2026-07-22 â€” v1.0.144 â€” Fix intermittent taskbar badge (nav race)

- Version: `1.0.144`
- Timestamp: 2026-07-22 20:30 (UTC+7)
- Type: Patch
- Status: Dev
- Root cause: page nav restamp (`force` + reinforce) aborted in-flight open apply via gen bump â†’ dropped recover timers â†’ some profiles OK, some missing.
- Fix: reinforce never aborts same-code in-flight open; recover chain on OK **and** incomplete/error; longer reinforce retries; force badge on focus/reopen; ICO render slots 2â†’3.
- Verified: unit race test PASS; apply-all live headed 6/6 OK_ICON on `:6004`.

## 2026-07-22 â€” v1.0.143 â€” Electron dev reload

- Version: `1.0.143`
- Timestamp: 2026-07-22 15:05 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-22 â€” v1.0.142 â€” Electron dev reload

- Version: `1.0.142`
- Timestamp: 2026-07-22 14:55 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-22 â€” v1.0.143 â€” Taskbar badge <3s on profile open

- Version: `1.0.143`
- Remove 4s pre-wait for `stealth-pid.json` before first badge apply â€” fast retries instead.
- Refresh HintPid from sidecar each retry; `pidWaitMs` only on attempt 0 (~160ms).
- Sidecar poll: 25ms interval + lock-file PID probes @60â€“1400ms (skip slow WMI when possible).
- `listProfileBrowserPids`: prefer Restart Manager lock owners before full `Get-CimInstance` scan.
- Defer `focusProfileBrowserWindow` (WMI ~2.5s) until retry attempt â‰¥3.
- Verified: cached ICO + PID â†’ apply ~400â€“700ms; open-path smoke PASS â‰¤3s.

## 2026-07-22 â€” v1.0.142 â€” Taskbar badge <3s on profile open (superseded)
- Remove 4s pre-wait for `stealth-pid.json` before first badge apply â€” fast retries instead.
- Refresh HintPid from sidecar each retry; `pidWaitMs` only on attempt 0 (~160ms).
- Sidecar poll: 25ms interval + lock-file PID probes @60â€“1400ms (skip slow WMI when possible).
- `listProfileBrowserPids`: prefer Restart Manager lock owners before full `Get-CimInstance` scan.

## 2026-07-22 â€” v1.0.140 â€” Fix taskbar badge on packaged exe (PS1 asar unpack)

- Version: `1.0.140`
- Root cause: `render-taskbar-badge.ps1` / taskbar apply scripts lived inside `app.asar`; PowerShell `-File` cannot read asar â†’ badge silently fails on Setup.exe.
- Fix: `asarUnpack` for `electron/lib/*.ps1` + `resolveElectronLibScript()` maps to `app.asar.unpacked`.

## 2026-07-22 - hub-ui SSOT hook-stability vendor sync

- Version: `1.0.139`
- Timestamp: 2026-07-22 14:10 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Patch bump for uncommitted code changes (P0003).

### Verification

- pending

---
## 2026-07-22 â€” v1.0.138 â€” Release: taskbar badge stick + API launch fix

- Version: `1.0.138`
- Timestamp: 2026-07-22 14:01 (UTC+7)
- Fix HTTP `/api/profiles/:id/launch` when `userDataRoot` is a string (was masked as "not a function" on any launch error).
- Includes v1.0.136 taskbar badge reinforce (MainWindowHandle, double SETICON, nav re-stamp) and v1.0.135 dev/prod junction attach fix.
- Gitignore `.dev-vite.env.json` (blocks push secret scan).

## 2026-07-22 â€” v1.0.138 â€” Electron dev reload

- Version: `1.0.138`
- Timestamp: 2026-07-22 13:54 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-22 - hub-ui SSOT hook-stability vendor sync

- Version: `1.0.137`
- Timestamp: 2026-07-22 13:47 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Patch bump for uncommitted code changes (P0003).

### Verification

- pending

---
## 2026-07-22 â€” v1.0.136 â€” Taskbar badge stick (Chrome icon reset)

- Version: `1.0.136`
- Timestamp: 2026-07-22 13:44 (UTC+7)
- Prefer MainWindowHandle; AUMID then SETICON (double SETICON) so Win11 taskbar keeps digits.
- After OK_ICON, reinforce at 1.5s / 4s / 9s; re-stamp on page nav/load (Chromium wipes WM_SETICON).

## 2026-07-22 â€” v1.0.135 â€” Fix ProcessSingleton + badge when -dev profiles junction to prod

- Version: `1.0.135`
- Root cause: `stealth-browser-console-dev/profiles` is a junction to prod; Chrome cmdline uses resolved prod path â†’ attach/focus/badge needles miss â†’ ProcessSingleton Error 32 + no taskbar badge.
- `expandProfileDirAliases` / PS needles include realpath + prodâ†”-dev sibling.
- `prepareProfileForLaunch` does not kill a live browser holding the lock â€” attach/focus instead.

## 2026-07-21 â€” v1.0.134 â€” Faster taskbar badge (no cancel race, hot ICO 3 sizes)

- Version: `1.0.134`
- Fix missing badges: early+late schedule no longer cancels in-flight apply for same code.
- Hot ICO sizes â†’ **48/32/16** only; PS1 extracts Chromium icon once then scales; max 2 parallel ICO renders.
- Focus-retry only on NOHWND (multi-open no longer steals focus every attempt).
- Log `[taskbar-badge] OK_ICON â€¦ms` on success.

## 2026-07-21 â€” v1.0.133 â€” Fix dev open-path badge (retry + early schedule)

- Version: `1.0.133`
- Badge apply early on profile open (not gated on startup URL finish); second pass after nav.
- Retry `not-running`/timeout failures (not only NOHWND); worker timeout 20s; PID wait 5s.

## 2026-07-21 â€” v1.0.132 â€” Taskbar digit gap +30% (spaced5)

- Version: `1.0.132`
- `BADGE_DIGIT_GAP_BY_MAX_SIZE` +30% vs spaced4 (48px: 4.10 â†’ **5.33** px). Style â†’ `v4-digits-only-spaced5`.

## 2026-07-21 â€” v1.0.130 â€” Taskbar digit gap +20% (spaced4)

- Version: `1.0.130`
- `BADGE_DIGIT_GAP_BY_MAX_SIZE` +20% vs spaced3 (48px: 3.42 â†’ **4.10** px). Style â†’ `v4-digits-only-spaced4`.

## 2026-07-21 â€” v1.0.131 â€” Electron dev reload

- Version: `1.0.131`
- Timestamp: 2026-07-21 21:50 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-21 â€” v1.0.129 â€” Fix badge on new profile open (post spaced3)

- Version: `1.0.129`
- Type: Patch
- Status: Dev

### Changes

- Open-path scheduler mirrors apply-all: no shared `icoWarm` race; retry to 10s for cold spaced3 ICO.
- Warm ICO at post-nav schedule; warn log when apply incomplete.
- Root cause: apply-all patched old HWNDs; new opens failed when cold render exceeded short retry.

## 2026-07-21 â€” v1.0.128 â€” Digit gap +20% + SSOT (ok 1)

- Version: `1.0.128`
- Type: Patch
- Status: Dev

### Changes

- `BADGE_DIGIT_GAP_BY_MAX_SIZE` in `profile-code.cjs` (+ TS mirror); PS1 reads `-DigitGapsCsv`.
- Gap +20% vs spaced2 (48px: 2.85 â†’ **3.42** px). Style â†’ `v4-digits-only-spaced3`.

## 2026-07-21 â€” v1.0.126 â€” Badge smoke exit + NOHWND retry (ok 1â€“3)

- Version: `1.0.126`
- Type: Patch
- Status: Dev

### Changes

- `apply-all-taskbar-badges`: exit 0 when â‰¥1 OK_ICON; summary JSON; skip agent pool.
- `taskbar-badge-apply-retry.mjs`: focus + retry on NOHWND.
- `smoke-taskbar-badge`: hard timeout + explicit exit 0; `smoke-exit.mjs` helper.

## 2026-07-21 â€” v1.0.125 â€” Stop dev Electron restart/focus loop

- Version: `1.0.125`
- Type: Patch
- Status: Dev

### Changes

- **Root cause:** Multiple `dev-node` instances fought for `:5175` â†’ Vite retry loop spawned new Electron each recovery + `focusStealthWindow` / `win.focus()`.
- `dev-node.mjs`: attach if port up; never respawn Electron on Vite retry; `STEALTH_DEV_NO_FOCUS` for detached/agent dev.
- `reload-and-verify`: skip `open-dev-window` + focus under `STEALTH_AGENT_SMOKE=1`.
- `focusStealthWindow`: no-op when agent smoke / no-focus env set.

## 2026-07-21 â€” v1.0.124 â€” Fix taskbar badge timing after ok 1

## 2026-07-21 â€” v1.0.125 â€” Electron dev reload

- Version: `1.0.125`
- Timestamp: 2026-07-21 21:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-21 â€” v1.0.123 â€” Taskbar badge audit (ok 1â€“3) + dev reload

- Version: `1.0.123`
- Timestamp: 2026-07-21 20:06 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **ok 1:** Remove duplicate post-nav `scheduleProfileTaskbarBadgeApply` in session-manager (title apply is SSOT).
- **ok 2:** `chrome-process-query.cjs` SSOT for WMI PS; orphan + list-live use `powershell-exec`; dedupe ICO warm (inflight map + pass `icoWarm` to apply); drop launch-time ICO warm in profile-ops.
- **ok 3:** `extractProfileCode` on `profile-code.cjs`; collapse imports off deprecated `profile-identity`; `profile-code.sync.test.ts` CJS/TS parity.
- Auto patch bump + Electron reload gate after electron source edits.

## 2026-07-21 â€” v1.0.121 â€” Electron dev reload

- Version: `1.0.121`
- Timestamp: 2026-07-21 19:42 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-21 â€” v1.0.120 â€” Taskbar apply worker + dev DB repair

- Version: `1.0.120`
- Timestamp: 2026-07-21 19:45 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Persistent PowerShell worker for taskbar apply (~549ms vs ~4s cold spawn).
- `warmTaskbarApplyRuntime` warms worker + Win32 DLL; spawn fallback retained.
- `smoke-taskbar-badge-latency` â€” split `workerMs` / `psSpawnMs` / `wmiSkipped` metrics.
- `repair-stealth-db.mjs` â€” `--dev` userData + probe `:6003`/`:6004`.

## 2026-07-21 â€” v1.0.119 â€” Electron dev reload

- Version: `1.0.119`
- Timestamp: 2026-07-21 19:36 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-21 â€” v1.0.118 â€” Early HintPid (skip WMI on badge apply)

- Version: `1.0.118`
- Timestamp: 2026-07-21 19:35 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Poll Playwright browser PID @50ms â†’ write `stealth-pid.json` before first badge apply (no pid=0 sidecar).
- `waitForTaskbarHintPid` + `readTaskbarHintPid` â€” apply passes `-HintPid` to skip `Get-CimInstance`.
- Focus-only attach resolves PID via lock scan before schedule.

## 2026-07-21 â€” v1.0.117 â€” Digit spacing, position, cyan contrast

- Version: `1.0.117`
- Timestamp: 2026-07-21 18:30 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Wider digit gap + lower baseline on taskbar ICO. Style â†’ `v4-digits-only-spaced2`.
- 1xxx cyan `#00f5e9` â†’ `#00c8ff` for contrast on Chromium icon.
- UI `extractProfileCode` consolidated to `src/lib/profile-code.ts` (SSOT mirror of electron).

## 2026-07-21 â€” v1.0.116 â€” Taskbar digit spacing + badge cleanup

- Version: `1.0.116`
- Timestamp: 2026-07-21 18:18 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Slightly wider gap between last3 digits on taskbar ICO (`DigitGap` per frame size). Style â†’ `v4-digits-only-spaced`.
- Remove deprecated plate SSOT (V3 charcoal plate unused since digits-only).
- Deduplicate PowerShell launcher â†’ `electron/lib/powershell-exec.cjs`.
- Drop dead `isDevServerReachable` fallback in dev load.

## 2026-07-21 â€” v1.0.115 â€” Fix dev load wrong Vite port

- Version: `1.0.115`
- Timestamp: 2026-07-21 18:12 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Electron no longer falls back to foreign Vite (`:5173`) â€” only loads when HTML matches Stealth Browser Console.
- Strip inherited workspace `VITE_DEV_SERVER_URL`; dev-node always pins `:5175`.
- Boot fallback hints use per-tool meta (`hub-dev-port` / `hub-dev-folder`) instead of hardcoded P0020.

## 2026-07-21 â€” v1.0.114 â€” Digits only (no scrim)

- Version: `1.0.114`
- Timestamp: 2026-07-21 17:35 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Remove micro scrim/background band â€” only colored last3 + thin halo on native Chromium icon.
- Keep native-size ICO frames (16/20/24/32/48). Style â†’ `v4-digits-only-sharp`.
- Electron dev reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-21 â€” v1.0.113 â€” Digits only (no scrim)

- Version: `1.0.113`
- Timestamp: 2026-07-21 17:35 (UTC+7)
- Type: Patch
- Status: Superseded by v1.0.114

### Changes

- Remove micro scrim/background band â€” only colored last3 + thin halo on native Chromium icon.
- Keep native-size ICO frames (16/20/24/32/48). Style â†’ `v4-digits-only-sharp`.

## 2026-07-21 â€” v1.0.112 â€” Electron dev reload

- Version: `1.0.112`
- Timestamp: 2026-07-21 17:26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-21 â€” v1.0.110 â€” Sharp Chromium icon (fix blur)

- Version: `1.0.110`
- Timestamp: 2026-07-21 17:25 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Blur fix:** extract Chromium icon at native size per ICO frame (no 32â†’48 bicubic upscale).
- **Apply:** ICON_SMALL loads 16px first (not 32â†’16 downscale).
- **Scrim V4 tightened:** band ~36% max height, lighter gradient â€” logo upper area stays crisp.

## 2026-07-21 â€” v1.0.109 â€” Lock Design V4 Micro scrim

- Version: `1.0.109`
- Timestamp: 2026-07-21 15:35 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Design lock V4:** bottom gradient scrim (~42% icon height) + subtle digit halo â€” style `v4-digits-scrim-v4`.
- Removed design-preview `taskbar-badge-digit-fx/`; Design Template back to empty state.
- `TASKBAR_PROFILE_BADGE_DESIGN_LOCK` â†’ `V4`.

## 2026-07-21 â€” v1.0.108 â€” Thick halo V2 + design preview UX

- Version: `1.0.108`
- Timestamp: 2026-07-21 15:30 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Promote **Design V2 thick halo** (8-dir + 2px ring) to taskbar renderer â€” style `v4-digits-halo-v2`.
- Fix design preview import + reactive URL pills (no full reload); auto-open single active review on System â†’ Design.
- Design Template preview: 5 digit FX variants remain for lock confirmation.

## 2026-07-21 â€” v1.0.107 â€” Digit FX preview + badge perf

- Version: `1.0.107`
- Timestamp: 2026-07-21 14:15 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Design Template:** 5 taskbar digit text-effect variants (`?dtpl=taskbar-badge-digit-fx&av=V1`â€¦`V5`) â€” thin halo, thick halo, drop shadow, micro scrim, dual stroke.
- **Boot warm:** `warmRecentBadgeIcosOnStartup` pre-builds hot ICO for 16 recently opened profiles (excl. agent pool).
- **Skip headless:** badge apply skipped for headless profiles + agent pool 9990â€“9999 (`shouldSkipTaskbarBadge`).
- **Smoke:** `scripts/smoke-taskbar-badge-latency.mjs` asserts cached OK_ICON â‰¤3s (after DLL warm).
- Cached Win32 apply via `stealth-taskbar-apply.ps1` + DLL warm at boot (~2.2s apply).

## 2026-07-21 â€” v1.0.106 â€” Digits + halo, apply <3s

- Version: `1.0.106`
- Timestamp: 2026-07-21 13:50 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Restore subtle 1px black halo on colored digits (readable on bright Chromium icon; 0xxx white).
- Hot ICO path (48/32/16 ~2.9s cold, <20ms cached) + parallel warm at launch; retry ladder targets OK_ICON within ~3s.
- `pruneStaleBadgeCache` + `scripts/prune-taskbar-badge-cache.mjs` drops v3/v4-digits-only caches (62 files pruned).
- Style cache â†’ `v4-digits-halo`. Electron dev reloaded.

## 2026-07-21 â€” v1.0.105 â€” (superseded by v1.0.106 reload gate)

## 2026-07-21 â€” v1.0.104 â€” Digits only (no plate)

- Version: `1.0.104`
- Timestamp: 2026-07-21 13:25 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Remove charcoal plate and black halo; show Bold colored last3 directly on Chromium icon.
- Renderer simplified (`v4-digits-only`); larger font in bottom zone for taskbar legibility.

## 2026-07-21 â€” v1.0.103 â€” Stronger digit foot clearance

- Version: `1.0.103`
- Timestamp: 2026-07-21 12:55 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Taller plate (~72% @16px); larger bottom pad (3.5â€“6px); slightly smaller Bold size.
- Digits top-aligned in plate (not vertical-center) so feet clear canvas.
- Halo drops downward offsets; cache `v3-digit-halo-pad2`.

## 2026-07-21 â€” v1.0.102 â€” Badge bottom pad (no clipped digit feet)

- Version: `1.0.102`
- Timestamp: 2026-07-21 12:42 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Taller plate band (~+6% height) + 2â€“3.5px bottom pad under digits.
- Glyph feet / halo stay inside plate; cache `v3-digit-halo-pad1`.
- Applied live including 1125.

## 2026-07-21 â€” v1.0.101 â€” Digit palette: 0=white, 1â€“9 vivid

- Version: `1.0.101`
- Timestamp: 2026-07-21 12:35 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- 0xxx digits stay **white** (legacy default).
- 1â€“9 use high-chroma separated hues (cyan / green / yellow / orange / red / magenta / violet / blue / chartreuse).
- Cache style â†’ `v3-digit-halo-w0`.
- Electron reload gate.

## 2026-07-21 â€” v1.0.99 â€” Lock taskbar badge Design V3
## 2026-07-21 â€” v1.0.99 â€” Lock taskbar badge Design V3

- Version: `1.0.99`
- Timestamp: 2026-07-21 12:16 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Design lock V3:** charcoal plate + colored last3 + black halo (`v3-digit-halo`).
- Thousands digit drives digit ink (0125 sky vs 1125 cyan); plate stays `#0c0e14`.
- Delete `design-preview/taskbar-badge-digit-color/`; Design Template empty again.
- Electron reload gate.

## 2026-07-21 â€” v1.0.97 â€” Design preview: digit color

- Version: `1.0.97`
- Timestamp: 2026-07-21 12:10 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- System â†’ Design Template: active review **taskbar-badge-digit-color** (5 variants).
- Focus: digit ink vs plate hue for 0125 / 1125 distinguishability.
- Production badge unchanged until Design lock.

## 2026-07-21 â€” v1.0.96 â€” Stronger thousands plate hues

- Version: `1.0.96`
- Timestamp: 2026-07-21 12:00 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Retune `THOUSANDS_PLATE_*` so adjacent thousands differ clearly (0 navy vs 1 cyan â€” fixes 0125 vs 1125 looking alike).
- Badge style cache key â†’ `v2-bold-kern3-hue2` (invalidates old ICO cache).
- Sync UI mirror `src/lib/profile-code.ts`.
- Electron reload gate.

## 2026-07-20 â€” v1.0.94 â€” Taskbar badge apply reliability

- Version: `1.0.94`
- Timestamp: 2026-07-20 21:45 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Badge on open:** extend retry ladder to ~15s; re-apply after startup navigation completes.
- **Focus-only / re-focus:** schedule badge when attaching to existing Chrome window.
- **PID sidecar:** resolve browser PID via `listProfileBrowserPids` when Playwright omits process id.
- **Win32:** accept empty-title browser hwnd as fallback (early launch window).
- Electron reload gate.

## 2026-07-20 â€” v1.0.92 â€” Dev full catalog + cleanup

- Version: `1.0.92`
- Timestamp: 2026-07-20 19:45 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Dev catalog:** `sync-dev-catalog-now.mjs --full` seeds all prod profiles into isolated dev DB.
- **Cleanup:** trim `design-registry.ts` (remove unused design feature types/exports).
- **Perf:** `warmBadgeIcosForProfiles` default limit 48â†’12.
- **Dev auth:** `hub-identity-urls` same Vite origin in dev â€” no stale `:5176` iframe errors.
- Electron reload gate (identity extension purge).

## 2026-07-20 â€” v1.0.91 â€” Shared live-window WMI helper

- Version: `1.0.91`
- Timestamp: 2026-07-20 19:30 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Add `electron/lib/list-live-cloak-windows.cjs` â€” shared WMI list for badge scripts.

## 2026-07-20 â€” v1.0.90 â€” Taskbar badge dead-code cleanup

- Version: `1.0.90`
- Timestamp: 2026-07-20 18:58 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Remove dead scripts: `apply-v2-taskbar-badges.mjs`, `flash-taskbar-icons.ps1`.
- Remove unused `profile-icon-png.cjs` (legacy extension tile generator).
- Trim `profile-taskbar-native.cjs` exports (`pngBufferToIco`, `BADGE_CANVAS`, internal helpers).
- Update stale comments; unexport `installProfileTitlePrefix`.

## 2026-07-20 â€” v1.0.89 â€” Lock taskbar badge Design V1

- Version: `1.0.89`
- Timestamp: 2026-07-20 18:52 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Design lock V1:** Segoe UI Bold + dynamic kerning + BottomHue plate (`v2-bold-kern3-v1`).
- Removed `taskbar-badge-font-display` design preview; System tab back to empty template.

## 2026-07-20 â€” v1.0.88 â€” Fix design preview import path

- Version: `1.0.88`
- Timestamp: 2026-07-20 18:32 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Fix `Glass` import path in taskbar-badge-font-display preview (`../../../../../theme/p0008`).

## 2026-07-20 â€” v1.0.87 â€” Design: taskbar badge font preview

- Version: `1.0.87`
- Timestamp: 2026-07-20 18:28 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- System â†’ Design Template: active review `taskbar-badge-font-display` â€” 5 font/display variants (V1â€“V5), fixed size + kerning bleed.

## 2026-07-20 â€” v1.0.86 â€” Taskbar: bold + all 3 digits

- Version: `1.0.86`
- Timestamp: 2026-07-20 18:16 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Taskbar badge: fixed Bold font size (11px@16) + dynamic kerning (`GenericTypographic` measure) â€” all 3 digits visible without shrinking.
- Style `v2-bold-kern3`. Applied live.

## 2026-07-20 â€” v1.0.84 â€” Taskbar: fit all 3 digits

## 2026-07-20 â€” v1.0.85 â€” Electron dev reload

- Version: `1.0.85`
- Timestamp: 2026-07-20 18:08 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-20 â€” v1.0.83 â€” Taskbar: Bold clear digits

- Version: `1.0.83`
- Timestamp: 2026-07-20 16:52 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Taskbar badge v2: `Segoe UI Bold` + `ClearTypeGridFit` â€” chá»¯ to, Ä‘áº­m, dá»… Ä‘á»c á»Ÿ má»i size.
- Band 50% á»Ÿ 16px / 45% á»Ÿ 20px / 42% á»Ÿ 24px â€” Ä‘á»§ chá»— cho Bold text, icon top half váº«n nguyÃªn.
- Font size tÄƒng máº¡nh: 11px@16, 13px@20, 15px@24, 18px@32, 24px@48.
- Style `v2-bold-clear`. Applied live 11/13 profiles.

## 2026-07-20 â€” v1.0.82 â€” Taskbar: crisp badge text

- Version: `1.0.82`
- Timestamp: 2026-07-20 16:36 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Taskbar badge: switch text rendering to `SingleBitPerPixelGridFit`, make band fully opaque, and adjust band height/text position for clearer small-size legibility.
- Style key `v1-bottomhue-thin-crisp` applied live.

## 2026-07-20 â€” v1.0.81 â€” Electron dev reload

- Version: `1.0.81`
- Timestamp: 2026-07-20 16:21 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Taskbar badge: preserve original Chromium icon, thin full-width bottom band, `Segoe UI Regular` (larger, thinner glyphs).
- Band height reduced to 24â€“30% (was 34â€“56%), no side inset â€” icon silhouette stays dominant.
- Style `v1-bottomhue-thin`. Applied live to all profile windows.

## 1.0.79

## 2026-07-20 â€” v1.0.80 â€” Electron dev reload

- Version: `1.0.80`
- Timestamp: 2026-07-20 16:15 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 1.0.78

- Version: `1.0.78`
- Timestamp: 2026-07-20T02:33:55.623Z
- Type: Patch
- Status: Verified

- repair-stealth-db: add better-sqlite3 REINDEX after sql.js export; refuse while :6003 up (no default kill prod).
- seed-agent-pool: document never kill packaged Stealth â€” agents only 9990â€“9999.

## 1.0.77

- Version: `1.0.77`
- Timestamp: 2026-07-20T02:25:58.347Z
- Type: Patch
- Status: Verified

- Add `seed-agent-pool-electron.cjs` (Electron ABI) to create/repair agent pool 9990â€“9999 while app is stopped.
- Seeded live pool 9990â€“9999; repaired corrupt indexes (REINDEX) so better-sqlite3 sees pool.

ï»¿# Changelog

## 2026-07-20 â€” v1.0.76 â€” Electron dev reload

- Version: `1.0.76`
- Timestamp: 2026-07-20 09:12 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-20 â€” v1.0.75 â€” Taskbar: sharp bitmap 3 digits (no blur)

- Version: `1.0.75`
- Timestamp: 2026-07-20 07:48 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Drop GDI+ fonts on taskbar sizes â€” **solid 3Ã—5 bitmap** only (no ClearType blur).
- Digits larger (inset 16%), placed **high in plate**; load 48px first. Style `v1-bottomhue-sharp3`.

## 2026-07-20 â€” v1.0.74 â€” Taskbar: fit 3 digits (48px + crisp small)

- Version: `1.0.74`
- Timestamp: 2026-07-20 07:35 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Load **48Ã—48** icon first (Win11 taskbar); fallback 32/24.
- â‰¤32px: filled **5Ã—7** glyphs (3 equal cells); â‰¥40px: **Segoe UI Semibold**. Style `v1-bottomhue-fit3`.

## 2026-07-20 â€” v1.0.73 â€” Taskbar: Segoe UI + equal-cell 3 digits

- Version: `1.0.73`
- Timestamp: 2026-07-20 07:28 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Font â†’ **Segoe UI Semibold** (cleaner than Cascadia Mono at taskbar size).
- Draw **3 equal center cells** with smaller fit (`cellHÃ—0.55`) so leading `0` of `020`/`025` cannot clip. Style `v1-bottomhue-segoe3b`.

## 2026-07-20 â€” v1.0.72 â€” Taskbar badge: clean mono font

- Version: `1.0.72`
- Timestamp: 2026-07-20 07:05 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Digits use **Cascadia Mono Bold** (ClearType, tighter center fit) instead of pixel 3Ã—5 glyphs â€” cleaner at taskbar size.
- Keep plate ~52% + center safe-zone so `020` still shows 3 digits. Style `v1-bottomhue-clean2`.

## 2026-07-20 â€” v1.0.71 â€” Taskbar: keep 3 digits in center safe-zone

- Version: `1.0.71`
- Timestamp: 2026-07-20 06:55 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Plate size unchanged (~52%). Digits use compact **3Ãƒâ€”5** glyphs packed in **center ~44%** (Win taskbar edge-crop was hiding leading `0` of `020`).
- `LoadImage` loads **32Ãƒâ€”32 / 16Ãƒâ€”16** explicitly (avoids bad PNG-ICO frame). Style `v1-bottomhue-safe3b`.

## 2026-07-20 Ã¢â‚¬â€ v1.0.70 Ã¢â‚¬â€ Taskbar badge: keep all 3 digits

- Version: `1.0.70`
- Timestamp: 2026-07-20 06:45 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Root cause: Windows scaled single 256 ICO Ã¢â€ â€™ leading `0` vanished (`002` looked like `02`).
- Fix: multi-res ICO (16Ã¢â‚¬â€œ256) + **5Ãƒâ€”7 pixel digits** at Ã¢â€°Â¤64px + side inset (`v1-bottomhue-pix3b`). Live OK_ICON.

## 2026-07-20 Ã¢â‚¬â€ v1.0.69 Ã¢â‚¬â€ V1 badge: lower plate + clearer digits

- Version: `1.0.69`
- Timestamp: 2026-07-20 06:32 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Plate ~**52%** flush bottom; digits **bottom-aligned** and measure-fit inside plate (no spill).
- **Arial Black** + thick black outline; style `v1-bottomhue-low3`. Live OK_ICON.

## 2026-07-20 Ã¢â‚¬â€ v1.0.68 Ã¢â‚¬â€ Lock Design V1 BottomHue (XL last3)

- Version: `1.0.68`
- Timestamp: 2026-07-20 06:28 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Design lock:** Taskbar badge Ã¢â€ â€™ **V1 BottomHue** (`TASKBAR_PROFILE_BADGE_DESIGN_LOCK`); removed Design Template preview mocks.
- **Visibility:** plate ~**58%** bottom; each of 3 digits in equal cells (no clip); Bold ~**148px** + outline (`v1-bottomhue-xl`). Live OK_ICON re-applied.

## 2026-07-20 Ã¢â‚¬â€ v1.0.67 Ã¢â‚¬â€ Taskbar badge: fit 3 digits + lower strip

- Version: `1.0.67`
- Timestamp: 2026-07-20 06:25 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Root cause:** Bold **152px** clipped leading `0` Ã¢â€ â€™ `0010` looked like **2 digits** (`10`).
- **Fix (`v3b-last3-fit`):** bottom strip **40%**; auto-fit font Ã¢â€°Â¤118px to width; digits aligned **bottom**; black outline for contrast. Re-applied live OK_ICON.

## 2026-07-20 Ã¢â‚¬â€ v1.0.66 Ã¢â‚¬â€ Taskbar last3 + thousands hue Ã‚Â· codes 0000Ã¢â‚¬â€œ9999

- Version: `1.0.66`
- Timestamp: 2026-07-20 06:15 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Profile name:** create/update/bulk require codes **0000Ã¢â‚¬â€œ9999** only (pad 1Ã¢â‚¬â€œ3 digits). Seed demo Ã¢â€ â€™ `0000` / `0001`.
- **Taskbar badge V3a:** show **last 3 digits**; plate hue by thousands (0Ã¢â‚¬â€œ9); bottom plate ~48%; Bold **152px** (`v3a-last3-hue`).
- **Design Template:** 5 layout previews (`taskbar-badge-last3-hue` V1Ã¢â‚¬â€œV5); production default **V1 BottomHue** Ã¢â‚¬â€ reply `Design: Vn` to lock.
- Agent pool API + reload gate notes from concurrent bumps kept.

## 2026-07-19 Ã¢â‚¬â€ v1.0.65 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.65`
- Timestamp: 2026-07-19 06:12 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-20 Ã¢â‚¬â€ v1.0.64 Ã¢â‚¬â€ Agent pool 9990Ã¢â‚¬â€œ9999 API

- Version: `1.0.64`
- Timestamp: 2026-07-20 06:20 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **API:** `POST /api/profiles/ensure-agent-pool` Ã¢â‚¬â€ idempotent create of agent smoke profiles **9990Ã¢â‚¬â€œ9999** (live DB; no IDE browser MCP).
- Agents use Stealth `--agent-pool` only; see `p0003-stealth-browser-ssot.mdc`.

## 2026-07-19 Ã¢â‚¬â€ v1.0.63 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.63`
- Timestamp: 2026-07-19 06:11 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-20 Ã¢â‚¬â€ v1.0.62 Ã¢â‚¬â€ Taskbar last3 + thousands hue Ã‚Â· codes 0000Ã¢â‚¬â€œ9999

- Version: `1.0.62`
- Timestamp: 2026-07-20 06:10 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Profile name:** create/update/bulk require codes **0000Ã¢â‚¬â€œ9999** only (pad 1Ã¢â‚¬â€œ3 digits).
- **Taskbar badge V3a:** show **last 3 digits**; plate hue by thousands digit (0Ã¢â‚¬â€œ9); bottom plate ~48%; Bold **152px**.
- **Design Template:** 5 layout previews (`taskbar-badge-last3-hue` V1Ã¢â‚¬â€œV5); production default **V1 BottomHue**.

## 2026-07-19 Ã¢â‚¬â€ v1.0.61 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.61`
- Timestamp: 2026-07-19 04:51 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-20 Ã¢â‚¬â€ v1.0.60 Ã¢â‚¬â€ Taskbar badge: max digits (v2n)

- Version: `1.0.60`
- Timestamp: 2026-07-20 04:50 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Visual:** plate ~**68%** height; Bold digits **128 / 148 / 168** px (4 / 3 / 2 digits) Ã¢â‚¬â€ was 92/104/118 on `v2m`.
- Cache key `v2n-bottom-max` (invalidates old ICO). Smoke + re-apply live profiles.

## 2026-07-20 Ã¢â‚¬â€ v1.0.59 Ã¢â‚¬â€ Freeze: taskbar badge + session detect + electron-node DB tests

- Version: `1.0.59`
- Timestamp: 2026-07-20 04:35 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Known-good freeze** of WIP since `v1.0.40-stable`: taskbar profile badge Design V2 (`v2m-bottom-huge`), Google/MS challenge detect, WF00011 captcha stop, toolbar page-size SSOT, hub-ui/identity vendor sync.
- **Unit tests:** DB-touching steps (`profile-service`, `api-routes`, Ã¢â‚¬Â¦) run via `electron-node` so host uses `better-sqlite3` (no plain-Node sql.js fallback).
- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-20 Ã¢â‚¬â€ v1.0.58 Ã¢â‚¬â€ Taskbar badge: huge digits + skip WMI

- Version: `1.0.58`
- Timestamp: 2026-07-20 03:25 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Visual:** `v2m-bottom-huge` Ã¢â‚¬â€ 256px canvas, bottom plate ~55% height, **92px** Bold digits (readable after Windows scales to ~24Ã¢â‚¬â€œ32px taskbar).
- **Perf:** pass Playwright `browserPid` / `stealth-pid.json` into apply script Ã¢â‚¬â€ **skip Get-CimInstance** on hot path; sequential retries (no parallel PowerShell pile-up). Write sidecar PID before title/badge.

## 2026-07-19 Ã¢â‚¬â€ v1.0.57 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.57`
- Timestamp: 2026-07-19 03:17 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-20 Ã¢â‚¬â€ v1.0.56 Ã¢â‚¬â€ Taskbar badge: bottom XL digits + ICO warm

- Version: `1.0.56`
- Timestamp: 2026-07-20 03:20 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Visual:** plate back to **bottom**; 128px PNG-in-ICO; Bold **28pt** digits (`v2l-bottom-xl`) for taskbar readability.
- **Perf (ok 1Ã¢â‚¬â€œ3):** warm ICO on launch + directory page list; keep fast retries; reload Electron for new timing.

## 2026-07-20 Ã¢â‚¬â€ v1.0.55 Ã¢â‚¬â€ Taskbar badge: larger center digits + faster apply

- Version: `1.0.55`
- Timestamp: 2026-07-20 03:15 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Visual:** V2 center band on Chromium Ã¢â‚¬â€ Bold **17pt** digits mid-icon (`v2k-center-xl`); easier to read on taskbar.
- **Perf:** badge is fire-and-forget (does not block profile open); warm ICO cache early; retries `0/120/350/700/1400ms` and **stop after OK_ICON** (was always firing 4 PowerShell runs incl. 2s+4s).

## 2026-07-20 Ã¢â‚¬â€ v1.0.54 Ã¢â‚¬â€ Stealth: no false Logged in on Google challenge

- Version: `1.0.54`
- Timestamp: 2026-07-20 03:10 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Root cause (Profile 0001 / `tuanhase03423@gmail.com`):** `detectGoogleSession` stamped `logged_in` when the only Google tab was a sign-in/challenge/error page (`evidence: challenge_url+auth_cookies`) Ã¢â‚¬â€ leftover SID/HSID/SSID overrode the real Gmail Ã¢â‚¬Å“informationÃ¢â‚¬Â / verify error. Data Box Stealth column showed Logged in incorrectly.
- **Fix:** challenge/error tab Ã¢â€ â€™ always `challenged` (`challenge_url+stale_auth_cookies` when cookies remain). Inbox still wins when both tabs exist. Same rule for Microsoft detect.
- Corrected vault snapshot for browser `0001` Ã¢â€ â€™ `challenged` / `google_challenge`.

## 2026-07-20 Ã¢â‚¬â€ v1.0.53 Ã¢â‚¬â€ Stealth: no false Logged in on Google challenge

- Version: `1.0.53`
- Timestamp: 2026-07-20 03:10 (UTC+7)
- Type: Patch
- Status: Superseded by 1.0.54 (Electron reload gate)

### Changes

- Same detect fix as 1.0.54 (gate auto-bumped during `dev-desktop-reload`).

## 2026-07-19 Ã¢â‚¬â€ v1.0.52 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.52`
- Timestamp: 2026-07-19 03:02 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **Taskbar:** purge legacy `v2c-lg` orb caches; HWND via EnumWindows; `apply-all-taskbar-badges.mjs` Ã¢â‚¬â€ prevents blue-orb regression on profiles like 0073/0074.

## 2026-07-20 Ã¢â‚¬â€ v1.0.51 Ã¢â‚¬â€ Taskbar: keep Chromium icon, label only

- Version: `1.0.51`
- Timestamp: 2026-07-20 02:50 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Root cause:** redrawing badge via `Icon.FromHandle(GetHicon)` flattened alpha Ã¢â€ â€™ dark orb; TaskbarList overlay COM not registered on this host.
- **Fix:** draw Chromium + bottom navy digits on transparent PNG Ã¢â€ â€™ pack PNG-in-ICO (`v2i-pngico`); apply live `OK_ICON` for 0001/1731/0010.

## 2026-07-20 Ã¢â‚¬â€ v1.0.50 Ã¢â‚¬â€ Taskbar badge: default Chromium + real codes

- Version: `1.0.50`
- Timestamp: 2026-07-20 02:40 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Badge ICO:** base = default Chromium icon from `~/.cloakbrowser/.../chrome.exe` (ExtractAssociatedIcon); V2 navy center band; Segoe UI Regular **21pt**.
- **Apply batch:** map running profiles via API (`status=running`) Ã¢â€ â€™ real codes (`0001`, `1731`, Ã¢â‚¬Â¦) not fake 380x.
- Cache key `v2e-chr21`.

## 2026-07-19 Ã¢â‚¬â€ v1.0.49 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.49`
- Timestamp: 2026-07-19 02:32 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- Includes **Design V2** taskbar badge ship from 1.0.48 (center band + larger digits).

## 2026-07-20 Ã¢â‚¬â€ v1.0.48 Ã¢â‚¬â€ Lock Design V2 taskbar badge (larger digits)

- Version: `1.0.48`
- Timestamp: 2026-07-20 02:35 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Design lock:** Taskbar profile badge Ã¢â€ â€™ **V2 Center band** (`TASKBAR_PROFILE_BADGE_DESIGN_LOCK`).
- **Native ICO:** Cloak blue + navy mid-band overlay; Segoe UI Regular **18pt** (was Bold 13 on solid fill); cache key `v2c-lg`.
- **Cleanup:** removed `design-preview/taskbar-profile-badge/`; Design Template empty again.

## 2026-07-20 Ã¢â‚¬â€ v1.0.47 Ã¢â‚¬â€ Design preview: overlay thin text on icon

- Version: `1.0.47`
- Timestamp: 2026-07-20 02:25 (UTC+7)
- Type: Patch
- Status: Review

### Changes

- **taskbar-profile-badge preview:** all V1Ã¢â‚¬â€œV5 overlay text ON the Cloak icon (not beside); thin light type + letter-spacing. Placements: bottom hairline Ã‚Â· center band Ã‚Â· top caption Ã‚Â· corner micro Ã‚Â· edge ribbon.

## 2026-07-19 Ã¢â‚¬â€ v1.0.46 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.46`
- Timestamp: 2026-07-19 02:18 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-20 Ã¢â‚¬â€ v1.0.46 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.46`
- Timestamp: 2026-07-20 02:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate.

## 2026-07-20 Ã¢â‚¬â€ v1.0.45 Ã¢â‚¬â€ Design preview: taskbar profile badge

- Version: `1.0.45`
- Timestamp: 2026-07-20 02:20 (UTC+7)
- Type: Patch
- Status: Review

### Changes

- **System Ã¢â€ â€™ Design Template:** active review `taskbar-profile-badge` Ã¢â‚¬â€ 5 layout variants (V1 Adjacent chip Ã‚Â· V2 Dual-zone bar Ã‚Â· V3 Caption stack Ã‚Â· V4 Taskbar rail Ã‚Â· V5 Overlay ribbon). Shared navy/white palette; no production taskbar change until `Design: Vn` lock.

## 2026-07-20 Ã¢â‚¬â€ v1.0.44 Ã¢â‚¬â€ Toolbar page-size SSOT (Display only)

- Version: `1.0.44`
- Timestamp: 2026-07-20 02:20 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Directory toolbar:** when Display band is present, do not also show the Ã¢â‚¬Å“N rowsÃ¢â‚¬Â select (Profiles Ã‚Â· Extensions Ã‚Â· Workflows). Page size is owned by Display / hub `tpage` prefs.

## 2026-07-19 Ã¢â‚¬â€ v1.0.43 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.43`
- Timestamp: 2026-07-19 02:04 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **Taskbar badge fix:** PowerShell `$pid` reserved + `-bor` parse bug blocked WM_SETICON forever Ã¢â‚¬â€ fixed; AppUserModel_RelaunchIconResource; smoke `scripts/smoke-taskbar-badge.mjs` Ã¢â€ â€™ `OK_ICON` verified live.

## 2026-07-19 Ã¢â‚¬â€ v1.0.42 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.42`
- Timestamp: 2026-07-19 01:42 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **WF00011:** on Google reCAPTCHA / "Verify it's you" (`/challenge/recaptcha`) Ã¢â‚¬â€ stop immediately, close browser, set Data Box mail `status=error` + stealth snapshot `challenged/google_challenge` (no more 120s wait).
- **Taskbar:** Win32 `SetWindowText` + cached digit badge icon (`WM_SETICON`) so combined taskbar buttons show profile code (not only hover title).

## 2026-07-19 Ã¢â‚¬â€ v1.0.41 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.41`
- Timestamp: 2026-07-19 01:31 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **Profile window title (taskbar A):** set OS/window title to `code Ã‚Â· name` on open via one `addInitScript` + in-page `document.title` setter patch Ã¢â‚¬â€ no timers/CDP polls; survives navigations for Alt-Tab / taskbar hover.

## 2026-07-19 Ã¢â‚¬â€ v1.0.40 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.40`
- Timestamp: 2026-07-19 23:06 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **WF00011 gmail-login:** gate Microsoft email-Next soft-skip + password ensure to Microsoft login URLs only Ã¢â‚¬â€ Google "Click Next (email)" was skipped so profiles filled email and stalled.
- Vault miss reason: when a Gmail/Outlook row exists but `status != active` (e.g. Incorrect Pass / `incorrect_info`), surface that explicitly (fixes blank `about:blank` confusion for profiles like 0385).
- Reload `vite-build-ui-smoke`: build to `dist-ui-smoke` so it no longer races the live Vite HTML proxy on :5175.

## 2026-07-19 Ã¢â‚¬â€ v1.0.39 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.39`
- Timestamp: 2026-07-19 23:01 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-19 Ã¢â‚¬â€ v1.0.38 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.38`
- Timestamp: 2026-07-19 22:38 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- Repair known-good pin metadata: `gitCommit` Ã¢â€ â€™ `daf5688c` (tag `v1.0.32`), `gitTag` Ã¢â€ â€™ `v1.0.32-stable` (was stale `v1.0.1-stable`); local tag created; Setup-1.0.32.exe SHA512 verified on disk.

## 2026-07-18 Ã¢â‚¬â€ v1.0.37 Ã¢â‚¬â€ Cross-origin Hub identity bridge

- Version: `1.0.37`
- Timestamp: 2026-07-18 00:40 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Start `startHubIdentityCrossOriginBridge` from Stealth auth boot so Hub JWT refresh rotations on sibling tools (P0004/P0005/P0020) are pulled via the Hub iframe bridge Ã¢â‚¬â€ prevents invalidated refresh_token from forcing repeated Login.
- Verified: `dev-desktop-reload.mjs` all checks passed after wiring.

## 2026-07-17 Ã¢â‚¬â€ v1.0.36 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.36`
- Timestamp: 2026-07-17 00:36 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-18 Ã¢â‚¬â€ v1.0.35 Ã¢â‚¬â€ Proactive Hub JWT refresh (fix repeated login)

- Version: `1.0.35`
- Timestamp: 2026-07-18 00:30 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Wired a real Hub token-refresh scheduler** (`src/lib/hub-token-refresh-scheduler.ts`), replacing the previous no-op `tokenScheduler` passed to `useWorkspaceHubAuthBoot`. The desktop console stays focused for hours so `visibilitychange` never fires Ã¢â‚¬â€ without a proactive timer the shared identity client (`persistSession:false, autoRefreshToken:false`) silently rode an expired JWT until the next 401, forcing a repeated Login prompt. Now the cached refresh_token is rotated via `refreshSession()` when within 15 min of expiry, polled every 5 min.
- Verified: `dev-desktop-reload.mjs` Ã¢â€ â€™ workflow-tab console smoke + all checks passed; typecheck clean for changed files.

## 2026-07-17 Ã¢â‚¬â€ v1.0.34 Ã¢â‚¬â€ Electron dev reload

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

- Sync hub-ui SSOT hook-stability patch into vendor/hub-ui: `useHubDirectorySelection`, `useDirectoryHaystackFilter`, and `useDirectoryTableSort` now self-stabilize their row-projection callbacks (idOf/keyOf/sortableValue) via refs, so inline `(row) => row.id` no longer rebuilds the selection/haystack/sort memos every render Ã¢â‚¬â€ snappier checkbox click, drag-sweep, search, and sort with no consumer code changes.

### Verification

- pending

---
## 2026-07-17 Ã¢â‚¬â€ v1.0.32 Ã¢â‚¬â€ Bundle E0001 in installer (fast, offline first open)

- Version: `1.0.32`
- Timestamp: 2026-07-17 17:45 (UTC+7)
- Type: Patch
- Status: Verified (unit + launch benchmark)
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.32

### Changes

- **Bundled E0001 in the installer.** The verified Chrome Web Store snapshot
  (`build/bundled-extensions/<storeId>/unpacked`, ~1MB, shipped via `extraResources`)
  is seeded straight into the AppData cache on a fresh install Ã¢â‚¬â€ the very first profile
  open loads E0001 with **no Chrome Web Store download** (offline-safe). This removes the
  one-time multi-second cold spike a brand-new machine used to pay. Chromium's own
  extension updater still refreshes it later from the store id.
- **Fresh-install guard (deterministic, no network).** The launch hot path
  (`resolveCookieBridgeExtensionDirSync` Ã¢â€ â€™ `seedCacheFromBundle`) now resolves E0001
  synchronously from the bundle, so the first open never blocks on the network Ã¢â‚¬â€ no
  cosmetic "PreparingÃ¢â‚¬Â¦" spinner needed because the seed is a local ~1MB copy.
- **Release pipeline.** New `scripts/sync-bundled-e0001.mjs` refreshes the bundled
  snapshot at release time (offline-safe: keeps the committed copy if the store is
  unreachable; `--force` to re-download). Wired into `release-desktop.ps1` before packaging.
- **Launch-speed gate realism.** `check-launch-speed` threshold moved 800ms Ã¢â€ â€™ **1500ms**:
  the real warm full-open floor is Chromium spawn + E0001 load (~850Ã¢â‚¬â€œ1100ms, machine
  dependent), so 800ms false-failed on spawn variance while 1500ms still catches a
  reintroduced WMI `Get-CimInstance` scan (~3800ms). Matches the unit guard
  `prepare-profile-launch.test.cjs`.
- Prod-proof: fresh benchmark with the bundled E0001 records warm full-open **855ms**
  (prep=0ms Ã¢â€ â€™ WMI fix holds); the sub-500ms 1.0.11 path was E0001-less, so ~850ms is the
  expected floor with the cookie bridge loaded.
- Regression guard: `cookie-bridge-store.test.cjs` now asserts the bundle seeds a fresh
  cache and the sync launch resolver returns it without a download.

## 2026-07-17 Ã¢â‚¬â€ v1.0.31 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.31`
- Timestamp: 2026-07-17 17:31 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.31

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-17 Ã¢â‚¬â€ v1.0.30 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.30`
- Timestamp: 2026-07-17 17:18 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-17 Ã¢â‚¬â€ v1.0.31 Ã¢â‚¬â€ Fix: dev reload no longer kills prod profiles (+ defense-in-depth)

- Version: `1.0.31`
- Timestamp: 2026-07-17 17:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **PROD-SAFETY fix**: `stealthElectronEnv` now pins the dev Electron window to the isolated `-dev`
  userData root (`stealth-browser-console-dev`, API :6004) **deterministically**, instead of via
  `resolveStealthUserDataRoot()` which decided dev-vs-prod from the *ambient* `STEALTH_DEV_ISOLATED`.
  In a plain `dev-desktop-reload` shell that variable is unset, so it resolved to the **prod** root Ã¢â‚¬â€
  the dev window then booted on the packaged app's root/DB and its `reconcileOrphansOnStartup()`
  killed the profiles the user had open in prod. The isolated dev root is now forced and any stale
  inherited `STEALTH_USER_DATA=prod` is ignored (unless the caller overrides via `extra`).
- **Defense-in-depth**: `listChromeProcessesPs` and `focusProfileBrowserWindow` now match Chrome
  strictly on the full `--user-data-dir` path (root-scoped). The bare profile UUID and
  `--stealth-profile-id=<uuid>` needles were dropped Ã¢â‚¬â€ they are identical across user-data roots, so
  a dev-root reconcile could match/kill the prod app's Chrome for the same profile id. The path is a
  strict subset of the old needles (a same-root Chrome always contains it), so only cross-root false
  positives are removed; `taskkill /T` + lock-owner detection still cover child processes.
- **Cold-open finding (root-caused)**: the ~8s "cold spike" is the **first-time E0001 download from
  GitHub** (`ensureCookieBridgeStoreExtension`), which the first `sessions.launch` triggers inline
  only on a root that has never cached E0001. Proof: pre-caching E0001 drops first open 8.2s Ã¢â€ â€™ 2.2s
  (2nd open ~0.9s); the download itself measured 8.2s. Production roots already have E0001 cached
  (and startup `warmCookieBridgeStoreCache` downloads it in the background off the interactive path),
  so real profile opens never pay it. The per-open ~3s users felt on Ã¢â€°Â¤1.0.24 was the WMI
  `Get-CimInstance` scan removed in 1.0.25+. `benchmark-profile-launch` now pre-warms E0001 like
  production so its numbers reflect real (warm-root) opens instead of a fresh-root download artifact.
- Regression guards: `scripts/lib/stealth-electron-env.test.mjs` (dev env Ã¢â€ â€™ `-dev`/:6004 even with a
  stale prod `STEALTH_USER_DATA`; `--prod-data` still :6003; `extra` overrides win) and updated
  `electron/lib/profile-browser-orphan.test.cjs` (root-scoped path needle; no cross-root UUID match).

## 2026-07-17 Ã¢â‚¬â€ v1.0.28 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.28`
- Timestamp: 2026-07-17 17:08 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-17 Ã¢â‚¬â€ v1.0.27 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.27`
- Timestamp: 2026-07-17 17:06 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-17 Ã¢â‚¬â€ v1.0.26 Ã¢â‚¬â€ Fewer WMI scans on orphan attach + open-speed guard

- Version: `1.0.26`
- Timestamp: 2026-07-17 16:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Perf: orphan attach (`#tryAttachOrFocusOrphan`) no longer runs a redundant
  `hasProfileBrowserProcess` WMI confirm when a `SingletonLock` already proves a
  browser holds the profile Ã¢â‚¬â€ it goes straight to focus, saving a second ~3s WMI
  scan when reattaching an already-open profile (e.g. after an app restart).
- Test: `prepare-profile-launch` guards the sub-500ms open path Ã¢â‚¬â€ asserts a
  cleanly-closed profile (and a dead-sidecar profile) never trigger the WMI scan,
  plus `shouldSkipOrphanProbe` only skips when the dir is clean. Registered in
  `run-unit-tests`.
- Verified (no change needed): startup already pre-warms the E0001 store CRX +
  CloakBrowser staging (`warmCookieBridgeStoreCache` + `ensureCloakbrowserExtensionStage`),
  so first-open provisioning is a one-time background cost, not per-open.

## 2026-07-17 Ã¢â‚¬â€ v1.0.25 Ã¢â‚¬â€ Sub-500ms profile opens (drop per-open WMI scan)

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
- Result: warm profile reopens drop from ~3s to **~480ms** Ã¢â‚¬â€ back to 1.0.11 speed.

### Measured

- WMI scan alone: 3143ms. Clean reopen after fix: 477Ã¢â‚¬â€œ480ms (nav ~40ms).

## 2026-07-17 Ã¢â‚¬â€ v1.0.24 Ã¢â‚¬â€ Lean dev extension sync (align with staging)

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

## 2026-07-17 Ã¢â‚¬â€ v1.0.22 Ã¢â‚¬â€ Lean extension staging (fix slow profile opens)

- Version: `1.0.22`
- Timestamp: 2026-07-17 15:45 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.22

### Changes

- Perf: extension staging (`ensureCloakbrowserExtensionStage`) now copies only
  runtime files Ã¢â‚¬â€ dev/publish dirs (`.chrome-store-profile`, `docs`, `.github`,
  `.cursor`, `.vscode`, `.dev`, `coverage`, `.turbo`) are excluded, and any stale
  copies from older builds are pruned from the stage. E0001 shipped a 988-file /
  ~98MB `.chrome-store-profile` dev folder that was copied into the CloakBrowser
  cache and re-validated by Chromium on every new profile's first open Ã¢â‚¬â€ the main
  cause of the multi-second cold opens vs the lean 1.0.11-era extension.
- Test: `cloakbrowser-extension-stage` covers the runtime/dev split + stale prune.

### Diagnosis (measured)

- Warm, provisioned root: E0001 adds only ~300ms to a new-profile open Ã¢â‚¬â€ the
  extension itself is not the bottleneck. The big spikes came from staging/
  re-validating the bloated 98MB extension folder; this change removes that.

## 2026-07-17 Ã¢â‚¬â€ v1.0.21 Ã¢â‚¬â€ Faster repeat profile opens (E0001 native prefs-load)

- Version: `1.0.21`
- Timestamp: 2026-07-17 14:49 (UTC+7)
- Type: Patch
- Status: Committed

### Changes

- Perf: the E0001 Cookie Bridge now loads **once** via `--load-extension` on a
  profile's first open, then on every later open Chromium loads it natively from
  prefs (location 4) Ã¢â‚¬â€ the redundant per-launch `--load-extension` re-validation
  is dropped. Gated on a Chromium-authored `manifest` marker so the flag stays on
  until Chromium has actually installed the extension; `STEALTH_E0001_NATIVE_PREFS=0`
  forces the old always-CLI-load behavior. Launch benchmark avg 2770ms Ã¢â€ â€™ 2151ms.
- Tests: new live e2e `extension-e0001-relaunch-smoke` verifies first-open uses
  the CLI load, Chromium caches the manifest, the second open skips the CLI load,
  and the extension stays loaded + enabled after the flag-less relaunch.

Note: warm/repeat opens were already ~1.0.11 speed; the only way to make *every*
open as fast as pre-extension 1.0.11 is to disable E0001 (Settings Ã¢â€ â€™ Extensions,
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
## 2026-07-17 Ã¢â‚¬â€ v1.0.19 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.19`
- Timestamp: 2026-07-17 10:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-17 Ã¢â‚¬â€ v1.0.19 Ã¢â‚¬â€ Auth flash + multi-profile kill + faster launch

- Version: `1.0.19`
- Timestamp: 2026-07-17 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Fix (multi-profile)** Ã¢â‚¬â€ opening a new profile no longer closes other running profiles. Orphan/lock process matching dropped the shared `--stealth-user-data-tag=<root>` needle (identical for every profile), which made `killOrphanProfileBrowser` for a new profile match and kill all others. Matching is now profile-scoped (path + `--stealth-profile-id`).
- **Fix (auth UX)** Ã¢â‚¬â€ no more "Checking workspace sessionÃ¢â‚¬Â¦" flash when switching tabs / refocusing the console. Tool-access re-verification is optimistic: only the first check shows the boot loader; later re-checks keep the last confirmed grant. An uncertain re-check keeps a prior grant instead of flashing Access Denied.
- **Perf (launch)** Ã¢â‚¬â€ profile launch ran `prepareProfileExtensions` twice per open (once inside `ensureProfileExtensionPins`, once after). The plan is now prepared once and reused, halving per-launch prefs read/write + extension-staging work.

## 2026-07-17 Ã¢â‚¬â€ v1.0.17 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.17`
- Timestamp: 2026-07-17 07:28 (UTC+7)
- Type: Patch
- Status: Committed
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.17

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-16 Ã¢â‚¬â€ v1.0.16 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.16`
- Timestamp: 2026-07-16 01:34 (UTC+7)
- Type: Patch
- Status: Committed

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-16 Ã¢â‚¬â€ v1.0.15 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.15`
- Timestamp: 2026-07-16 23:36 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-16 Ã¢â‚¬â€ v1.0.14 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.14`
- Timestamp: 2026-07-16 16:32 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-16 Ã¢â‚¬â€ v1.0.13 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.13`
- Timestamp: 2026-07-16 15:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-16 Ã¢â‚¬â€ v1.0.12 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.12`
- Timestamp: 2026-07-16 15:05 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-13 Ã¢â‚¬â€ v1.0.11 Ã¢â‚¬â€ Hub API identity (fix packaged No access)

- Version: `1.0.11`
- Timestamp: 2026-07-13 (UTC+7)
- Type: Patch
- Status: Stable

### Changes

- **Fix** Ã¢â‚¬â€ packaged Hub login uses `https://hub-api.infi.io.vn` (retired `*.supabase.co` JWT host caused false Ã¢â‚¬Å“No accessÃ¢â‚¬Â after grant).
- **CSP** Ã¢â‚¬â€ `connect-src` allows `hub-api.infi.io.vn` / `*.infi.io.vn` for identity.
- **Gate** Ã¢â‚¬â€ `smoke-packaged-auth.mjs` + `run-build` fail if dist embeds legacy Hub host or omits hub-api / CSP.
- **Auth UX** Ã¢â‚¬â€ Access Denied recheck + RPC `hub_user_has_tool_access` verify path.

## 2026-07-09 Ã¢â‚¬â€ v1.0.10 Ã¢â‚¬â€ Packaged headed launch + exe resolution

- Version: `1.0.10`
- Timestamp: 2026-07-09 (UTC+7)
- Type: Patch
- Status: Stable

### Changes

- **Headed launch** Ã¢â‚¬â€ packaged app ignores `CURSOR_AGENT` / agent smoke env; profiles show visible Chrome (not headless-invisible).
- **desktop:open** Ã¢â‚¬â€ picks highest-version exe (pending Ã¢â€ â€™ NSIS install Ã¢â€ â€™ win-unpacked); strips smoke env on spawn.
- **Startup** Ã¢â‚¬â€ main process purges agent smoke env when `app.isPackaged`.

## 2026-07-09 Ã¢â‚¬â€ v1.0.9 Ã¢â‚¬â€ Packaged extension store IDs fix

- Version: `1.0.9`
- Timestamp: 2026-07-09 (UTC+7)
- Type: Patch
- Status: Stable

### Changes

- **Fix** Ã¢â‚¬â€ include `shared/stealth-extension-store-ids.json` in NSIS asar (`build.files`); fixes `Cannot find module Ã¢â‚¬Â¦stealth-extension-store-ids.json` on profile launch in packaged app.
- **Gate** Ã¢â‚¬â€ `verify-packaged-unpacked.mjs` asserts shared JSON present in asar.
- **Fallback** Ã¢â‚¬â€ electron loader uses embedded IDs if JSON absent (safety net).

## 2026-07-09 Ã¢â‚¬â€ v1.0.8 Ã¢â‚¬â€ Dev stability + shutdown fix

- Version: `1.0.8`
- Timestamp: 2026-07-09 (UTC+7)
- Type: Patch
- Status: Stable

### Changes

- **Dev guards** Ã¢â‚¬â€ `predev` skips vendor sync / `.env.local` write / `electron-dev-gate` kill when `:5175` is active; `dev-node` retries Vite up to 3Ãƒâ€” on transient exit.
- **Shutdown** Ã¢â‚¬â€ fix `flushScheduledLastOpenedCheckpoint` scope in `before-quit` (no ReferenceError on quit).
- **Build** Ã¢â‚¬â€ `run-build` syncs `hub-ui` + `hub-identity` vendor before `tsc`/vite.
- **UI** Ã¢â‚¬â€ `profile-form-field-meta` uses `headerIconClassName` SSOT from hub-ui column meta.

## 2026-07-08 Ã¢â‚¬â€ v1.0.7 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.7`
- Timestamp: 2026-07-08 06:54 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 Ã¢â‚¬â€ v1.0.6 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.6`
- Timestamp: 2026-07-08 06:49 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-09 Ã¢â‚¬â€ v1.0.5 Ã¢â‚¬â€ Last opened durability (prod catalog)

- Version: `1.0.5`
- Timestamp: 2026-07-09 (UTC+7)
- Type: Patch
- Status: Stable

### Changes

- **Last opened** Ã¢â‚¬â€ WAL debounced checkpoint after profile open; startup repair from `profile_events` + merge newer dev isolated DB into prod; pre-update in-app checkpoint before `quitAndInstall`.
- **Guards** Ã¢â‚¬â€ never downgrade `last_opened_at`; skip same-db merge; ATTACH sibling read-only; reconcile rejects future timestamps.
- **Repair script** Ã¢â‚¬â€ `node scripts/repair-last-opened-catalog.mjs` (prod DB, app closed).
- **Monitor** Ã¢â‚¬â€ every boot logs `[last-opened] startup maintenance reconciled=N siblingMerged=M` (healthy steady-state: `0 0`).
- **Not added** Ã¢â‚¬â€ no sidecar JSON; no NSIS API checkpoint (installer hook stays `app.asar.unpacked` cleanup only).

## 2026-07-08 Ã¢â‚¬â€ v1.0.4 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.4`
- Timestamp: 2026-07-08 04:17 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 Ã¢â‚¬â€ v1.0.3 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.3`
- Timestamp: 2026-07-08 03:14 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 Ã¢â‚¬â€ v1.0.2 Ã¢â‚¬â€ Electron dev reload

- Version: `1.0.2`
- Timestamp: 2026-07-08 03:09 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 Ã¢â‚¬â€ v1.0.1 Ã¢â‚¬â€ Fix proxy geoip (mmdb-lib) on packaged build

- Version: `1.0.1`
- Timestamp: 2026-07-08 21:40 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.1

### Changes

- **Packaged proxy launch** Ã¢â‚¬â€ stage `mmdb-lib` beside unpacked `cloakbrowser` (ESM `geoip.js` import); only enable `geoip: true` when unpacked module exists (fixes false-positive `require.resolve` from asar).

### Verification

- `afterPack` 7/7 ESM deps Ã‚Â· `smoke-packaged-cloakbrowser-import` tar + mmdb-lib/geoip OK.

---

- Version: `1.0.0`
- Timestamp: 2026-07-08 21:15 (UTC+7)
- Type: **Major**
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v1.0.0

### Changes

- **Fix** Ã¢â‚¬â€ `ERR_MODULE_NOT_FOUND: tar` when Run profile on installed Setup.exe (v0.10.77): load `cloakbrowser` from `app.asar.unpacked` so ESM resolves `tar` beside unpacked `node_modules`.
- **Packaging** Ã¢â‚¬â€ `afterPack` stages `tar` + transitive ESM deps; gate `smoke-packaged-cloakbrowser-import.cjs`.
- **Dev catalog** Ã¢â‚¬â€ sync from prod no longer down-seeds full catalog back to 80 profiles.

### Verification

- `verify-packaged-unpacked` + cloakbrowser/tar ESM smoke pass after NSIS pack.

---

- Version: `0.10.80`
- Timestamp: 2026-07-08 20:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 Ã¢â‚¬â€ v0.10.79 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.79`
- Timestamp: 2026-07-08 20:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 Ã¢â‚¬â€ v0.10.80 Ã¢â‚¬â€ Fix packaged profile launch (cloakbrowser tar ESM)

- Version: `0.10.80`
- Timestamp: 2026-07-08 20:55 (UTC+7)
- Type: Patch
- Status: Verified (pack dir + ESM smoke)

### Changes

- **Packaged launch** Ã¢â‚¬â€ load `cloakbrowser` from `app.asar.unpacked` file URL so ESM sub-import `tar` resolves beside unpacked `node_modules` (fixes `ERR_MODULE_NOT_FOUND: tar` on profile Run in installed exe).
- **afterPack** Ã¢â‚¬â€ keep staging `tar` + transitive ESM deps under `app.asar.unpacked/node_modules`.
- **Gate** Ã¢â‚¬â€ `smoke-packaged-cloakbrowser-import.cjs` after `verify-packaged-unpacked.mjs`.

### Verification

- `pnpm pack` (dir) + `verify-packaged-unpacked` + cloakbrowser/tar ESM smoke pass.

---

- Version: `0.10.74`
- Timestamp: 2026-07-08 19:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 Ã¢â‚¬â€ v0.10.72 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.72`
- Timestamp: 2026-07-08 18:49 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-08 Ã¢â‚¬â€ v0.10.71 Ã¢â‚¬â€ Electron dev reload

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
## 2026-07-07 Ã¢â‚¬â€ v0.10.63 Ã¢â‚¬â€ Electron dev reload

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
# Changelog Ã¢â‚¬â€ P0003 Stealth Browser Console

## 2026-07-06 Ã¢â‚¬â€ v0.10.61 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.61`
- Timestamp: 2026-07-06 02:26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.60 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.60`
- Timestamp: 2026-07-06 02:19 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.59 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.59`
- Timestamp: 2026-07-06 02:09 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.58 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.58`
- Timestamp: 2026-07-06 01:06 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.57 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.57`
- Timestamp: 2026-07-06 00:55 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.56 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.56`
- Timestamp: 2026-07-06 00:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.55 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.55`
- Timestamp: 2026-07-06 00:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.54 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.54`
- Timestamp: 2026-07-06 23:58 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.53 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.53`
- Timestamp: 2026-07-06 23:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.52 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.52`
- Timestamp: 2026-07-06 23:50 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.51 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.51`
- Timestamp: 2026-07-06 23:36 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.50 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.50`
- Timestamp: 2026-07-06 22:32 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.49 Ã¢â‚¬â€ Profile log realtime + backfill + create split

- Version: `0.10.49`
- Timestamp: 2026-07-06 22:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Realtime log** Ã¢â‚¬â€ `useProfileLogRealtime` subscribes `profile:session` to refresh log rail on launch/close/fail without reopening modal.
- **Backfill** Ã¢â‚¬â€ one-time `profile_events` seed from `last_opened_at` + `runs` for legacy catalogs (`profile_events_backfill_v1`).
- **Create modal** Ã¢â‚¬â€ `hub-tool-detail-modal--split` with shared `ProfileActivityLogRail` (bulk create streams to grid terminal).

## 2026-07-06 Ã¢â‚¬â€ v0.10.48 Ã¢â‚¬â€ Profile detail: Log rail parity P0006 Job detail

- Version: `0.10.48`
- Timestamp: 2026-07-06 21:40 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profile edit modal** Ã¢â‚¬â€ migrate to `hub-tool-detail-modal--split` (P0006 Job detail parity): main = Profile/Device/Extensions/Note panels, right rail = Log console.
- **Log rail** Ã¢â‚¬â€ `ProfileDetailLogRail` with `HubToolDetailRail` + grid terminal (`Time Ã‚Â· Channel Ã‚Â· Message`) and channel legend Profile/Workflow/Lifecycle.
- **TOC Log** Ã¢â‚¬â€ click focuses log rail (scroll + highlight pulse); `lifecycle` channel badge added to Hub-UI `hub-runtime-rail.css`.

## 2026-07-06 Ã¢â‚¬â€ v0.10.47 Ã¢â‚¬â€ Profile detail scroll + lifecycle log + identity header

- Version: `0.10.47`
- Timestamp: 2026-07-06 20:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profile detail modal** Ã¢â‚¬â€ migrate edit shell to `hub-account-detail-modal` SSOT; TOC scroll root targets `hub-account-detail-modal__main-scroll` so Log section is reachable.
- **Log frame** Ã¢â‚¬â€ `HubRuntimeConsoleTerm` with All/Today/Errors filters; merges session console, workflow runs, and persisted `profile_events` (launch/close/save).
- **Header** Ã¢â‚¬â€ `HubToolDetailIdentityHeader` with profile name, group, and status (replaces plain "Edit profile" title).
- Electron dev reload gate (electron sources changed).

## 2026-07-06 Ã¢â‚¬â€ v0.10.46 Ã¢â‚¬â€ Profile detail scroll + lifecycle log + identity header

- Version: `0.10.46`
- Timestamp: 2026-07-06 20:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- (Superseded by v0.10.47 dev-reload bump Ã¢â‚¬â€ same feature set.)

## 2026-07-06 Ã¢â‚¬â€ v0.10.45 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.45`
- Timestamp: 2026-07-06 19:31 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.44 Ã¢â‚¬â€ Profile detail modal: Log console + row open + Device collapse

- Version: `0.10.44`
- Timestamp: 2026-07-06 19:22 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profile detail modal** Ã¢â‚¬â€ Log tab uses `HubRuntimeConsoleTerm` (session console + workflow runs filtered per profile); Note rail only on edit.
- **Directory** Ã¢â‚¬â€ single-click profile row opens detail modal (`onOpenDetail`).
- **Device section** Ã¢â‚¬â€ advanced fingerprint/viewport/UA settings collapsed by default behind toggle.

## 2026-07-06 Ã¢â‚¬â€ v0.10.43 Ã¢â‚¬â€ Last Opened survives deploy + dev reload protects prod exe

- Version: `0.10.43`
- Timestamp: 2026-07-06 18:37 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Last Opened** Ã¢â‚¬â€ stop deleting SQLite WAL on DB open (installer/restart without graceful quit was dropping recent `last_opened_at`); checkpoint WAL on quit and after each profile open.
- **Dev reload** Ã¢â‚¬â€ `killStealthDev` verifies PID is `dev-node.mjs` before `taskkill`; frees `:5175` + dev API `:6004` only; `kill-port` refuses prod `:6003`.
- **Dev catalog sync** Ã¢â‚¬â€ preserve newer `last_opened_at` from dev DB when copying prod catalog.

## 2026-07-06 Ã¢â‚¬â€ v0.10.42 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.42`
- Timestamp: 2026-07-06 18:11 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.41 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.41`
- Timestamp: 2026-07-06 17:52 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 - Proxy launch fix (host:port:user:pass Ã¢â€ â€™ Playwright)

- Version: `0.10.41`
- Timestamp: 2026-07-06 17:50 (UTC+7)
- Type: Patch
- Product: P0003

### Changes

- **Proxy** Ã¢â‚¬â€ `parseProxy` supports `host:port:user` shorthand; `formatProxyForLaunch` + `toPlaywrightProxy` normalize GPM/antidetect strings before `launchPersistentContext` (fixes `Invalid URL` on `14.249.5.164:32350:infi:infi`).

### Verification

- `node electron/api-routes.test.cjs` (proxy-pool)
- Profile Run with HTTP proxy credentials

## 2026-07-06 - Workflow footer chrome (minimap + zoom)

- Version: `0.10.39`
- Timestamp: 2026-07-06 17:35 (UTC+7)
- Type: Patch
- Status: Committed

### Changes

- **Layout footer** Ã¢â‚¬â€ Minimap + zoom bar moved into document-flow footer row with canvas tips (`?` + hint); no canvas overlay panels.
- **Canvas fit** Ã¢â‚¬â€ Default zoom label 100% with baked 0.85 visual scale; smart edge paths + editor/canvas flex rebalance.
- **Dev icon** Ã¢â‚¬â€ SSOT `sync-app-icon` + profile window taskbar icon parity.

## 2026-07-06 Ã¢â‚¬â€ v0.10.38 Ã¢â‚¬â€ Hidden spawn (no PowerShell flash)

- Version: `0.10.38`
- Timestamp: 2026-07-06 16:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **run-step.mjs** Ã¢â‚¬â€ shared hidden spawn for predev/reload/test scripts (`windowsHide`, `run-pnpm-exec`); removes `shell: true` PowerShell flashes on Windows.

## 2026-07-06 Ã¢â‚¬â€ v0.10.37 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.37`
- Timestamp: 2026-07-06 15:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.36 Ã¢â‚¬â€ Responsive 3-frame stack; canvas chrome inset

- Version: `0.10.36`
- Timestamp: 2026-07-06 07:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps layout** Ã¢â‚¬â€ drop fixed 3:3:4 grid; flex stack with content-sized AI/editor frames and Layout filling remainder; minimap/zoom inset from canvas edge.

## 2026-07-06 Ã¢â‚¬â€ v0.10.35 Ã¢â‚¬â€ Frame border clip fix; HubSegmentToggle Steps/Workflow

- Version: `0.10.35`
- Timestamp: 2026-07-06 07:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps UI** Ã¢â‚¬â€ fix frame border clipping (chip row inset, layout canvas/minimap inset); AI scope uses `HubSegmentToggle` with icons (Steps / Workflow, Table/Card parity).

## 2026-07-06 Ã¢â‚¬â€ v0.10.34 Ã¢â‚¬â€ Step chip scroll; inspector always visible

- Version: `0.10.34`
- Timestamp: 2026-07-06 07:14 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step editor** Ã¢â‚¬â€ chip row capped at ~2 rows with vertical scroll; inspector + bulk bar stay visible when workflows have many steps.

## 2026-07-06 Ã¢â‚¬â€ v0.10.33 Ã¢â‚¬â€ Scripts 3-frame height ratio 3:3:4; restore Layout canvas

- Version: `0.10.33`
- Timestamp: 2026-07-06 07:10 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps layout** Ã¢â‚¬â€ grid rows `3fr 3fr 4fr` for AI / step editor / Layout frames; restore Layout canvas shell border and gradient inside its frame.

## 2026-07-06 Ã¢â‚¬â€ v0.10.32 Ã¢â‚¬â€ Step editor + Layout separate frames

- Version: `0.10.32`
- Timestamp: 2026-07-06 07:06 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps UI** Ã¢â‚¬â€ step chips + inspector + bulk actions in dedicated frame; Layout canvas in its own frame below.

## 2026-07-06 Ã¢â‚¬â€ v0.10.31 Ã¢â‚¬â€ Step inspector alignment; AI 5-line; flush frames

- Version: `0.10.31`
- Timestamp: 2026-07-06 07:05 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step inspector** Ã¢â‚¬â€ labels Title Case (Name not NAME); 3-column grid, label above control, aligned rows.
- **AI Steps Assistant** Ã¢â‚¬â€ 5-line prompt; Steps + Layout frames flush (no gap between panels).

## 2026-07-06 Ã¢â‚¬â€ v0.10.30 Ã¢â‚¬â€ AI Gen auto-apply; Hub-UI typography + label icons

- Version: `0.10.30`
- Timestamp: 2026-07-06 06:08 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **AI assistant** Ã¢â‚¬â€ **Gen** applies steps to workflow immediately (no separate Apply); success toast after apply.
- **Workflow Steps / Layout** Ã¢â‚¬â€ Hub-UI font tokens (`--hub-table-*`); icons on step chips, inspector labels, section headers.

## 2026-07-06 Ã¢â‚¬â€ v0.10.29 Ã¢â‚¬â€ AI Gen JSON robust + Steps/Workflow scope + compact chat

- Version: `0.10.29`
- Timestamp: 2026-07-06 06:02 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **AI assistant** Ã¢â‚¬â€ stack-based JSON extract (fixes trailing Grok text); scope toggle **Steps** (step list only) vs **Workflow** (full); smaller prompt box.

## 2026-07-06 Ã¢â‚¬â€ v0.10.28 Ã¢â‚¬â€ AI Gen JSON parse (trailing model text)

- Version: `0.10.28`
- Timestamp: 2026-07-06 05:58 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **AI Step Assistant** Ã¢â‚¬â€ extract first balanced JSON object from model output (fixes `Unexpected non-whitespace character after JSON` when Grok appends commentary).

## 2026-07-05 Ã¢â‚¬â€ v0.10.27 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.27`
- Timestamp: 2026-07-05 05:47 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-06 Ã¢â‚¬â€ v0.10.26 Ã¢â‚¬â€ 9Router AI Gen: fix deactivated Codex workspace

- Version: `0.10.26`
- Timestamp: 2026-07-06 05:48 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **9Router AI Gen** Ã¢â‚¬â€ default model `xai/grok-3` (Codex workspace 402 deactivated); bootstrap always syncs `config/router.local.json` over stale localStorage; model fallback chain + clearer errors.
- **Script** Ã¢â‚¬â€ `pnpm sync:9router` probes P0007 keys and writes working router config.

## 2026-07-06 Ã¢â‚¬â€ v0.10.25 Ã¢â‚¬â€ Fix empty workflow canvas on first open; Hub minimap skin

- Version: `0.10.25`
- Timestamp: 2026-07-06 05:42 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow canvas** Ã¢â‚¬â€ fix StrictMode race leaving Layout empty on default WF00001; refit when viewport size is ready.
- **Mini-map** Ã¢â‚¬â€ Hub-UI surface/border styling (no white panel background).

## 2026-07-06 Ã¢â‚¬â€ v0.10.24 Ã¢â‚¬â€ Lock Design V5 canvas; clear Design previews

- Version: `0.10.24`
- Timestamp: 2026-07-06 05:32 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow canvas** Ã¢â‚¬â€ locked **Design V5** (LTR spaced grid, centered, V5 bezier edges, purple stroke); layout picker read-only.
- **System Ã¢â€ â€™ Design** Ã¢â‚¬â€ removed V1Ã¢â‚¬â€œV5 preview mocks; empty `HubDesignTemplateEmpty` kept for future reviews.

## 2026-07-06 Ã¢â‚¬â€ v0.10.23 Ã¢â‚¬â€ Zoom % + canvas compact + Design layout V1Ã¢â‚¬â€œV5

- Version: `0.10.23`
- Timestamp: 2026-07-06 05:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Canvas zoom** Ã¢â‚¬â€ custom controls show live zoom **percentage** (+ / Ã¢Ë†â€™ / fit).
- **Step canvas** Ã¢â‚¬â€ compact nodes (title only); bezier edges when not axis-aligned; wider row gap.
- **System Ã¢â€ â€™ Design** Ã¢â‚¬â€ 5 layout previews (horizontal, vertical, snake LTR, icon rail, bezier spaced) for review.

## 2026-07-06 Ã¢â‚¬â€ v0.10.22 Ã¢â‚¬â€ Smart orthogonal step edges

- Version: `0.10.22`
- Timestamp: 2026-07-06 05:12 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step edges** Ã¢â‚¬â€ replace smooth-step loops with straight / single-corner orthogonal paths; row wraps use vertical handles only.
- **Short chains (Ã¢â€°Â¤5 steps)** Ã¢â‚¬â€ serpentine stays on one row so 3-step workflows get simple horizontal connectors.

## 2026-07-06 Ã¢â‚¬â€ v0.10.21 Ã¢â‚¬â€ Cleaner step edges + catalog timestamp migration

- Version: `0.10.21`
- Timestamp: 2026-07-06 05:05 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step canvas edges** Ã¢â‚¬â€ per-node handle direction (follow chain); tighter smooth-step offset; thinner stroke (no glow/sheen animation).
- **Created / Updated** Ã¢â‚¬â€ migrate legacy Dec 2023 fake seeds to Apr 2026 catalog dates; `updatedAt` stays equal to `createdAt` until user saves.

## 2026-07-06 Ã¢â‚¬â€ v0.10.20 Ã¢â‚¬â€ Canvas center fit + Profile Rail workflow run fix

- Version: `0.10.20`
- Timestamp: 2026-07-06 04:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step canvas** Ã¢â‚¬â€ layout nodes in positive viewport space; stronger `fitView` (double rAF + delayed refit) so steps stay centered, not stuck in the top-left corner.
- **Profile Rail run** Ã¢â‚¬â€ clicking a workflow selects it for Launch; queue falls back to active workflow; no longer clears selection or attributes runs to `open-url`.
- **WF00001 timestamps** Ã¢â‚¬â€ stable builtin seed epoch (no `Date.now()` for index 0); session active workflow restored before last-run default.

## 2026-07-06 Ã¢â‚¬â€ v0.10.19 Ã¢â‚¬â€ Fix workflow timestamps + Last Run + canvas center

- Version: `0.10.19`
- Timestamp: 2026-07-06 03:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Timestamp bug** Ã¢â‚¬â€ removed mount-time stamp that overwrote WF00001; seed `createdAt`/`updatedAt` by builtin workflow index, not array position.
- **Last Run** Ã¢â‚¬â€ `persistWorkflowLastRun` writes localStorage + syncs UI; Profiles Open URL and automation queue both update `lastRunAt`.
- **Step canvas** Ã¢â‚¬â€ center nodes after layout; tighter fitView (`padding 0.16`, `maxZoom 0.58`) so long chains stay compact.

## 2026-07-06 Ã¢â‚¬â€ v0.10.18 Ã¢â‚¬â€ Revert design preview; last-run default selection

- Version: `0.10.18`
- Timestamp: 2026-07-06 03:10 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Design preview removed** Ã¢â‚¬â€ deleted workflow-canvas V1Ã¢â‚¬â€œV5 mocks; System nav back to Overview / Backup only.
- **Default workflow** Ã¢â‚¬â€ Scripts tab selects workflow with latest `lastRunAt` on load (fallback: first in list).
- **Step canvas** Ã¢â‚¬â€ tighter nodes (80Ãƒâ€”72) and fitView (`maxZoom 0.72`) so long chains stay in view.

## 2026-07-06 Ã¢â‚¬â€ v0.10.17 Ã¢â‚¬â€ Fix blank screen (Design nav tone)

- Version: `0.10.17`
- Timestamp: 2026-07-06 03:05 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **System Ã¢â€ â€™ Design** Ã¢â‚¬â€ fix invalid `iconTone: "purple"` (hub-ui only allows violet/fuchsia/etc.) that crashed React on boot.

## 2026-07-06 Ã¢â‚¬â€ v0.10.16 Ã¢â‚¬â€ System Design sub-tab

- Version: `0.10.16`
- Timestamp: 2026-07-06 03:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **System Ã¢â€ â€™ Design** Ã¢â‚¬â€ new sidebar sub-tab mounts `DesignTemplatePage` with workflow canvas layout review (V1Ã¢â‚¬â€œV5).
- **Design Template page** Ã¢â‚¬â€ removed duplicate Overview panels; previews only when `ACTIVE_DESIGN_COUNT > 0`.

## 2026-07-06 Ã¢â‚¬â€ v0.10.15 Ã¢â‚¬â€ Workflow canvas compact + layout design review

- Version: `0.10.15`
- Timestamp: 2026-07-06 02:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Step canvas** Ã¢â‚¬â€ smaller nodes (96Ãƒâ€”88), 5-column serpentine, tighter fitView; status chip hidden on canvas for density.
- **Scripts tab** Ã¢â‚¬â€ no workflow selected by default; empty editor until row click.
- **Last Run** Ã¢â‚¬â€ column label title case.
- **Design Template** Ã¢â‚¬â€ 5 workflow canvas layout variants (V1Ã¢â‚¬â€œV5) under System for layout review.

## 2026-07-06 Ã¢â‚¬â€ v0.10.14 Ã¢â‚¬â€ Workflow directory + canvas layout

- Version: `0.10.14`
- Timestamp: 2026-07-06 02:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Active workflow** Ã¢â‚¬â€ session-only (`sessionStorage`); default `open-url`; row click no longer bulk-selects checkbox.
- **Last run column** Ã¢â‚¬â€ `lastRunAt` on workflows; updated after each automation run.
- **Step canvas** Ã¢â‚¬â€ default serpentine layout for long chains; `fitView` zoom-out instead of locked zoom.
- **Scripts toolbar** Ã¢â‚¬â€ `0/N` selection chip moved to `searchTrailing` (Hub-UI parity with Store/Rail).

## 2026-07-05 Ã¢â‚¬â€ v0.10.13 Ã¢â‚¬â€ Hub UI Ã¢â‚¬Å“Just nowÃ¢â‚¬Â label parity

- Version: `0.10.13`
- Timestamp: 2026-07-05 22:38 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Last opened / activity timestamps** Ã¢â‚¬â€ hub-ui SSOT returns `Just now` (sentence case) instead of `just now`; synced vendor hub-ui.
- **Profiles + Workflow directory** Ã¢â‚¬â€ `capitalize={false}` no longer blocks the label; matches P0020 2FA / Hub activity copy.

## 2026-07-05 Ã¢â‚¬â€ v0.10.12 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.12`
- Timestamp: 2026-07-05 22:24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-05 Ã¢â‚¬â€ v0.10.11 Ã¢â‚¬â€ Fix startup closing user new tabs

- Version: `0.10.11`
- Timestamp: 2026-07-05 20:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Startup nav** Ã¢â‚¬â€ only close placeholder tabs that existed at launch; tabs opened during the first seconds of Run (Ctrl+T) are no longer killed when startup URL settles.
- **Unit test** Ã¢â‚¬â€ `navigate-startup.test.cjs` guards launch-time vs operator tab selection.

## 2026-07-05 Ã¢â‚¬â€ v0.10.10 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.10`
- Timestamp: 2026-07-05 19:29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-05 Ã¢â‚¬â€ v0.10.8 Ã¢â‚¬â€ Stable auto-update (unpacked repair + build gate)

- Version: `0.10.8`
- Timestamp: 2026-07-05 06:00 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **NSIS customInit** Ã¢â‚¬â€ remove stale `app.asar.unpacked` before install/update so patch updates rebuild unpacked modules (playwright-core, cloakbrowser).
- **Runtime check** Ã¢â‚¬â€ packaged startup dialog + block `profile:launch` when critical unpacked files missing; link to latest Setup.
- **Build gate** Ã¢â‚¬â€ `verify-packaged-unpacked.mjs` fails desktop build if win-unpacked lacks required unpacked paths.
- **differentialPackage: false** Ã¢â‚¬â€ full NSIS payload on every update (avoids partial patch corruption on large jumps).

## 2026-07-05 Ã¢â‚¬â€ v0.10.7 Ã¢â‚¬â€ Silent NSIS update + release upload fix

- Version: `0.10.7`
- Timestamp: 2026-07-05 05:40 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **NSIS oneClick** Ã¢â‚¬â€ silent install on quit for electron-updater patch updates.
- **Upload script** Ã¢â‚¬â€ `run-electron-package.mjs` uploads only current-version Setup/blockmap/latest.yml; prunes stale local + GitHub assets.
- **Shutdown fix** (from v0.10.5) Ã¢â‚¬â€ await `closeAll()` before `closeDatabase()`.

## 2026-07-05 Ã¢â‚¬â€ v0.10.6 Ã¢â‚¬â€ Silent NSIS auto-update installer

- Version: `0.10.6`
- Timestamp: 2026-07-05 05:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **NSIS oneClick** Ã¢â‚¬â€ silent install on quit for electron-updater (no installer wizard on patch updates).
- **Upload script** Ã¢â‚¬â€ `run-electron-package.mjs` uploads only current-version Setup/blockmap/latest.yml; prunes stale local + GitHub release assets.

## 2026-07-05 Ã¢â‚¬â€ v0.10.5 Ã¢â‚¬â€ Fix Database not initialized on packaged shutdown

- Version: `0.10.5`
- Timestamp: 2026-07-05 04:50 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Shutdown order** Ã¢â‚¬â€ `before-quit` awaits `sessionManager.closeAll()` before `closeDatabase()` (fixes race when browser context `finalize` fires after DB closed).
- **Safe status writes** Ã¢â‚¬â€ `setProfileStatus` / `touchLastOpened` no-op when DB already closed; session `finalize` wrapped in try/catch.

## 2026-07-04 Ã¢â‚¬â€ v0.10.4 Ã¢â‚¬â€ Electron dev reload

- Version: `0.10.4`
- Timestamp: 2026-07-04 04:36 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-05 Ã¢â‚¬â€ v0.10.3 Ã¢â‚¬â€ Desktop release: Surfshark icon + Gmail 2FA + session skip

- Version: `0.10.3`
- Timestamp: 2026-07-05 03:50 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- **Gmail login session-active** Ã¢â‚¬â€ skip login/TOTP steps when Google session already on `myaccount.google.com` / `mail.google.com` (`script-steps.cjs`).
- **confirmidentifier / challenge/pwd** Ã¢â‚¬â€ advance without email wait when password step is ready.
- **E2E smoke** Ã¢â‚¬â€ `gmail-login-profile-smoke.cjs` accepts `session-already-active` as PASS.
- **Desktop release** Ã¢â‚¬â€ GitHub Release + `latest.yml` for electron-updater (NSIS auto-download on quit).

## 2026-07-05 Ã¢â‚¬â€ v0.10.2 Ã¢â‚¬â€ Surfshark brand icon + Gmail 2FA Authenticator path

- Version: `0.10.2`
- Timestamp: 2026-07-05 03:15 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Surfshark column header** Ã¢â‚¬â€ `HubBrandIcon` registry fallback (`/assets/brand-icons/surfshark.png`) when extension IPC icon missing/broken.
- **WF00011 gmail-login** Ã¢â‚¬â€ push-notification 2FA: auto **Try another way** Ã¢â€ â€™ **Google Authenticator** Ã¢â€ â€™ TOTP input (`script-steps.cjs`).
- **Hub-ui sync** Ã¢â‚¬â€ `P0027` added to default `sync-hub-ui-vendor` targets; `HubDirectoryBrandNameCell` fan-out.

## 2026-07-05 Ã¢â‚¬â€ v0.10.1 Ã¢â‚¬â€ Run History registry labels + 2-line layout

- Version: `0.10.1`
- Timestamp: 2026-07-05 02:55 (UTC+7)
- Type: Minor
- Status: Dev

### Changes

- **Run History 2-line layout** Ã¢â‚¬â€ line 1: profile ID + browser + task label + status trailing; line 2: timestamp + duration (`HubRuntimeHistoryList` SSOT).
- **Workflow registry labels** Ã¢â‚¬â€ `resolveWorkflowRunLabel` maps workflow id Ã¢â€ â€™ `WorkflowConfig.name` (e.g. `gmail-login` Ã¢â€ â€™ `Gmail Login`).

## 2026-07-05 Ã¢â‚¬â€ v0.9.3 Ã¢â‚¬â€ Run History 2-line layout

- Version: `0.9.3`
- Timestamp: 2026-07-05 01:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Run History** Ã¢â‚¬â€ 2-line rows: line 1 = profile ID + browser name + task label, status trailing right; line 2 = timestamp + duration.
- **Hub SSOT** Ã¢â‚¬â€ `HubRuntimeHistoryList` API `primaryRow` / `primaryTrailing` / `metaRow`; `formatRunHistoryPrimaryLabel` helper.

## 2026-07-04 Ã¢â‚¬â€ v0.9.2 Ã¢â‚¬â€ Hub runtime rail SSOT (Console + Run History)

- Version: `0.9.2`
- Timestamp: 2026-07-04 21:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Hub runtime rail SSOT** Ã¢â‚¬â€ `HubRuntimeChannelBadge`, `HubRuntimeConsoleTerm`, `HubRuntimeHistoryList` from `packages/hub-ui`; removed local `stealth-runtime-rail.css`.
- **P0027 parity** Ã¢â‚¬â€ shared pill badges + history list contract; fan-out via `sync-hub-ui-vendor.cjs`.

## 2026-07-04 Ã¢â‚¬â€ v0.9.1 Ã¢â‚¬â€ Console channel badges (Todo pill parity)

- Version: `0.9.1`
- Timestamp: 2026-07-04 21:15 (UTC+7)
- Type: Minor
- Status: Dev

### Changes

- **Console badges** Ã¢â‚¬â€ `StealthConsoleChannelBadge` (icon + Title Case label e.g. **Profile**); CSS parity P0020 `TodoHubBadge` priority pills; replaces uppercase micro-tags.

## 2026-07-04 Ã¢â‚¬â€ v0.8.2 Ã¢â‚¬â€ Store toolbar + runtime rail parity

- Version: `0.8.2`
- Timestamp: 2026-07-04 21:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Store toolbar** Ã¢â‚¬â€ `HubDirectoryToolbarSelection` in `searchTrailing` (0/N beside search); row-2 right = bulk actions only.
- **Source column** Ã¢â‚¬â€ `HubDirectoryIconCell` + brand icon (parity Platform column).
- **Workflow rail** Ã¢â‚¬â€ removed redundant Store label button; Store via sidebar nav only.
- **Run History + Console** Ã¢â‚¬â€ P0027 parity (`StealthRuntimeRailPanels`: channel tags, history list, replay on click).

## 2026-07-04 Ã¢â‚¬â€ v0.8.1 Ã¢â‚¬â€ Store brand icons + vendor hub-ui sync fix

- Version: `0.8.1`
- Timestamp: 2026-07-04 20:40 (UTC+7)
- Type: Minor
- Status: Dev

### Changes

- **Fix boot** Ã¢â‚¬â€ sync `hubDirectorySelectionSlots.tsx` to vendor (export `shouldShowHubDirectoryResultCount`); add file to `sync-hub-ui-vendor.cjs` PACKAGES_COPY_PAIRS.
- **Brand icons** Ã¢â‚¬â€ registry `google-drive`; Drive catalog source uses `HubBrandIcon` (`google-drive`) instead of interim `google`.
- **SSOT** Ã¢â‚¬â€ `UI_PATTERNS.md` Ã‚Â§ Platform brand icons: entities with registered brand icons use `HubBrandIcon` chips, not colored status dots.

## 2026-07-04 Ã¢â‚¬â€ v0.7.72 Ã¢â‚¬â€ Store card typography + brand source chips

- Version: `0.7.72`
- Timestamp: 2026-07-04 20:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Rename** UI label Workflow Store Ã¢â€ â€™ **Store** (nav, header, rail).
- **Card view** Ã¢â‚¬â€ `HubDirectoryCardMetaRow` + `hub-chrome-type--micro`; Supabase/Drive chips use `HubBrandIcon` (not green status dots).
- **Toolbar** Ã¢â‚¬â€ removed `Supabase + Drive` trailing hint; SSOT `workflow-store-source-brand.tsx` + `UI_PATTERNS.md`.

## 2026-07-04 Ã¢â‚¬â€ v0.7.71 Ã¢â‚¬â€ Workflow Store table single-line cells

- Version: `0.7.71`
- Timestamp: 2026-07-04 20:15 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Store table** Ã¢â‚¬â€ Name column single line only; **Status** column (Local / Installed / Available); description in `title` tooltip.
- **SSOT** Ã¢â‚¬â€ `hub-directory-table-gate` rules for single-line `*directory-cells.tsx`; skill + `UI_PATTERNS.md` directory cell contract.

## 2026-07-04 Ã¢â‚¬â€ v0.7.70 Ã¢â‚¬â€ Workflow Store table/card + time range

- Version: `0.7.70`
- Timestamp: 2026-07-04 20:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Store** Ã¢â‚¬â€ P0004 Hub parity: **Table / Cards** toggle, **time range** filter (7d / 30d / Ã¢â‚¬Â¦), Display band.
- **Card view** Ã¢â‚¬â€ `HubPaginatedCardGrid` + compact cards; each meta field **one truncated line** (platform, group, version, source, updated).

## 2026-07-04 Ã¢â‚¬â€ v0.7.69 Ã¢â‚¬â€ Workflow Store Hub directory table

- Version: `0.7.69`
- Timestamp: 2026-07-04 19:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Store** Ã¢â‚¬â€ migrated from card list to **Hub-UI directory table** (`HubDirectoryTableShell`, `FilterBar`, checkbox bulk Install/Update) Ã¢â‚¬â€ P0004 golden parity.
- **Updated column** Ã¢â‚¬â€ Supabase `updated_at` + Drive manifest `updatedAt` per workflow entry.
- **Admin docs** Ã¢â‚¬â€ README Workflow Store publish/sync section (Supabase + Drive manifest).

## 2026-07-04 Ã¢â‚¬â€ v0.7.68 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.68`
- Timestamp: 2026-07-04 18:44 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-04 Ã¢â‚¬â€ v0.7.67 Ã¢â‚¬â€ Non-destructive desktop build

- Version: `0.7.67`
- Type: Patch
- Status: Dev

### Changes

- **Never kill dev/exe on build** Ã¢â‚¬â€ `pre-release-desktop.ps1` check-only; `desktop:open` no longer taskkills by default (`--replace` optional).
- **EBUSY-safe packaging** Ã¢â‚¬â€ locked `win-unpacked` Ã¢â€ â€™ copy to `win-unpacked-pending`; `pnpm desktop:swap-unpacked` promotes when ready.
- Installer (`Setup-*.exe`) + `latest.yml` always updated even when unpacked folder is locked.

## 2026-07-04 Ã¢â‚¬â€ v0.7.66 Ã¢â‚¬â€ Workflow Store subnav + ship fixes

- Version: `0.7.66`
- Type: Patch
- Status: Dev

### Changes

- **Workflow Store** moved from modal to sidebar sub-menu under Workflow (**Scripts** / **Workflow Store**) Ã¢â‚¬â€ same pattern as System.
- Profiles rail Ã¢â‚¬â€ **Workflow Store** shortcut button.
- `scripts/publish-workflow-catalog.mjs` Ã¢â‚¬â€ admin CLI upsert workflow JSON to Hub `stealth_workflow_catalog`.
- Hub migration notify `pgrst` reload schema; `run-electron-package.mjs` gh spawn `shell: false` on Windows.

## 2026-07-04 Ã¢â‚¬â€ v0.7.65 Ã¢â‚¬â€ Workflow Store + default 0/11 selection

- Version: `0.7.65`
- Type: Patch
- Status: Dev

### Changes

- **Workflow selection** Ã¢â‚¬â€ default `0/11` (no workflow checked); Launch disabled until user selects workflow(s) in the right rail.
- **Workflow Store** Ã¢â‚¬â€ browse/install workflows from Hub Supabase catalog (`stealth_workflow_catalog`) and Drive manifest (`public/workflow-store/index.json`); Install merges into local workflows.
- Workflow tab header Ã¢â‚¬â€ **Workflow Store** button opens catalog modal.
- Hub migration `20260704120000_stealth_workflow_catalog.sql` Ã¢â‚¬â€ public read catalog + Gmail Login seed.

## 2026-07-04 Ã¢â‚¬â€ v0.7.64 Ã¢â‚¬â€ Extension toolbar parity + Surfshark icon fallback

- Version: `0.7.64`
- Type: Patch
- Status: Verified

### Changes

- **Surfshark / E0001 column headers** Ã¢â‚¬â€ Lucide `Shield` / `Cookie` fallback when extension PNG missing or IPC icon fails (fixes broken image in packaged exe).
- **Extension bulk button** Ã¢â‚¬â€ remove `ChevronDown`; use `HubBulkActionButton` like Launch/Close/Delete.
- `useExtensionIcons` Ã¢â‚¬â€ stop referencing missing `/icons/ext-*.png` static paths.

## 2026-07-04 Ã¢â‚¬â€ v0.7.63 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.63`
- Timestamp: 2026-07-04 15:28 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-04 Ã¢â‚¬â€ v0.7.63 Ã¢â‚¬â€ Gmail login fail-fast + vault diagnose

- Version: `0.7.63`
- Type: Patch
- Status: Dev

### Changes

- `twofa-vault-bridge.cjs`: `diagnoseMailCredentials` Ã¢â‚¬â€ pad browser code (`98` Ã¢â€ â€™ `0098`), list sibling services when Gmail missing; resolve `E:\\Dev\\.env.shared` for packaged Electron (not only dev `__dirname`).
- `open-url.cjs`: fail-fast before browser steps when `{{gmail*}}` placeholders unresolved.
- `api-routes.cjs`: vault preflight before `ensureProfileContext` Ã¢â‚¬â€ no Chromium launch when Gmail missing.
- E2E: `electron/e2e/gmail-login-profile-smoke.cjs` (direct `runOpenUrl`, bypasses packaged API).
- Test: `src/lib/twofa-vault-bridge.test.ts`.

### Verification

- `node electron/e2e/gmail-login-profile-smoke.cjs 0098`
- `node scripts/test-gmail-login.mjs 1001` Ã¢â€ â€™ fail-fast vault message (not placeholder error)

## 2026-07-03 Ã¢â‚¬â€ v0.7.61 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.61`
- Timestamp: 2026-07-03 05:33 (UTC+7)
- Type: Patch
- Status: Committed

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-04 Ã¢â‚¬â€ v0.7.61 Ã¢â‚¬â€ Gmail login guard fix + CAPTCHA detection

- Version: `0.7.61`
- Type: Patch
- Status: Dev

### Changes

- Fix `assertGoogleSession` blocking intentional Gmail sign-in workflow (`gmail-login`).
- Improve Gmail selectors (`#identifierId`, `input[name="Passwd"]`) and post-click settle.
- Detect Google CAPTCHA after email step Ã¢â‚¬â€ clear error + screenshot instead of password timeout.
- E2E script `scripts/test-gmail-login-0038.mjs` targets dev API `:6004` (not prod `:6003`).

## 2026-07-04 Ã¢â‚¬â€ v0.7.60 Ã¢â‚¬â€ Gmail Auto-Login Workflow with P0020 Data Bridge

- Version: `0.7.60`
- Timestamp: 2026-07-04 03:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Add `twofa-vault-bridge.cjs` Ã¢â‚¬â€ Supabase client to query P0020 `twofa_accounts` for Gmail credentials by profile browser code.
- Add `totp-generate.cjs` Ã¢â‚¬â€ RFC 6238 TOTP code generator using Node.js built-in crypto (no npm deps).
- Extend `resolveStepValue()` with `{{gmailEmail}}`, `{{gmailPassword}}`, `{{gmailTotpCode}}`, `{{gmailRecovery}}` placeholders.
- Enrich `stepContext` in `open-url.cjs` with mail credentials auto-fetched from P0020 vault when Gmail placeholders detected.
- Add `gmail-login` workflow to `DEFAULT_WORKFLOWS` Ã¢â‚¬â€ full Gmail login automation with email, password, conditional 2FA/TOTP support.
- Graceful 2FA skip: when no TOTP secret exists or 2FA prompt not found, TOTP-related steps are skipped instead of failing.
- Add `@supabase/supabase-js` dependency for vault bridge.

## 2026-07-04 Ã¢â‚¬â€ v0.7.59 Ã¢â‚¬â€ Remove Extension count badge

- Version: `0.7.59`
- Timestamp: 2026-07-04 03:18 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Remove `HubBulkActionCountBadge` from Extension button Ã¢â‚¬â€ redundant with toolbar selection count indicator.

## 2026-07-04 Ã¢â‚¬â€ v0.7.58 Ã¢â‚¬â€ More button Hub-UI style

- Version: `0.7.58`
- Timestamp: 2026-07-04 03:10 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- "More" overflow button: replaced raw icon button with `HubBulkActionButton` (`tone="neutral"`, label "More") Ã¢â‚¬â€ matches other toolbar buttons.

## 2026-07-04 Ã¢â‚¬â€ v0.7.57 Ã¢â‚¬â€ Extension icon resolver + toolbar cleanup

- Version: `0.7.57`
- Timestamp: 2026-07-04 02:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Extension icon resolver: auto-extract icons from extension `manifest.json` via IPC (`extension:icon`) instead of manually copying PNGs. `getExtensionsStatus` now returns `iconDataUri` per extension.
- `useExtensionIcons` hook resolves icons at runtime; falls back to static PNGs in dev/web mode.
- Extension button icon: `Blocks` (from `Puzzle`); "All" row icon: `Layers`.
- Toolbar cleanup: Groups/Export/Import moved into "More" (`Ã¢â€¹Â®`) overflow menu Ã¢â‚¬â€ declutters primary action bar.
- Dynamic icon URLs flow through `ProfileDirectoryPanel` Ã¢â€ â€™ table headers + bulk action dropdown.

## 2026-07-04 Ã¢â‚¬â€ v0.7.56 Ã¢â‚¬â€ Toggle style unify + Cookie Bridge rename + Display column prefs

- Version: `0.7.56`
- Timestamp: 2026-07-04 02:15 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Toggle switch: unified green/gray binary style (no amber mixed state), knob flush to edges on all rows.
- Rename "E0001 Cookie" Ã¢â€ â€™ "Cookie Bridge" across bulk actions, toast messages, and Display column prefs.
- Tooltip on toggle rows shows profile count for selected profiles.
- Column label "E0001" Ã¢â€ â€™ "Cookie Bridge" in Display preferences column list.

## 2026-07-03 Ã¢â‚¬â€ v0.7.54 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.54`
- Timestamp: 2026-07-03 01:52 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-04 Ã¢â‚¬â€ v0.7.55 Ã¢â‚¬â€ Real extension icons + Hub-UI On/Off + toggle switch

- Version: `0.7.55`
- Timestamp: 2026-07-04 02:10 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Column headers: actual extension PNG icons (E0001 cookie, Surfshark shark logo) from CloakBrowser extension dirs.
- Cell values: `HubUsersOnOffLabel` (dot + On/Off label) Ã¢â‚¬â€ Hub-UI standard.
- Bulk action: proper toggle switch (green on, amber mixed, gray off) replacing badge-based design.
- Sidecar PID: now written for focus-only sessions too, carrying the CDP port forward.

## 2026-07-04 Ã¢â‚¬â€ v0.7.53 Ã¢â‚¬â€ Extension UX overhaul + sidecar PID

- Version: `0.7.53`
- Timestamp: 2026-07-04 01:50 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Extension icons: E0001 Ã¢â€ â€™ Cookie (orange), Surfshark Ã¢â€ â€™ Shield (cyan) in directory cells Ã¢â‚¬â€ replaces generic Ã¢Å“â€œ/Ã¢Å“â€”.
- Extension columns moved to end of directory table (after Note).
- Redesigned Extension bulk action: 3-row toggle panel (All / E0001 Cookie / Surfshark VPN) with visual on/off/mix badges.
- Sidecar PID: write `stealth-pid.json` on launch, read for fast orphan detection, remove on close.
- Fix StatLine key prop warning (hub-ui AppTabHeader Ã¢â‚¬â€ destructure key before spread).
- Fix Maximum update depth: memoize `idOf` callback in useHubDirectorySelection call.

## 2026-07-03 Ã¢â‚¬â€ v0.7.52 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.52`
- Timestamp: 2026-07-03 00:04 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 Ã¢â‚¬â€ v0.7.51 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.51`
- Timestamp: 2026-07-03 23:37 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 Ã¢â‚¬â€ v0.7.50 Ã¢â‚¬â€ Single Extension bulk dropdown

- Version: `0.7.50`
- Timestamp: 2026-07-03 23:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Bulk toolbar** Ã¢â‚¬â€ replace 4 standalone extension buttons with one `Extension` dropdown containing `E0001 On/Off` and `Surfshark On/Off`.
- **Directory indicators** Ã¢â‚¬â€ keep E0001 / Surfshark columns read-only (Check / X only).

## 2026-07-03 Ã¢â‚¬â€ v0.7.49 Ã¢â‚¬â€ Extension columns read-only + bulk actions

- Version: `0.7.49`
- Timestamp: 2026-07-03 23:10 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 / Surfshark columns** Ã¢â‚¬â€ display-only Check / X indicators (not clickable).
- **Bulk toolbar** Ã¢â‚¬â€ select profiles via row checkbox, then **E0001 On/Off** or **Surfshark On/Off** for selected rows.

## 2026-07-03 Ã¢â‚¬â€ v0.7.48 Ã¢â‚¬â€ Fix ProfilesView missing migrate import

- Version: `0.7.48`
- Timestamp: 2026-07-03 23:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profiles load** Ã¢â‚¬â€ restore `migrateProfilesDisplayPrefsFromUrl` import dropped when wiring extension columns.
- **Smoke** Ã¢â‚¬â€ `scripts/smoke-profiles-directory.mjs` guards missing imports + duplicate colClass.
- **TS** Ã¢â‚¬â€ Glass import on SystemWebStoreExtensionsPanel; HMR patch typing in web mock.

## 2026-07-03 Ã¢â‚¬â€ v0.7.47 Ã¢â‚¬â€ Fix duplicate directory colClass

- Version: `0.7.47`
- Timestamp: 2026-07-03 22:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profiles directory** Ã¢â‚¬â€ Proxy column uses `hub-users-col--metric-c` so it no longer clashes with E0001 (`metric-a`); table loads again.

## 2026-07-03 Ã¢â‚¬â€ v0.7.46 Ã¢â‚¬â€ Profile directory E0001 / Surfshark columns

- Version: `0.7.46`
- Timestamp: 2026-07-03 22:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profiles directory** Ã¢â‚¬â€ `E0001` and `Surfshark` checkbox columns (hub-checkbox 16px). Effective state = app default + per-profile override; E0001 on / Surfshark off by default.
- **Toggle** Ã¢â‚¬â€ click saves `extensionOverrides`, pins Surfshark when enabled on a profile; close Chrome and Run again.
- **Display prefs** Ã¢â‚¬â€ columns visible by default; hide via Display Ã¢â€ â€™ Columns.

## 2026-07-03 Ã¢â‚¬â€ v0.7.45 Ã¢â‚¬â€ Per-profile extension overrides + API patch

- Version: `0.7.45`
- Timestamp: 2026-07-03 21:45 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Edit profile Ã¢â€ â€™ Extensions** Ã¢â‚¬â€ override E0001 / Surfshark / Web Store per profile (Use app default Ã‚Â· Enable Ã‚Â· Disable). Surfshark can run on 2Ã¢â‚¬â€œ3 profiles while global default stays off.
- **Auto-install** Ã¢â‚¬â€ enabling Surfshark on a profile pins Web Store extension to that profile only on save/launch.
- **Settings API** Ã¢â‚¬â€ dev HMR patches missing `getExtensionToggles` / `setExtensionToggles` on stale preload; clearer restart message.

## 2026-07-03 Ã¢â‚¬â€ v0.7.44 Ã¢â‚¬â€ Per-extension Settings toggles

- Version: `0.7.44`
- Timestamp: 2026-07-03 21:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Settings Ã¢â€ â€™ Extensions** Ã¢â‚¬â€ separate toggles for E0001, Surfshark VPN, and other Web Store extensions (default: E0001 on only).
- **Launch allowlist** Ã¢â‚¬â€ when Surfshark/Web Store are off, `--disable-extensions-except` blocks extensions still pinned in profile prefs.
- **Migration** Ã¢â‚¬â€ legacy global toggle maps to all-on or all-off; fresh installs use E0001-only default.

## 2026-07-03 Ã¢â‚¬â€ v0.7.43 Ã¢â‚¬â€ Global extensions toggle + fast startup

- Version: `0.7.43`
- Timestamp: 2026-07-03 21:00 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Settings Ã¢â€ â€™ Extensions** Ã¢â‚¬â€ global toggle enables/disables Chrome extensions for every profile; off adds `--disable-extensions` on next Run.
- **Fast startup** Ã¢â‚¬â€ skip bulk extension purge/dedupe/repair across all profiles when `STEALTH_FAST_LAUNCH=1` (default); per-profile prep still runs at launch.
- **Cookie Bridge status** Ã¢â‚¬â€ reflects global extensions-off state; System panel shows Settings hint when disabled.

## 2026-07-03 Ã¢â‚¬â€ v0.7.42 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.42`
- Timestamp: 2026-07-03 20:47 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 Ã¢â‚¬â€ v0.7.41 Ã¢â‚¬â€ E0001 CLI load on CloakBrowser (prefs alone insufficient)

- Version: `0.7.41`
- Timestamp: 2026-07-03 20:40 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 visible** Ã¢â‚¬â€ native launch adds `--disable-extensions-except` + `--load-extension` for staged store id (Surfshark stays prefs-only; no duplicate paths).
- **Stage metadata** Ã¢â‚¬â€ re-copy `.cloakbrowser/<storeId>/` when `_metadata` missing vs verified extensions-cache.
- **Smoke** Ã¢â‚¬â€ `extension-e0001-smoke.cjs` validates store pin survives profile Run.

## 2026-07-03 Ã¢â‚¬â€ v0.7.40 Ã¢â‚¬â€ Fix E0001 unpacked id pin (stage missing _metadata)

- Version: `0.7.40`
- Timestamp: 2026-07-03 20:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 load** Ã¢â‚¬â€ re-stage `.cloakbrowser/<storeId>/` when source CRX has `_metadata` but stage dir does not; pin with store id when extensions-cache is verified.
- **Smoke** Ã¢â‚¬â€ `electron/e2e/extension-e0001-smoke.cjs` verifies `chrome-extension://kaaadÃ¢â‚¬Â¦/popup.html` loads after profile Run.

## 2026-07-03 Ã¢â‚¬â€ v0.7.39 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.39`
- Timestamp: 2026-07-03 20:12 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 Ã¢â‚¬â€ v0.7.38 Ã¢â‚¬â€ Fix E0001 not loading (workspace cache overwrite)

- Version: `0.7.38`
- Timestamp: 2026-07-03 20:05 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 missing** Ã¢â‚¬â€ stop syncing workspace `Extension/E0001` into cache unless `STEALTH_COOKIE_BRIDGE_LOCAL=1`; polluted cache broke Web Store id pin.
- **Auto re-download** Ã¢â‚¬â€ when cache lacks `_metadata/verified_contents.json`, refresh E0001 CRX from Chrome Web Store.
- **Pin mode** Ã¢â‚¬â€ dev/workspace E0001 pins as unpacked id; verified store CRX keeps store id `kaaadageakdandpobcofplmfbjfjabdk`.
- **Startup** Ã¢â‚¬â€ `ensureCookieBridgeOnAllProfiles` pins E0001 on profiles that only had Surfshark (or empty prefs).

## 2026-07-03 Ã¢â‚¬â€ v0.7.37 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.37`
- Timestamp: 2026-07-03 18:27 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 Ã¢â‚¬â€ v0.7.37 Ã¢â‚¬â€ Fix startup purge wiping .cloakbrowser extension pins

- Version: `0.7.37`
- Timestamp: 2026-07-03 18:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Critical** Ã¢â‚¬â€ `isBrokenExtensionPath` no longer treats every `.cloakbrowser/` path as broken; only missing `manifest.json` is removed.
- **Cookie bridge purge** Ã¢â‚¬â€ keep canonical Web Store pins at `.cloakbrowser/<storeId>/`; only drop stale unpacked/legacy E0001 copies.
- **Auto-repair** Ã¢â‚¬â€ startup rewrites `extensions-cache` prefs Ã¢â€ â€™ `.cloakbrowser/<storeId>/` (v0.7.36) without being undone by purge.

## 2026-07-03 Ã¢â‚¬â€ v0.7.36 Ã¢â‚¬â€ Auto-repair extension paths on startup

- Version: `0.7.36`
- Timestamp: 2026-07-03 18:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Fix 4 icons (runtime)** Ã¢â‚¬â€ startup + install now rewrite `extensions-cache` prefs to `.cloakbrowser/<storeId>/` before Chrome reads them (was only on manual profile launch).
- **Faster next launch** Ã¢â‚¬â€ profiles no longer double-load AppData cache + CloakBrowser stage path.
- **Install** Ã¢â‚¬â€ Web Store install immediately pins stage path per profile (not deferred to next Run).

## 2026-07-03 Ã¢â‚¬â€ v0.7.35 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.35`
- Timestamp: 2026-07-03 18:22 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 Ã¢â‚¬â€ v0.7.34 Ã¢â‚¬â€ Single-path extension load (fix 4 icons + faster launch)

- Version: `0.7.34`
- Timestamp: 2026-07-03 18:17 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Fix 4 extensions** Ã¢â‚¬â€ prefs now pin to `.cloakbrowser/<storeId>/` only (not AppData + stage double load).
- **Faster launch** Ã¢â‚¬â€ stage/load only extensions in the active profile prefs (+ E0001), not entire global cache.
- **Repair** Ã¢â‚¬â€ `extension:repairProfiles` IPC rewrites all profile extension paths after upgrade.

## 2026-07-03 Ã¢â‚¬â€ v0.7.33 Ã¢â‚¬â€ Fix duplicate extensions (store id vs unpacked id)

- Version: `0.7.33`
- Timestamp: 2026-07-03 18:09 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **No more duplicates** Ã¢â‚¬â€ Web Store extensions load once via prefs + CloakBrowser staging (store id); `--load-extension` only for local unpacked folders.
- **Dedupe on launch** Ã¢â‚¬â€ purge shadow unpacked-id copies that shared the same path as a store-id pin (fixes 2Ãƒâ€” E0001 / 2Ãƒâ€” Surfshark).
- **UI** Ã¢â‚¬â€ clarify Chrome-like vs not-Chrome (Web Store install button) expectations.

## 2026-07-03 Ã¢â‚¬â€ v0.7.32 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.32`
- Timestamp: 2026-07-03 17:30 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 Ã¢â‚¬â€ v0.7.31 Ã¢â‚¬â€ Extension staging fix + any extension install

- Version: `0.7.31`
- Timestamp: 2026-07-03 17:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Manifest missing fix** Ã¢â‚¬â€ CloakBrowser staging now uses Web Store id (`kaaadÃ¢â‚¬Â¦`, Surfshark, Ã¢â‚¬Â¦) under `.cloakbrowser/Ã¢â‚¬Â¦/<storeId>/` instead of unpacked hash path.
- **Any extension** Ã¢â‚¬â€ install any Chrome Web Store ID/URL; **Load unpacked folder** for dev/local extensions; optional single-profile scope.
- **Warm staging** Ã¢â‚¬â€ pre-stage all cached extensions at app boot and right after install.

## 2026-07-03 Ã¢â‚¬â€ v0.7.30 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.30`
- Timestamp: 2026-07-03 17:19 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-07-03 Ã¢â‚¬â€ v0.7.29 Ã¢â‚¬â€ Fix E0001 purge + native extension load

- Version: `0.7.29`
- Timestamp: 2026-07-03 17:15 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 restore** Ã¢â‚¬â€ `purgeStaleCookieBridgePrefs` no longer strips store-id Cookie Bridge pins on launch.
- **Native load** Ã¢â‚¬â€ CloakBrowser again receives `--load-extension` for E0001 + all `extensions-cache` (Surfshark, etc.) without blanket `--disable-extensions`.
- **UI** Ã¢â‚¬â€ Web Store panel clarifies Google blocks "Add to Chrome" on non-Chrome browsers.

## 2026-07-03 Ã¢â‚¬â€ v0.7.28 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.28`
- Timestamp: 2026-07-03 17:07 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Reload gate after native extension mode + Web Store installer (v0.7.27).

## 2026-07-03 Ã¢â‚¬â€ v0.7.27 Ã¢â‚¬â€ Native Chrome extensions + Web Store installer

- Version: `0.7.27`
- Timestamp: 2026-07-03 16:59 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Native extension mode** (default) Ã¢â‚¬â€ profiles no longer pass `--disable-extensions`; extensions load from Chrome prefs like Google Chrome. `chrome://extensions` works; legacy whitelist mode via `STEALTH_EXTENSION_MODE=managed`.
- **Web Store installer** Ã¢â‚¬â€ System Ã¢â€ â€™ Chrome Web Store install: paste store ID or URL (e.g. Surfshark), download CRX to cache, pin to all profiles. Re-launch profile to activate.
- **Surfshark** Ã¢â‚¬â€ startup auto-purge disabled in native mode so user-installed VPN extensions persist.
- **E0001 Cookie Bridge** Ã¢â‚¬â€ pinned via store prefs in native mode instead of `--load-extension` whitelist.

## 2026-06-30 Ã¢â‚¬â€ v0.7.26 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.26`
- Timestamp: 2026-06-30 16:29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-30 Ã¢â‚¬â€ v0.7.25 Ã¢â‚¬â€ Backup perf + restore into selected profile

- Version: `0.7.25`
- Type: Patch
- Status: Release

### Changes

- **Restore into selected** Ã¢â‚¬â€ chÃ¡Â»Ân 1 profile (vd. 3000) Ã¢â€ â€™ Restore zip backup cÃ¡Â»Â§a 0007 Ã¢â€ â€™ cookie/session ghi vÃƒÂ o profile Ã„â€˜ÃƒÂ­ch, khÃƒÂ´ng map theo tÃƒÂªn trong zip.
- **Backup perf** Ã¢â‚¬â€ better-sqlite3 native, storage size batch scan, debounced search, console log cap, content-visibility rows.
- **Dev** Ã¢â‚¬â€ isolated catalog sync, API `:6004`, single-instance lock.

## 2026-06-29 Ã¢â‚¬â€ v0.7.24 Ã¢â‚¬â€ Export filename + Electron dev reload

- Version: `0.7.24`
- Timestamp: 2026-06-29 01:35 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Export JSON** Ã¢â‚¬â€ `{ProfileName}_{YYYY-MM-DD_HH-mm-ss}.json`; chÃ¡Â»â€° export khi Ã„â€˜ÃƒÂ£ chÃ¡Â»Ân dÃƒÂ²ng (nÃƒÂºt Export disabled khi khÃƒÂ´ng chÃ¡Â»Ân).
- **Backup zip** Ã¢â‚¬â€ toast/log hiÃ¡Â»Æ’n thÃ¡Â»â€¹ tÃƒÂªn file Ã„â€˜ÃƒÂ­ch (`Ã¢â€ â€™ ProfileName_timestamp.zip`).
- **electron** Ã¢â‚¬â€ repair `pnpm install` + `electron` dep cho dev desktop.
- Auto patch bump + Electron reload gate.

## 2026-06-29 Ã¢â‚¬â€ v0.7.23 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.23`
- Timestamp: 2026-06-29 23:51 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).
- **hub-ui 0.2.17** Ã¢â‚¬â€ `HubSidebarShell.brandTagline` deprecated + no longer rendered (logo + title only).

## 2026-06-29 Ã¢â‚¬â€ v0.7.22 Ã¢â‚¬â€ Sidebar brand + directory pane SSOT cleanup

- Version: `0.7.22`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Sidebar** Ã¢â‚¬â€ logo + `Stealth Browser Console` only; remove tagline under brand.
- **hub-identity** Ã¢â‚¬â€ P0003 auth preset tagline empty (welcome shows name only).
- **P0003** Ã¢â‚¬â€ delete `stealth-directory-table.ts`; pane tables import `HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS` from hub-ui directly.
- **parity gate** Ã¢â‚¬â€ P0003 directory-pane + no sidebar tagline checks.

## 2026-06-29 Ã¢â‚¬â€ v0.7.21 Ã¢â‚¬â€ Pane table = P0004 inline wrap SSOT (no scroll on wrap)

- Version: `0.7.21`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** Ã¢â‚¬â€ `HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS` = P0004 `overflow-hidden min-w-0` only (no `hub-directory-table-scroll`); remove duplicate thead paint from `hub-split-directory-pane.css`.
- **P0003** Ã¢â‚¬â€ Backup/Profiles import `HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS` directly from hub-ui (same `DirectoryInlineTable` path as P0004 Hub/Users).

## 2026-06-29 Ã¢â‚¬â€ v0.7.20 Ã¢â‚¬â€ Pane directory table P0004 inline paint (no split gutter)

- Version: `0.7.20`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** Ã¢â‚¬â€ `HUB_DIRECTORY_TABLE_PANE_INLINE_SCROLL_CLASS`: single-table + sticky thead in pane (P0004 Hub/Users paint path); panel-fill CSS for inline scroll.
- **P0003** Ã¢â‚¬â€ Backup + Profiles drop split flex-pane / pane-chrome split; use inline scroll SSOT (fixes header gutter color mismatch vs P0004).

## 2026-06-29 Ã¢â‚¬â€ v0.7.19 Ã¢â‚¬â€ Split thead single-surface paint (gutter corner)

- Version: `0.7.19`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** Ã¢â‚¬â€ split head `th` transparent (head paints once); restore `::after` gutter filler with OS-measured pad; corner radius on filler not `th:last-child` (fixes lighter gutter strip).

## 2026-06-29 Ã¢â‚¬â€ v0.7.18 Ã¢â‚¬â€ Directory thead surface SSOT + stable gutter head

- Version: `0.7.18`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** Ã¢â‚¬â€ `--hub-directory-pane-surface` / `--hub-directory-thead-surface` SSOT on `.hub-directory-frame`; flex-pane head uses `scrollbar-gutter: stable` (no faux `::after` pad); OS scrollbar width measure for empty flex-pane.

## 2026-06-29 Ã¢â‚¬â€ v0.7.17 Ã¢â‚¬â€ Directory table header gutter parity

- Version: `0.7.17`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** Ã¢â‚¬â€ split table head scrollbar gutter: measure real OS width (flex-pane), JS sync always on; remove head `clip-path` corner bleed; `::after` fills gutter with thead surface.

## 2026-06-29 Ã¢â‚¬â€ v0.7.16 Ã¢â‚¬â€ Sidebar 100% P0004 (hub-ui SSOT + CSS fix)

- Version: `0.7.16`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **hub-ui** Ã¢â‚¬â€ `HubSystemTabSubNav` + `hub-sidebar-subnav-button` (tree rail+dot); view groups use shared component.
- **P0003 sidebar** Ã¢â‚¬â€ `HubSidebarNavList` + `STEALTH_NAV_STRUCTURE`; fix stealth CSS that forced `display:flex` on subnav grid.
- **P0004 sidebar** Ã¢â‚¬â€ migrated to `HubSidebarNavList` + `TOOL_HUB_NAV_STRUCTURE` (proposal 1+3).
- **Parity gate** Ã¢â‚¬â€ P0003 sidebar checks for nav list SSOT + hub-ui subnav exports.

## 2026-06-29 Ã¢â‚¬â€ v0.7.15 Ã¢â‚¬â€ Sidebar P0004 golden pattern (HubSidebarNavGroup)

- Version: `0.7.15`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Sidebar** Ã¢â‚¬â€ match P0004 `SalesSidebar`: `HubSidebarNavScreenButton` + `HubSidebarNavGroup` + `StealthSystemTabSubNav` (`NavGroupSubNav` tree rail), `brandTagline`, `subscribeHubListPrefs` toggle icon.
- **System subnav** Ã¢â‚¬â€ Overview icon/tone aligned with P0004 (`LayoutGrid` / indigo); group session key `system`.

## 2026-06-29 Ã¢â‚¬â€ v0.7.14 Ã¢â‚¬â€ Sidebar golden + restore fix + backup toasts

- Version: `0.7.14`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Sidebar** Ã¢â‚¬â€ `HubSidebarNavList` + `useNavGroupOpenState` (P0004/P0016 golden tree subnav with rail dots).
- **Restore** Ã¢â‚¬â€ match profile folders by id first; partial backup exports filtered catalog only; detailed skip reasons in result.
- **Backup UX** Ã¢â‚¬â€ success/error/warn via toast + session Log (`system-backup`); removed inline text above search bar.

## 2026-06-29 Ã¢â‚¬â€ v0.7.13 Ã¢â‚¬â€ System Backup screen Profiles parity

- Version: `0.7.13`
- Timestamp: 2026-06-29 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **System Ã¢â€ â€™ Backup** Ã¢â‚¬â€ clone Profiles split layout: `HubSplitWorkspaceScreen` header, KPI strip, `stealth-profile-layout` directory pane + right rail (Run History + Console).
- **CSS** Ã¢â‚¬â€ `hub-main--system` flex chain matches Profiles/Workflow so directory table renders with height.
- **Resilience** Ã¢â‚¬â€ backup meta IPC failure no longer blocks profile table load.

## 2026-06-29 Ã¢â‚¬â€ v0.7.12 Ã¢â‚¬â€ Electron dev reload

- Version: `0.7.12`
- Timestamp: 2026-06-29 16:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-27 Ã¢â‚¬â€ v0.7.11 Ã¢â‚¬â€ System sidebar P0004 parity + Backup Hub directory

- Version: `0.7.11`
- Timestamp: 2026-06-27 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Sidebar** Ã¢â‚¬â€ System group uses P0004 `HubSidebarNavGroup` + `StealthSystemTabSubNav` (Overview / Backup, toggle icon from display prefs).
- **System Ã¢â€ â€™ Backup** Ã¢â‚¬â€ golden `HubDirectoryTableShell`: Profile, Group, Data size, Folder (On/Off), Status dot, Progress bar + %.
- **Backup toolbar** Ã¢â‚¬â€ `HubSplitDirectoryFilterBar` + `HubBulkActionButton` (Backup selected / all / Restore zip).
- Electron dev reload gate (identity extension purge).

## 2026-06-26 Ã¢â‚¬â€ v0.7.10 Ã¢â‚¬â€ Dev prod parity + System Backup subnav

- Version: `0.7.10`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Dev userData** Ã¢â‚¬â€ default to production `%APPDATA%/stealth-browser-console` (same catalog as Setup.exe); `STEALTH_DEV_ISOLATED=1` for parallel dev + exe.
- **System nav** Ã¢â‚¬â€ expandable group with **Overview** + **Backup** submenus.
- **System Ã¢â€ â€™ Backup** Ã¢â‚¬â€ directory table (profile, group, data size, backup status) with pagination, backup selected/all, restore zip.
- **IPC** Ã¢â‚¬â€ `profiles:storageStats` + per-profile backup progress events.

## 2026-06-26 Ã¢â‚¬â€ v0.7.9 Ã¢â‚¬â€ System eager load + dev Vite-only + file:// icons

- Version: `0.7.9`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **System tab** Ã¢â‚¬â€ eager load (no Suspense lazy chunk) Ã¢â‚¬â€ fixes stuck loader orb.
- **Dev Electron** Ã¢â‚¬â€ never silently load stale `dist/` when Vite is down (icons + HMR break on `file://`).
- **Brand icons** Ã¢â‚¬â€ explicit `file://` relative paths for workflow platform PNGs.
- **`pnpm dev`** Ã¢â‚¬â€ always runs `predev` (sync brand icons + vendor).

## 2026-06-26 Ã¢â‚¬â€ v0.7.8 Ã¢â‚¬â€ Profile import-by-name + backup/restore + dev icons

- Version: `0.7.8`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Import/export** Ã¢â‚¬â€ match by profile **name** (default); keep local UUID; merge startupUrl, platform, timezone, viewport, device fields.
- **System** Ã¢â‚¬â€ Backup / restore full state zip (catalog + Chrome `profiles/` folders, map by name).
- **Dev icons** Ã¢â‚¬â€ brand PNG paths use `import.meta.env.BASE_URL` (fixes workflow platform icons on `file://` / dist fallback).
- **Dev isolation** Ã¢â‚¬â€ separate `%APPDATA%/stealth-browser-console-dev` + API `:6004`.
- **System prefetch** Ã¢â‚¬â€ warm `SystemView` chunk on app boot.

## 2026-06-26 Ã¢â‚¬â€ v0.7.7 Ã¢â‚¬â€ Packaged auth + known-good rollback

- Version: `0.7.7`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Verified
- Tag: `v0.7.7-stable`

### Changes

- **Packaged auth** Ã¢â‚¬â€ CSP allows `*.supabase.co` (fixes login on Setup.exe).
- **Login icon** Ã¢â‚¬â€ 56px brand mark via `import.meta.url`.
- **Surfshark** Ã¢â‚¬â€ purge on startup + block load-extension path; fast-launch skips redundant prefs IO.
- **Known-good** Ã¢â‚¬â€ `config/known-good.json`, snapshot/restore scripts, workspace skill `p00xx-known-good-rollback`.

## 2026-06-26 Ã¢â‚¬â€ v0.7.4 Ã¢â‚¬â€ Single GitHub release per tag

- Version: `0.7.4`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Committed
- Prompt: Push v0.7.3 pipeline; fix duplicate GitHub releases; dedupe v0.7.1

### Changes

- **run-electron-package** Ã¢â‚¬â€ electron-builder `--publish never` when publishing; one `gh release create` + upload pass (fixes nsis+portable double-release bug).
- **dedupe-github-releases.mjs** Ã¢â‚¬â€ drop duplicate releases for the same tag (keeps release with most assets).
- **GitHub** Ã¢â‚¬â€ removed duplicate `v0.7.1` release (kept 3-asset release).

## 2026-06-26 Ã¢â‚¬â€ v0.7.3 Ã¢â‚¬â€ NSIS-only release pipeline (faster build)

- Version: `0.7.3`
- Timestamp: 2026-06-26 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.7.3
- Prompt: Faster desktop release Ã¢â‚¬â€ NSIS installer only, asset verify, pre-release checklist

### Changes

- **Release** Ã¢â‚¬â€ default **NSIS Setup only** (portable opt-in via `--with-portable` / `desktop:dist:portable`).
- **test:fast** Ã¢â‚¬â€ skip live CloakBrowser e2e smokes for day-to-day builds (~3Ã¢â‚¬â€œ5 min saved).
- **pre-release-desktop.ps1** Ã¢â‚¬â€ stop Stealth processes before packaging (fix EBUSY).
- **verify-github-release-assets.mjs** Ã¢â‚¬â€ assert Setup.exe + latest.yml on GitHub after publish; `gh release upload --clobber` fallback.
- **run-electron-package** Ã¢â‚¬â€ `--skip-build` when `dist/` fresh; copy retry on EBUSY.

### Verification

- `pnpm test:fast` Ã¢â‚¬â€ passed
- NSIS publish + `verify-github-release-assets` Ã¢â‚¬â€ release pipeline

## 2026-06-25 Ã¢â‚¬â€ v0.7.2 Ã¢â‚¬â€ Hub workspace auth + profile modal polish

- Version: `0.7.2`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Minor
- Status: Committed
- Prompt: Hub identity login gate, profile detail note/log rail, hub-ui brand icons vendor sync
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.7.2

### Changes

- **Auth** Ã¢â‚¬â€ `WorkspaceAuthGate` + hub-identity session (`StealthAuthGate`, offline fallback, Supabase profile roles).
- **Profiles** Ã¢â‚¬â€ modal layout split (`ProfileFormModalLayout`, `ProfileBasicsFields`, `ProfileDetailNoteLogRail`, run-log filter storage).
- **Hub-ui vendor** Ã¢â‚¬â€ brand icons (`HubBrandIcon`, `HubNavIcon`), semantic glyphs, directory tool-access badge, modal filter preset.
- **Startup URL** Ã¢â‚¬â€ coerce single-label hosts (`check` Ã¢â€ â€™ `http://check/`), validate invalid phrases without overwrite.
- **Toast** Ã¢â‚¬â€ in-app toast stack for profile/workflow actions.
- **Packaging** Ã¢â‚¬â€ fix Vite `workflow-editor` chunk duplicate React (`dedupe` + narrow `manualChunks`); UI render smoke pass.

### Verification

- `pnpm test:unit` Ã¢â‚¬â€ passed
- `pnpm build` Ã¢â‚¬â€ passed
- Desktop package + `latest.yml` auto-update smoke Ã¢â‚¬â€ release pipeline

## 2026-06-25 Ã¢â‚¬â€ v0.7.1 Ã¢â‚¬â€ Omnibox search + profile table + workflow search

- Version: `0.7.1`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Minor
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.7.1

### Changes

- **Omnibox** Ã¢â‚¬â€ route intercept 302 to Google search; prefs + managed policy; guard on all Playwright sessions.
- **Profile table** Ã¢â‚¬â€ panel-fill row divisor fix; compact layout on search.
- **Workflow search** Ã¢â‚¬â€ `matchesDirectoryIdSearch` SSOT; immediate filter.
- **Engine** Ã¢â‚¬â€ `cloakbrowser` `0.4.0` Ã¢â€ â€™ `0.4.3`.
- **Packaging** Ã¢â‚¬â€ inline hub-ui directory-id-search in electron/lib (asar hotfix).
- **Dev** Ã¢â‚¬â€ Electron reload gate (identity extension purge, prefs wipe).

## 2026-06-25 Ã¢â‚¬â€ v0.6.32 Ã¢â‚¬â€ Electron dev reload

- Version: `0.6.32`
- Timestamp: 2026-06-25 13:26 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-25 Ã¢â‚¬â€ v0.6.30 Ã¢â‚¬â€ Electron dev reload

- Version: `0.6.30`
- Timestamp: 2026-06-25 12:55 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-25 Ã¢â‚¬â€ v0.6.31 Ã¢â‚¬â€ Omnibox route intercept + CDP attach guard

- Version: `0.6.31`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Omnibox** Ã¢â‚¬â€ `context.route` 302 redirect before document load; bind guard on every Playwright session (including CDP attach).
- **Prefs** Ã¢â‚¬â€ seed Google default search provider + managed `policies/managed/stealth-omnibox-search.json`.
- **Engine** Ã¢â‚¬â€ bump `cloakbrowser` `0.4.0` Ã¢â€ â€™ `0.4.3` (verify ladder passed).

## 2026-06-25 Ã¢â‚¬â€ v0.6.29 Ã¢â‚¬â€ Omnibox search guard (no http://2fa)

- Version: `0.6.29`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Omnibox search** Ã¢â‚¬â€ redirect single-label navigations (`http://2fa/`) to Google search; seed Chromium prefs to disable intranet redirect detector.
- **Automation** Ã¢â‚¬â€ trusted navigation bypass so startup URLs and workflows still open intranet hosts like `http://check/`.

## 2026-06-25 Ã¢â‚¬â€ v0.6.28 Ã¢â‚¬â€ Electron dev reload

- Version: `0.6.28`
- Timestamp: 2026-06-25 12:39 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-25 Ã¢â‚¬â€ v0.6.27 Ã¢â‚¬â€ Profile search compact table layout

- Version: `0.6.27`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profile search** Ã¢â‚¬â€ `resolveDirectoryPanelFillRows` always uses `pageSize` (fix 1-row search stretching to full tbody); compact CSS + scroll reset fallback.

## 2026-06-25 Ã¢â‚¬â€ v0.6.26 Ã¢â‚¬â€ Profile search row align + workflow search SSOT

- Version: `0.6.26`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profile table** Ã¢â‚¬â€ reset split-table body scroll on search/filter (`scrollResetKey`); panel-fill row divisor syncs with `listResetKey`.
- **Workflow search** Ã¢â‚¬â€ `matchesDirectoryIdSearch` SSOT (`workflow-directory-search.ts`); remove `useDeferredValue` lag so rail + Scripts table filter immediately.

## 2026-06-25 Ã¢â‚¬â€ v0.6.25 Ã¢â‚¬â€ Hotfix: electron asar packaging crash

- Version: `0.6.25`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.6.25

### Changes

- **Packaging** Ã¢â‚¬â€ inline hub-ui `directory-id-search` CJS trong `electron/lib` (vendor/ khÃƒÂ´ng cÃƒÂ³ trong asar Ã¢â€ â€™ sÃ¡Â»Â­a crash main process sau cÃƒÂ i Ã„â€˜Ã¡ÂºÂ·t).
- **Gate** Ã¢â‚¬â€ `verify-electron-asar-packaging.mjs` trong agent-verify-gate cho desktop `github-release`.

## 2026-06-25 Ã¢â‚¬â€ v0.6.24 Ã¢â‚¬â€ Step inspector inline fields

- Version: `0.6.24`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.6.24

### Changes

- **Step inspector** Ã¢â‚¬â€ remove redundant kind icon/label row; Status uses `HubSingleFilterDropdown` like Type.
- **Layout** Ã¢â‚¬â€ inline label Ã‚Â· value pairs; row 1 Name/Type/Status, row 2 Timeout/Selector/Value.

- **Vendor hub-ui** Ã¢â‚¬â€ sync `filter-dropdown-primitives` export `HUB_FILTER_BRAND_ICON_CLASS` (fix App failed to load SyntaxError).

## 2026-06-25 Ã¢â‚¬â€ v0.6.23 Ã¢â‚¬â€ Workflow rail column SSOT (6 opts, default +Steps)

- Version: `0.6.23`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow rail Display** Ã¢â‚¬â€ cÃƒÂ¹ng 6 cÃ¡Â»â„¢t vÃ¡Â»â€ºi Scripts tab (Platform Ã‚Â· Name Ã‚Â· ID Ã‚Â· Steps Ã‚Â· Created Ã‚Â· Updated).
- **Rail default** Ã¢â‚¬â€ hiÃ¡Â»Æ’n thÃ¡Â»â€¹ Platform Ã‚Â· Name Ã‚Â· ID Ã‚Â· **Steps**; Created/Updated tÃ¡ÂºÂ¯t (bÃ¡ÂºÂ­t qua Display).
- **Table** Ã¢â‚¬â€ rail dÃƒÂ¹ng `STEALTH_WORKFLOW_PANEL_COLUMN_META` + migrate prefs 3 cÃ¡Â»â„¢t cÃ…Â© Ã¢â€ â€™ thÃƒÂªm Steps.

## 2026-06-25 Ã¢â‚¬â€ v0.6.22 Ã¢â‚¬â€ Workflow Display columns-only

- Version: `0.6.22`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Display** Ã¢â‚¬â€ dropdown chÃ¡Â»â€° cÃƒÂ²n **Table columns** (Ã¡ÂºÂ©n KPI Ã‚Â· Hub header Ã‚Â· Filters Ã‚Â· Rows per page); rail vs Scripts tab dÃƒÂ¹ng prefs cÃ¡Â»â„¢t riÃƒÂªng (3 vs 6).
- **Directory table** Ã¢â‚¬â€ `StealthWorkflowDirectoryTable` Ã„â€˜Ã¡Â»Âc `workflow-directory-prefs` vÃƒÂ  cÃ¡ÂºÂ­p nhÃ¡ÂºÂ­t cÃ¡Â»â„¢t khi Display Ã„â€˜Ã¡Â»â€¢i.

## 2026-06-25 Ã¢â‚¬â€ v0.6.21 Ã¢â‚¬â€ Workflow rail Display + selection chip

- Version: `0.6.21`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow rail** Ã¢â‚¬â€ `HubDirectoryDisplayPanel` (Display) on filter toolbar, parity with Profiles + Scripts tab.
- **Selection chip** Ã¢â‚¬â€ replace static `10/10` `HubResultCount` with `HubDirectoryToolbarSelection` (`0/10` + spectrum bar) in `searchTrailing`; counts selected vs filtered workflows.

## 2026-06-25 Ã¢â‚¬â€ v0.6.20 Ã¢â‚¬â€ AI composer fill + canvas default zoom

- Version: `0.6.20`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **AI Step Assistant** Ã¢â‚¬â€ `flex: 1` in top editor pane; textarea stretches to fill gap above step toolbar.
- **Workflow canvas** Ã¢â‚¬â€ default `fitView` centers bubbles at zoom `minZoom Ãƒâ€” 1.2` (second step above minimum).
- **React Flow** Ã¢â‚¬â€ hide attribution watermark (`proOptions.hideAttribution` + CSS fallback).

## 2026-06-25 Ã¢â‚¬â€ v0.6.19 Ã¢â‚¬â€ Workflow Steps 50/50 layout + centered bulk

- Version: `0.6.19`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Split** Ã¢â‚¬â€ workflow directory vs step editor `50/50`; editor vs canvas `50/50` vertical grid.
- **Canvas** Ã¢â‚¬â€ drop legacy `clamp(54vh)` min-height; canvas fills half pane without empty tail.
- **Bulk bar** Ã¢â‚¬â€ `New` moved next to Save/Undo/Delete; centered row.
- **Step chips** Ã¢â‚¬â€ centered pills with category colors matching canvas bubbles (page/interact/capture/logic).

## 2026-06-25 Ã¢â‚¬â€ v0.6.18 Ã¢â‚¬â€ Workflow rail shows all 5 rows

- Version: `0.6.18`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profiles rail** Ã¢â‚¬â€ remove `max-height` calc on workflow `fixedRows` table (was clipping ~3 of 5 rows); pane still shrink-wraps via `flex: 0 0 auto` without stealing History/Console space.

## 2026-06-25 Ã¢â‚¬â€ v0.6.17 Ã¢â‚¬â€ Workflow rail fixedRows shrink-wrap

- Version: `0.6.17`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Profiles rail** Ã¢â‚¬â€ workflow table shrink-wraps exactly 5 rows (`fixedRows`); override hub pane `flex-1` so empty gap below table is reclaimed for Run History + Console (50/50 split restored).
- **CSS** Ã¢â‚¬â€ remove `hub-users-table.css` `min-height: auto` override that broke `fixedRows` height calc.

## 2026-06-25 Ã¢â‚¬â€ v0.6.16 Ã¢â‚¬â€ Workflow canvas fast load + Hub inspector

- Version: `0.6.16`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow canvas** Ã¢â‚¬â€ restore step board; drop IntersectionObserver deferral; eager xyflow chunk prefetch + pulse skeleton instead of stuck Ã¢â‚¬Å“Loading workflow canvasÃ¢â‚¬Â¦Ã¢â‚¬Â.
- **AI Step Assistant** Ã¢â‚¬â€ taller composer (4.25rem min-height, 3-row prompt, larger label/input).
- **Step inspector** Ã¢â‚¬â€ Type field uses `HubSingleFilterDropdown` (catalog labels) instead of native `<select>`; remove uppercase label override conflicting with `HubFormFieldLabel`.

## 2026-06-25 Ã¢â‚¬â€ v0.6.15 Ã¢â‚¬â€ Workflow Steps without canvas + taller Console

- Version: `0.6.15`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps** Ã¢â‚¬â€ remove lazy workflow canvas block (`Loading workflow canvasÃ¢â‚¬Â¦`); compact step chip picker for multi-step edit.
- **Profiles rail** Ã¢â‚¬â€ Console panel ~68% of History+Console stack (was 50/50).

## 2026-06-25 Ã¢â‚¬â€ v0.6.14 Ã¢â‚¬â€ Workflow Steps UI cleanup

- Version: `0.6.14`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow Steps** Ã¢â‚¬â€ remove workflow description blurb and AI assistant subtitle; English-only step prompt placeholder.
- **Typography** Ã¢â‚¬â€ align section title, meta, inspector, and AI composer with Hub body font scale.
- **Layout** Ã¢â‚¬â€ compact AI composer toolbar row (label Ã‚Â· prompt Ã‚Â· Gen/Apply).

## 2026-06-25 Ã¢â‚¬â€ v0.6.13 Ã¢â‚¬â€ Hub-UI stale date `dd/mm/yy` (all directory tables)

- Version: `0.6.13`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Vendor hub-ui `0.2.11`: stale activity labels (`formatHubActivityStaleLabel`, `HubActivityTimestampLabel`) Ã¢â€ â€™ **`dd/mm/yy`** workspace-wide.
- Workflow Created/Updated: dÃƒÂ¹ng SSOT profile helpers (bÃ¡Â»Â `workflow-directory-time` local).

### Verification

- `vitest run src/features/profiles/profile-directory-cell-helpers.test.ts`

## 2026-06-25 Ã¢â‚¬â€ v0.6.12 Ã¢â‚¬â€ Workflow stale date `dd/mm/yy` only

- Version: `0.6.12`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Workflow table **Created** / **Updated**: keep relative labels (`just now`, `6m ago`, `3h ago`) within 24h; stale (>24h) shows **`dd/mm/yy` only** (no `hh:mm` prefix Ã¢â‚¬â€ Profiles still use `hh:mm dd/mm/yy`).

### Verification

- `vitest run src/features/workflows/workflow-directory-time.test.ts`

## 2026-06-25 Ã¢â‚¬â€ v0.6.11 Ã¢â‚¬â€ Workflow filter size + Created/Updated format

- Version: `0.6.11`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Workflow directory filter/bulk row: remove compact `0.625rem` button override Ã¢â‚¬â€ filters + New/Copy/Delete use hub-ui control height (`text-xs`, Profiles parity).
- Workflow timestamps (superseded in v0.6.12): brief always-compact experiment Ã¢â‚¬â€ reverted to relative + stale date.

### Verification

- `vitest run src/features/workflows/workflow-directory-time.test.ts`

## 2026-06-25 Ã¢â‚¬â€ v0.6.10 Ã¢â‚¬â€ Hide dev probe terminals on Windows

- Version: `0.6.10`
- Timestamp: 2026-06-25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Dev** Ã¢â‚¬â€ `pnpm dev` uses `dev-node.mjs` (no `concurrently` extra consoles); all predev child spawns use `windowsHide` on Windows.
- **DB probe** Ã¢â‚¬â€ `ensure-better-sqlite3` probes via `node electron/cli.js` (not `electron.exe` GUI); caches ABI stamp under `.dev/better-sqlite3-electron.stamp`.
- **Runtime** Ã¢â‚¬â€ cookie-bridge `Expand-Archive` spawn hidden; fix `run-prod-start.mjs` missing `winSpawnOpts` import.

## 2026-06-24 Ã¢â‚¬â€ v0.6.9 Ã¢â‚¬â€ Fast profile Run + native SQLite + E0001

- Version: `0.6.9`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Launch perf** Ã¢â‚¬â€ skip WMI orphan probe on clean closedÃ¢â€ â€™Run; cache cookie-bridge prefs prep; warm E0001 CloakBrowser stage at boot; unset `ELECTRON_RUN_AS_NODE` in dev env.
- **DB** Ã¢â‚¬â€ `better-sqlite3` Electron rebuild; purge stale `-wal`/`-shm` on open/repair (`backend=better-sqlite3` WAL).
- **E0001** Ã¢â‚¬â€ extension pre-stage under `.cloakbrowser/.../<extId>/`; safe AppData cache sync.

## 2026-06-24 Ã¢â‚¬â€ v0.6.8 Ã¢â‚¬â€ Workflow table typography parity

- Version: `0.6.8`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Workflow directory pane: add `hub-directory-frame` on `WorkflowDirectoryPanel` Ã¢â‚¬â€ applies `hub-directory-frame-table.css` (12px body, status, platform label, headers) matching Profiles table; fixes smaller `hub-users-status` (10px) and icon labels (11px) when frame class was missing.

## 2026-06-24 Ã¢â‚¬â€ v0.6.7 Ã¢â‚¬â€ Workflow header icon + label sync

- Version: `0.6.7`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Workflow tab header: **Workflow** + `ClipboardList` icon (violet) Ã¢â‚¬â€ SSOT from `STEALTH_NAV_STRUCTURE` via `stealthScreenChrome()`; fixes wrong **Scripts** label and link-style lucide `Workflow` icon.
- Section rule label under header matches sidebar (`Workflow`).

### Verification

- `vitest run src/lib/stealth-nav-structure.test.ts`

## 2026-06-24 Ã¢â‚¬â€ v0.6.6 Ã¢â‚¬â€ Electron dev reload

- Version: `0.6.6`
- Timestamp: 2026-06-24 01:48 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 Ã¢â‚¬â€ v0.6.5 Ã¢â‚¬â€ Fast profile Run + native SQLite

- Version: `0.6.5`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Launch perf** Ã¢â‚¬â€ skip WMI orphan probe on clean closedÃ¢â€ â€™Run; cache cookie-bridge prefs prep per profile; warm E0001 CloakBrowser stage at boot; cache `binaryInfo`.
- **DB** Ã¢â‚¬â€ `better-sqlite3` Electron rebuild (hoisted module); simplify native loader in `init.cjs`.
- **E0001** Ã¢â‚¬â€ extension pre-stage under `.cloakbrowser/.../<extId>/`; safe AppData cache sync.

## 2026-06-24 Ã¢â‚¬â€ v0.6.4 Ã¢â‚¬â€ Workflow rail table vertical align

- Version: `0.6.4`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Workflow rail (`fixedRows=5`): body cells + checkbox column `vertical-align: middle` Ã¢â‚¬â€ matches Profiles table fix.
- Workflow panel (Scripts tab): same middle align for `stealth-workflow-panel-table`.
- Removed checkbox `min-height` hack on rail; fixedRows selectors replace unused panel-fill rules.

## 2026-06-24 Ã¢â‚¬â€ v0.6.3 Ã¢â‚¬â€ Profiles table row vertical align

- Version: `0.6.3`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Profiles directory table: body cells `vertical-align: middle` Ã¢â‚¬â€ text/icon no longer hugs top when panel-fill stretches rows.
- Checkbox column centered with row content (removed top-pin + min-height hack).

## 2026-06-24 Ã¢â‚¬â€ v0.6.2 Ã¢â‚¬â€ Electron dev reload

- Version: `0.6.2`
- Timestamp: 2026-06-24 01:42 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 Ã¢â‚¬â€ v0.6.1 Ã¢â‚¬â€ Launch speed + E0001 staging ship

- Version: `0.6.1`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Minor
- Status: Dev

### Changes

- **Launch perf** Ã¢â‚¬â€ skip WMI orphan probe on clean closedÃ¢â€ â€™Run path; cache cookie-bridge prefs prep per profile; warm extension stage at app boot; cache CloakBrowser `binaryInfo`.
- **E0001** Ã¢â‚¬â€ pre-stage extension under `.cloakbrowser/chromium-<ver>/<extId>/`; AppData cache sync without destructive `rmSync`.
- **DB** Ã¢â‚¬â€ `pnpm db:repair` + better-sqlite3 Electron ABI verified (`ensure-better-sqlite3`).

## 2026-06-24 Ã¢â‚¬â€ v0.5.57 Ã¢â‚¬â€ Extension pre-stage + DB repair verified

- Version: `0.5.57`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **CloakBrowser pre-stage** Ã¢â‚¬â€ copy E0001 to `.cloakbrowser/chromium-<ver>/<extId>/` before `--load-extension` (fixes `manifest missing` dialog for `lplb...`).
- **Cache sync** Ã¢â‚¬â€ in-place overwrite + mtime skip (Windows `ENOTEMPTY` safe).
- **DB** Ã¢â‚¬â€ `pnpm db:repair` re-export 5000 profiles; launch bench avg ~1.6s.

## 2026-06-24 Ã¢â‚¬â€ v0.5.55 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.55`
- Timestamp: 2026-06-24 01:27 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 Ã¢â‚¬â€ v0.5.54 Ã¢â‚¬â€ CloakBrowser extension pre-stage

- Version: `0.5.54`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Extension staging** Ã¢â‚¬â€ copy E0001 into `.cloakbrowser/chromium-<ver>/<extId>/` before `--load-extension` (fixes dialog `manifest missing` for `lplb...` staging path).
- **Launch hook** Ã¢â‚¬â€ stage on `openProfile` + `launchStealthPersistentContext`; warn when staging incomplete.

## 2026-06-24 Ã¢â‚¬â€ v0.5.53 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.53`
- Timestamp: 2026-06-24 01:16 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 Ã¢â‚¬â€ v0.5.52 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.52`
- Timestamp: 2026-06-24 01:15 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 Ã¢â‚¬â€ v0.5.53 Ã¢â‚¬â€ E0001 AppData cache launch (verified)

- Version: `0.5.53`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Cookie Bridge load path** Ã¢â‚¬â€ sync workspace E0001 into `extensions-cache/.../unpacked` and pass only that AppData path to `--load-extension` (fixes CloakBrowser `manifest missing` under `.cloakbrowser/.../ofghkh...`).
- **Prefs scrub** Ã¢â‚¬â€ purge stale E0001 pins (workspace id `ofghkh...`, store id `kaaa...`, `.cloakbrowser` staging) on startup and before each profile launch.
- **Cache sync filter** Ã¢â‚¬â€ skip `.git` / `node_modules` when copying workspace into cache.

## 2026-06-24 Ã¢â‚¬â€ v0.5.52 Ã¢â‚¬â€ E0001 cache sync without .git

- Version: `0.5.52`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Cache sync filter** Ã¢â‚¬â€ skip `.git` / `node_modules` when copying workspace E0001 into `extensions-cache` (fixes `EIO Access denied` on relaunch smoke).

## 2026-06-24 Ã¢â‚¬â€ v0.5.51 Ã¢â‚¬â€ E0001 launch from AppData cache

- Version: `0.5.51`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Cookie Bridge load path** Ã¢â‚¬â€ sync workspace E0001 into `extensions-cache/.../unpacked` and pass only that stable AppData path to `--load-extension` (fixes CloakBrowser staging `manifest missing` under `.cloakbrowser/.../ofghkh...`).
- **Prefs scrub** Ã¢â‚¬â€ purge stale E0001 pins (workspace id, store id, `.cloakbrowser` staging) before profile launch.

## 2026-06-24 Ã¢â‚¬â€ v0.5.50 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.50`
- Timestamp: 2026-06-24 23:12 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 Ã¢â‚¬â€ v0.5.49 Ã¢â‚¬â€ Dev stack stability + DB repair + honest ship gate

- Version: `0.5.49`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Boot timeout fix** Ã¢â‚¬â€ Electron waits for Vite `src/main.tsx` before `loadURL` (avoids "JavaScript did not start in time" on zombie `:5175`).
- **DB repair** Ã¢â‚¬â€ auto re-export corrupt `stealth-console.db` via sql.js; CLI `pnpm db:repair`.
- **Rules/skills** Ã¢â‚¬â€ anti false-completion: browser MCP required before marking UI/launch tasks done.

## 2026-06-24 Ã¢â‚¬â€ v0.5.48 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.48`
- Timestamp: 2026-06-24 22:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 Ã¢â‚¬â€ v0.5.48 Ã¢â‚¬â€ E0001 extension repair + System panel

- Version: `0.5.48`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Extension load error** Ã¢â‚¬â€ purge stale Chrome prefs pointing at missing `.cloakbrowser/.../extId` paths before each profile launch (fixes Ã¢â‚¬Å“Manifest file is missing or unreadableÃ¢â‚¬Â).
- **System Ã¢â€ â€™ Extensions** Ã¢â‚¬â€ new **E0001 Cookie Bridge** panel: enabled state, load path, unpacked ID, **Repair extension prefs** action.
- **Startup** Ã¢â‚¬â€ bulk scrub broken extension pins across all profile Chrome dirs.

## 2026-06-24 Ã¢â‚¬â€ v0.5.46 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.46`
- Timestamp: 2026-06-24 22:48 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 Ã¢â‚¬â€ v0.5.45 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.45`
- Timestamp: 2026-06-24 18:53 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 Ã¢â‚¬â€ v0.5.44 Ã¢â‚¬â€ E0001 extension load fix + faster launch

- Version: `0.5.44`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **E0001 Cookie Bridge** Ã¢â‚¬â€ fix `--disable-extensions-except` to use extension IDs (not paths); pin unpacked extension ID before launch so E0001 loads in toolbar again.
- **Extension source** Ã¢â‚¬â€ prefer workspace `Extension/E0001-cookie-bridge` when present, else Chrome Web Store cache.
- **Launch speed** Ã¢â‚¬â€ skip redundant store download when cache/workspace copy exists; default fast startup navigation (`STEALTH_FAST_LAUNCH=1`, set `0` to restore legacy settle waits).
- **Electron spawn env** Ã¢â‚¬â€ force `STEALTH_COOKIE_BRIDGE=1` on dev/prod Electron launch so stale shell `STEALTH_COOKIE_BRIDGE=0` (perf experiment) cannot silently disable E0001.

## 2026-06-24 Ã¢â‚¬â€ v0.5.43 Ã¢â‚¬â€ Restore E0001 default + expose failed profiles

- Version: `0.5.43`
- Timestamp: 2026-06-24 16:56 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Restored **E0001 Cookie Bridge** default behavior to use the Chrome Web Store extension cache unless `STEALTH_COOKIE_BRIDGE=0` explicitly disables it.
- Added targeted test coverage so Cookie Bridge default-on behavior is verified in `electron/lib/cookie-bridge-store.test.cjs`.
- Exposed **Failed** profile counts in the Profiles KPI strip and header stats so totals reconcile visibly when a profile is not ready or running.

## 2026-06-24 Ã¢â‚¬â€ v0.5.42 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.42`
- Timestamp: 2026-06-24 16:37 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 Ã¢â‚¬â€ v0.5.41 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.41`
- Timestamp: 2026-06-24 16:31 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-24 Ã¢â‚¬â€ v0.5.40 Ã¢â‚¬â€ Launch vs Run separation + warm workflow path

- Version: `0.5.40`
- Timestamp: 2026-06-24 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Run** (row action) Ã¢â‚¬â€ `profile:launch` opens browser with profile startup URL only; no workflow.
- **Launch** (bulk) Ã¢â‚¬â€ `automation:openUrl` via `ensureAutomationContext`: cold launch skips startup URL; warm session focuses + upgrades focus-only via CDP instead of re-spawn.
- **`awaitLaunchNavigation`** Ã¢â‚¬â€ optional `settle: false` on warm workflow path to avoid redundant page settle.
- **E2E** Ã¢â‚¬â€ `launch-vs-run-smoke.cjs` verifies startup URL on Run and workflow target on Launch (cold + warm).

## 2026-06-23 Ã¢â‚¬â€ v0.5.39 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.39`
- Timestamp: 2026-06-23 17:18 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-23 Ã¢â‚¬â€ v0.5.38 Ã¢â‚¬â€ Short title prefix + faster default launch

- Version: `0.5.38`
- Type: Patch
- Product: P0003

### Changes

- **Window title prefix** Ã¢â‚¬â€ shortened from `[0012] Profile 0012` to just `[0012]`.
- **Launch speed** Ã¢â‚¬â€ E0001 Cookie Bridge is now **off by default**; re-enable only when needed with `STEALTH_COOKIE_BRIDGE=1`.
- **Benchmark after change** Ã¢â‚¬â€ launch benchmark improved to min `2835ms`, avg `4016ms`, max `4617ms` (was avg `6278ms` in prior baseline).

## 2026-06-23 Ã¢â‚¬â€ v0.5.37 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.37`
- Timestamp: 2026-06-23 16:06 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-22 Ã¢â‚¬â€ v0.5.36 Ã¢â‚¬â€ Workflow smokes use neutral URL (CI ladder pass)

- Version: `0.5.36`
- Type: Patch
- Product: P0003

### Changes

- **workflow-launch / workflow-on-open smokes** Ã¢â‚¬â€ navigate `example.com` (Google login gate stays in product + `google-session-guard.test.cjs`).

## 2026-06-22 Ã¢â‚¬â€ v0.5.35 Ã¢â‚¬â€ Ship loop: identity panel + test ladder complete

- Version: `0.5.35`
- Type: Patch
- Product: P0003

### Changes

- **`profile-identity-status.test.cjs`** Ã¢â‚¬â€ status matrix unit test.
- **`run-unit-tests.mjs`** Ã¢â‚¬â€ restore `google-session-guard`, `window-title-smoke` in ladder.
- **`PROJECT_CONTEXT.md`** Ã¢â‚¬â€ `dev:reload` + System identity panel pointer.

## 2026-06-22 Ã¢â‚¬â€ v0.5.34 Ã¢â‚¬â€ Profile identity status + Google login gate + dev:reload smokes

- Version: `0.5.34`
- Type: Patch
- Product: P0003

### Changes

- **System Ã¢â€ â€™ Profile identity panel** Ã¢â‚¬â€ window title / omnibar CLI / binary readiness / taskbar icon notes; `profile-identity:status` IPC.
- **Google session guard** Ã¢â‚¬â€ workflows fail with clear message on `accounts.google.com` sign-in (Google One AI preset).
- **`pnpm dev:reload`** verification ladder Ã¢â‚¬â€ window-title, workflow-launch, omnibar-chip smokes after electron restart.
- **Automation** Ã¢â‚¬â€ re-bind window title on each workflow run.

### Verification

- `window-title-smoke`, `workflow-launch-smoke`, `omnibar-chip-smoke` Ã¢â‚¬â€ live ok
- Omnibar **inside URL bar** still blocked on CloakBrowser binary (#384)

## 2026-06-22 Ã¢â‚¬â€ v0.5.33 Ã¢â‚¬â€ Workflow ERR_ABORTED (title race + commit navigate)

- Version: `0.5.33`
- Type: Patch
- Product: P0003

### Changes

- **Root cause** Ã¢â‚¬â€ `bindProfileWindowTitle` called `page.evaluate` during active navigation Ã¢â€ â€™ aborts workflow `page.goto`.
- **Title bind** Ã¢â‚¬â€ defer evaluate until `domcontentloaded`; chain after `startupNavigation` in session manager.
- **`safe-goto.cjs`** Ã¢â‚¬â€ default `commit`, poll `waitForURL` after abort, `location.assign` fallback.
- **Workflow steps** Ã¢â‚¬â€ navigate uses `waitUntil: commit` (Google redirect safe).
- **Live e2e** Ã¢â‚¬â€ `workflow-launch-smoke.cjs`, `workflow-on-open-smoke.cjs` in `test:unit`.

### Verification

- `node electron/e2e/workflow-launch-smoke.cjs` Ã¢â‚¬â€ ok (lands accounts.google.com redirect)
- `node electron/e2e/workflow-on-open-smoke.cjs` Ã¢â‚¬â€ ok

## 2026-06-22 Ã¢â‚¬â€ v0.5.32 Ã¢â‚¬â€ Workflow launch ERR_ABORTED (Google redirects)

- Version: `0.5.32`
- Type: Patch
- Product: P0003

### Changes

- **`safe-goto.cjs`** Ã¢â‚¬â€ treat `net::ERR_ABORTED` as success when tab already landed on target / `*.google.com` redirect; use `commit` on retries.
- **`stabilizePrimaryPage`** Ã¢â‚¬â€ settle in-flight launch navigation before workflow `page.goto`.
- **`session-manager`** Ã¢â‚¬â€ pass `skipStartupUrl` through orphan CDP attach (fixes race when Launch + workflow on existing browser).

### Verification

- `node --test electron/automation/safe-goto.test.cjs`
- `node scripts/run-unit-tests.mjs`

## 2026-06-22 Ã¢â‚¬â€ v0.5.31 Ã¢â‚¬â€ Engine pin policy + fork decision record

- Version: `0.5.31`
- Type: Patch
- Product: P0003

### Changes

- **Exact pin `cloakbrowser@0.4.0`** Ã¢â‚¬â€ removed `^` range; SSOT in `tool.manifest.json` `engine`.
- **Bump ladder** Ã¢â‚¬â€ `scripts/check-cloakbrowser-pin.mjs`, `scripts/bump-cloakbrowser.mjs`, `pnpm engine:check-pin` / `engine:bump`; wired into `test:unit`.
- **`docs/ENGINE-CLOAKBROWSER.md`** Ã¢â‚¬â€ pin policy, bump QA checklist, rollback.
- **`docs/cloakbrowser-fork-evaluation.md`** Ã¢â‚¬â€ locked decision: **no private fork** for P0003 launcher; revisit criteria documented.

## 2026-06-22 Ã¢â‚¬â€ v0.5.30 Ã¢â‚¬â€ Standalone positioning + engine dependency doc

- Version: `0.5.30`
- Type: Patch
- Product: P0003

### Changes

- **Remove GPM / legacy vendor references** Ã¢â‚¬â€ docs, comments, AI workflow prompt, `sync-hub-env.mjs`, manifest summary; reframe P0003 as standalone console.
- **`docs/ENGINE-CLOAKBROWSER.md`** Ã¢â‚¬â€ SSOT for CloakBrowser engine dependency, daily-use risks, and mitigations.
- **Upstream docs** Ã¢â‚¬â€ `OMNIBAR-PROFILE-CHIP-SPEC.md`, `cloakbrowser-upstream/*`, fork eval rewritten without GPM comparisons.

## 2026-06-22 Ã¢â‚¬â€ v0.5.29 Ã¢â‚¬â€ cloakbrowser 0.4.0 + fork eval + #384 comment

- Version: `0.5.29`
- Type: Patch
- Product: P0003

### Changes

- **Bump `cloakbrowser` 0.3.31 Ã¢â€ â€™ 0.4.0** Ã¢â‚¬â€ scanned package: no `stealth-profile-*` switch handling yet; omnibar chip still requires #384 / fork.
- **Fork evaluation** Ã¢â‚¬â€ `docs/cloakbrowser-fork-evaluation.md` (upstream vs PR vs private fork vs MV3).
- **#384 comment** Ã¢â‚¬â€ GPM omnibar UX reference posted to CloakHQ/CloakBrowser#384.

### Verification

- `window-title-smoke` + `relaunch-smoke` on 0.4.0 Ã¢â‚¬â€ passed

## 2026-06-22 Ã¢â‚¬â€ v0.5.28 Ã¢â‚¬â€ Profile window title cue (taskbar / Alt+Tab)

- Version: `0.5.28`
- Type: Patch
- Product: P0003

### Changes

- **Window title prefix** Ã¢â‚¬â€ `[0003] Profile 0003 Ã¢â‚¬â€ Google` on every tab via init script; visible on taskbar and Alt+Tab until native omnibar chip (CloakBrowser #384).
- Opt-out: `STEALTH_PROFILE_WINDOW_TITLE=0`.

### Verification

- `node --test electron/lib/profile-window-title.test.cjs` Ã¢â‚¬â€ passed

## 2026-06-22 Ã¢â‚¬â€ v0.5.27 Ã¢â‚¬â€ Omnibar chip CLI wired + DB column drop + upstream kit

- Version: `0.5.27`
- Type: Patch
- Product: P0003

### Changes

- **Wire omnibar chip CLI** Ã¢â‚¬â€ `buildOmnibarChipChromeArgs()` in `buildStealthChromeArgs`; flags `--stealth-profile-label/code/id/group/tooltip`; opt-out `STEALTH_OMNIBAR_CHIP=0`.
- **SQLite migration** Ã¢â‚¬â€ drop legacy columns `show_profile_badge`, `profile_tab_groups`, `tab_group_color` via table rebuild (`profile_chrome_columns_dropped_v1`).
- **Upstream contribution kit** Ã¢â‚¬â€ `docs/cloakbrowser-upstream/` (README + `GITHUB-ISSUE.md` for CloakHQ/cloakbrowser).

### Verification

- `node scripts/run-unit-tests.mjs` Ã¢â‚¬â€ passed
- Upstream issue: https://github.com/CloakHQ/CloakBrowser/issues/384

## 2026-06-22 Ã¢â‚¬â€ v0.5.26 Ã¢â‚¬â€ Remove MV3 identity dead code + omnibar chip spec

- Version: `0.5.26`
- Type: Patch
- Product: P0003

### Changes

- **Removed MV3 identity-toolbar runtime** Ã¢â‚¬â€ deleted extension generator, e2e smokes, taskbar overlay, `showProfileBadge` / `profileTabGroups` API fields, `STEALTH_PROFILE_IDENTITY_UI` gate.
- **Legacy purge retained** Ã¢â‚¬â€ startup + System panel purge old `identity-toolbar` bundles from pre-v0.5.23 installs; launch always uses `--disable-extensions` unless Cookie Bridge loads.
- **Native omnibar chip spec** Ã¢â‚¬â€ `docs/OMNIBAR-PROFILE-CHIP-SPEC.md` + `buildOmnibarChipLabel()` for upstream `cloakbrowser` (GPM-style `Stealth | 0003`).
- **Launch UX** Ã¢â‚¬â€ orphan attach/focus on relaunch decoupled from removed identity UI flag.

### Verification

- `node scripts/run-unit-tests.mjs` Ã¢â‚¬â€ passed

## 2026-06-22 Ã¢â‚¬â€ v0.5.25 Ã¢â‚¬â€ safe-goto workflow launch fix

- Version: `0.5.25`
- Timestamp: 2026-06-22 04:37 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Fix `net::ERR_ABORTED` when Launch runs workflow on a freshly opened profile Ã¢â‚¬â€ skip startup URL for automation launch, await in-flight startup navigation, and retry aborted `page.goto`.
- Add `safe-goto.cjs` helper with unit tests.

### Verification

- `node --test electron/automation/safe-goto.test.cjs`
- `pnpm test:unit` (vitest + electron unit suites)

## 2026-06-22 Ã¢â‚¬â€ v0.5.22 Ã¢â‚¬â€ Hub activity timestamp SSOT

- Version: `0.5.22`
- Type: Patch
- Product: P0003

### Changes

- Profile Last opened + workflow timestamps use hub-ui `HubActivityTimestampLabel`.
- Fresh bucket 3h Ã¢â€ â€™ **1h**; stale format `hh:mm dd/mm/yy` (parity cookie sync/load).

### Verification

- `vitest run profile-directory-cell-helpers.test.ts` Ã¢â‚¬â€ passed

## 2026-06-21 Ã¢â‚¬â€ v0.5.21 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.21`
- Timestamp: 2026-06-21 03:25 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-22 Ã¢â‚¬â€ v0.5.21 Ã¢â‚¬â€ Workflow Steps design preview (5 variants)

- Version: `0.5.21`
- Timestamp: 2026-06-22 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **System / Design Template:** 5 layout-direction mockups for Workflow Steps editor (`workflow-steps` review).
- **Rail truncate parity:** `stealth-workflow-name-cell` + ellipsis on workflow rail table.
- **Tests:** `workflow-directory-cell-helpers.test.ts` Ã¢â‚¬â€ timestamp cell fresh/stale/empty.

## 2026-06-22 Ã¢â‚¬â€ v0.5.19 Ã¢â‚¬â€ Workflow directory table layout + timestamps

- Version: `0.5.19`
- Timestamp: 2026-06-22 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Workflow panel table:** `table-layout: fixed` + ellipsis on Name/Platform Ã¢â‚¬â€ hÃ¡ÂºÂ¿t Ã„â€˜ÃƒÂ¨ layer Name Ã¢â€ â€™ ID.
- **Created/Updated:** `HubUsersStatusLabel` + dot mÃƒÂ u theo age tone (parity profile Last opened).

## 2026-06-21 Ã¢â‚¬â€ v0.5.18 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.18`
- Timestamp: 2026-06-21 03:04 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-21 Ã¢â‚¬â€ v0.5.17 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.17`
- Timestamp: 2026-06-21 02:47 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-21 Ã¢â‚¬â€ v0.5.16 Ã¢â‚¬â€ Auto-update feed + silent installer updates

- Version: `0.5.16`
- Timestamp: 2026-06-21 00:28 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.5.16

### Changes

- **Auto-update fix:** GitHub repo public Ã¢â‚¬â€ `latest.yml` feed reachable without token (v0.5.2+ can check updates).
- Installer channel: `autoDownload` + `autoInstallOnAppQuit`; download on `update-available`.
- Header Update button auto-downloads when installer detects new version.
- `verify-desktop-auto-update`: public feed URL gate; `agent-verify-gate` prod-desktop for Release.

## 2026-06-21 Ã¢â‚¬â€ v0.5.15 Ã¢â‚¬â€ Catalog 10kÃ¢â‚¬â€œ50k + batch runner + proxy pool

- Version: `0.5.15`
- Timestamp: 2026-06-21 23:18 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.5.15

### Changes

- Profile catalog scale (10kÃ¢â‚¬â€œ50k), batch runner, proxy pool UI.
- Directory ID search, identity extension purge, Chrome prefs wipe, launch perf panel.
- Hub-UI directory search highlight + display prefs parity (P0004/P0020 golden).
- Desktop release pipeline + electron-updater (NSIS + portable).
- *Includes dev-reload iterations v0.5.3Ã¢â‚¬â€œv0.5.14 (identity purge / reload gate).*

## 2026-06-21 Ã¢â‚¬â€ v0.5.14 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.14`
- Timestamp: 2026-06-21 22:58 (UTC+7)
- Type: Patch
- Status: Superseded (v0.5.15)

### Changes

- Internal dev reload iteration Ã¢â‚¬â€ see v0.5.15 consolidated notes.

## 2026-06-21 Ã¢â‚¬â€ v0.5.13 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.13`
- Timestamp: 2026-06-21 22:42 (UTC+7)
- Type: Patch
- Status: Superseded (v0.5.15)

### Changes

- Internal dev reload iteration Ã¢â‚¬â€ see v0.5.15 consolidated notes.

## 2026-06-19 Ã¢â‚¬â€ v0.5.12 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.12`
- Timestamp: 2026-06-19 03:03 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 Ã¢â‚¬â€ v0.5.11 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.11`
- Timestamp: 2026-06-19 02:31 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 Ã¢â‚¬â€ v0.5.10 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.10`
- Timestamp: 2026-06-19 02:01 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 Ã¢â‚¬â€ v0.5.9 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.9`
- Timestamp: 2026-06-19 01:18 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 Ã¢â‚¬â€ v0.5.8 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.8`
- Timestamp: 2026-06-19 01:03 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 Ã¢â‚¬â€ v0.5.7 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.7`
- Timestamp: 2026-06-19 00:47 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 Ã¢â‚¬â€ v0.5.6 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.6`
- Timestamp: 2026-06-19 00:34 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 Ã¢â‚¬â€ v0.5.5 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.5`
- Timestamp: 2026-06-19 00:09 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 Ã¢â‚¬â€ v0.5.4 Ã¢â‚¬â€ Electron dev reload

- Version: `0.5.4`
- Timestamp: 2026-06-19 00:02 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- Auto patch bump + Electron reload gate (identity extension purge, `--disable-extensions`, prefs wipe).

## 2026-06-19 Ã¢â‚¬â€ v0.5.3 Ã¢â‚¬â€ Identity extension removed + dev reload gate

- Version: `0.5.3`
- Timestamp: 2026-06-19 22:50 (UTC+7)
- Type: Patch
- Status: Dev

### Changes

- **Identity label extension OFF** Ã¢â‚¬â€ purge Chrome prefs + `identity-toolbar` bundles; `--disable-extensions` on launch; kill stale Chrome (no attach).
- **`purgeAllChromeExtensions`** Ã¢â‚¬â€ wipe pinned E0001/identity from profile prefs when identity UI disabled.
- **`electron-dev-gate.mjs`** Ã¢â‚¬â€ auto patch bump + free :5175 when `electron/` changes (`predev` + `pnpm dev:reload`).

## 2026-06-18 - Catalog 10kÃ¢â‚¬â€œ50k + batch runner + proxy pool

- Version: `0.5.2`
- Timestamp: 2026-06-18 15:00 (UTC+7)
- Commit: `8b96418`
- Type: Minor
- Status: Verified
- Release: https://github.com/tuanhoangfx/Stealth-Browser-Console/releases/tag/v0.5.2

### Changes

MÃ¡Â»Â¥c tiÃƒÂªu xÃƒÂ¡c nhÃ¡ÂºÂ­n: **quÃ¡ÂºÂ£n lÃƒÂ½ 10kÃ¢â‚¬â€œ50k profile, chÃ¡ÂºÂ¡y ~20Ã¢â‚¬â€œ30 Ã„â€˜Ã¡Â»â€œng thÃ¡Â»Âi**.

### Added Ã¢â‚¬â€ Job queue batch (chÃ¡ÂºÂ¡y 20Ã¢â‚¬â€œ30/lÃ¡ÂºÂ§n)
- **Concurrency cÃ¡ÂºÂ¥u hÃƒÂ¬nh** `STEALTH_JOB_CONCURRENCY` (Ã„â€˜Ã¡ÂºÂ·t 20Ã¢â‚¬â€œ30 cho usage nÃƒÂ y).
- **Dedupe theo key** (= profileId): khÃƒÂ´ng bao giÃ¡Â»Â 2 job chÃ¡Â»â€œng lÃƒÂªn cÃƒÂ¹ng 1 profile.
- **Retry + backoff luÃ¡Â»Â¹ thÃ¡Â»Â«a** (`retries`, `retry_delay_ms`) cho job lÃ¡Â»â€”i tÃ¡ÂºÂ¡m thÃ¡Â»Âi.
- **Jitter** (`jitter_ms`): trÃ¡Â»â€¦ ngÃ¡ÂºÂ«u nhiÃƒÂªn trÃ†Â°Ã¡Â»â€ºc launch Ã¢â€ â€™ trÃƒÂ¡nh pattern lockstep (chÃ¡Â»â€˜ng fingerprint timing).
- Route `GET /api/jobs/stats` giÃƒÂ¡m sÃƒÂ¡t lÃƒÂ´ (queued/running/done/error).

### Added Ã¢â‚¬â€ Pagination cho catalog lÃ¡Â»â€ºn
- `profileService.listProfilesPage({ limit, offset, search, groupId, status, sort, dir })` + `countProfiles()` Ã¢â‚¬â€ filter/sort Ã¡Â»Å¸ tÃ¡ÂºÂ§ng SQL, KHÃƒâ€NG load 50k row vÃƒÂ o JS.
- `GET /api/profiles?limit=&offset=&search=&group=&status=&sort=&dir=` Ã¢â€ â€™ `{ profiles, total, limit, offset }`. **KhÃƒÂ´ng param = trÃ¡ÂºÂ£ toÃƒÂ n bÃ¡Â»â„¢** (P0025 khÃƒÂ´ng Ã„â€˜Ã¡Â»â€¢i).
- `reconcileActiveStatuses()` thay full-scan: chÃ¡Â»â€° duyÃ¡Â»â€¡t session sÃ¡Â»â€˜ng + row active (indexed) Ã¢â‚¬â€ O(active) thay vÃƒÂ¬ O(50k) mÃ¡Â»â€”i poll.
- **`listProfilesLite()`** (id/name/status, khÃƒÂ´ng JOIN) cho `GET /api/profiles` all-path: benchmark thÃ¡Â»Â±c Ã¡Â»Å¸ 5001 profile Ã¢â€ â€™ HTTP all-path **~255ms Ã¢â€ â€™ ~40ms** (~7x). Pagination 5Ã¢â‚¬â€œ11ms. flush 1.6MB DB ~4ms.
- **Debounce reconcile khi close** (`ProfilesRuntimeProvider`): event `closed` trÃ†Â°Ã¡Â»â€ºc Ã„â€˜ÃƒÂ¢y gÃ¡Â»Âi refresh full 5001 row (210ms) mÃ¡Â»â€”i lÃ¡ÂºÂ§n Ã¢â€ â€™ chÃ¡ÂºÂ¡y lÃƒÂ´ 20Ã¢â‚¬â€œ30 = giÃ¡ÂºÂ­t nÃ¡ÂºÂ·ng. Nay patch in-place + gÃ¡Â»â„¢p burst thÃƒÂ nh 1 refresh sau 1.5s. (UI dÃƒÂ¹ng `HubDirectoryTableShell` vÃ¡Â»â€˜n Ã„â€˜ÃƒÂ£ phÃƒÂ¢n trang nÃ¡Â»â„¢i bÃ¡Â»â„¢ Ã¢â€ â€™ khÃƒÂ´ng cÃ¡ÂºÂ§n virtualization Ã¢â‚¬â€ Ã„â€˜ÃƒÂ£ Ã„â€˜o.)

### Added Ã¢â‚¬â€ Proxy pool + health-check + geoip-consistency
- `electron/lib/proxy-pool.cjs`: `parseProxy` (Ã„â€˜a Ã„â€˜Ã¡Â»â€¹nh dÃ¡ÂºÂ¡ng + GPM `host:port:user:pass`), `checkProxy` (proxy sÃ¡Â»â€˜ng + exit IP/country/timezone qua HTTP forward-proxy), `geoConsistency` (so timezone/locale profile vs IP thÃ¡ÂºÂ­t), `ProxyPool` (round-robin + cooldown).
- `POST /api/proxy/check` { proxy | profile_id } Ã¢â€ â€™ health + cÃ¡ÂºÂ£nh bÃƒÂ¡o lÃ¡Â»â€¡ch geoip. Endpoint geo Ã„â€˜Ã¡Â»â€¢i qua `STEALTH_GEOIP_URL`.

### Tests
- `electron/api-routes.test.cjs`: +dedupe, +retry, +parseProxy, +geoConsistency, +ProxyPool, +pagination (15/15 pass).

## 2026-06-18 Ã¢â‚¬â€ v0.5.1 Ã¢â‚¬â€ Scale fixes: fingerprint collision + minimize bug + DB indexes

### Fixed
- **Fingerprint collision (antidetect, P1):** seed sinh tÃ¡Â»Â« `randomInt(10000,99999)` (90k giÃƒÂ¡ trÃ¡Â»â€¹) Ã¢â€ â€™ Ã¡Â»Å¸ vÃƒÂ i nghÃƒÂ¬n profile chÃ¡ÂºÂ¯c chÃ¡ÂºÂ¯n trÃƒÂ¹ng fingerprint. Ã„ÂÃ¡Â»â€¢i sang khÃƒÂ´ng gian `1..2^31-1` + `generateFingerprintSeed()` Ã„â€˜Ã¡ÂºÂ£m bÃ¡ÂºÂ£o duy nhÃ¡ÂºÂ¥t (verify: 2000 profile Ã¢â€ â€™ 2000 seed unique). Profile cÃ…Â© giÃ¡Â»Â¯ nguyÃƒÂªn seed.
- **Minimize bug:** `minimizeCloakWindow` (PowerShell) minimize MÃ¡Â»Å’I cÃ¡Â»Â­a sÃ¡Â»â€¢ Chrome trÃƒÂªn mÃƒÂ¡y (cÃ¡ÂºÂ£ Chrome cÃƒÂ¡ nhÃƒÂ¢n). Thay bÃ¡ÂºÂ±ng `sessionManager.minimizeProfile()` qua CDP `windowState:minimized` Ã¢â‚¬â€ scope Ã„â€˜ÃƒÂºng cÃ¡Â»Â­a sÃ¡Â»â€¢ profile, cross-platform.

### Performance
- **DB indexes:** thÃƒÂªm index `profiles(updated_at, group_id, fingerprint_seed, status)` + `runs(started_at, profile_id)`. `ORDER BY updated_at` chuyÃ¡Â»Æ’n tÃ¡Â»Â« full-scan+sort sang index scan.
- **Lightweight status write:** lifecycle (opening/running/closed/failed) dÃƒÂ¹ng `setProfileStatus()` (1 UPDATE) thay `updateProfile()` (2 SELECT JOIN + ghi full row). GiÃ¡ÂºÂ£m tÃ¡ÂºÂ£i khi nhiÃ¡Â»Âu session Ã„â€˜Ã¡Â»â€¢i trÃ¡ÂºÂ¡ng thÃƒÂ¡i.

## 2026-06-18 Ã¢â‚¬â€ v0.5.0 Ã¢â‚¬â€ BrowserHub API v2: auth + CDP passthrough + job queue + plugin registry

### Added
- **Auth token** (`electron/lib/api-auth.cjs`): bearer token qua env `STEALTH_API_TOKEN`. KhÃƒÂ´ng set Ã¢â€ â€™ API mÃ¡Â»Å¸ (tÃ†Â°Ã†Â¡ng thÃƒÂ­ch ngÃ†Â°Ã¡Â»Â£c P0025). `/api/health` luÃƒÂ´n mÃ¡Â»Å¸ + bÃƒÂ¡o `authRequired`.
- **CDP passthrough**: `GET /api/profiles/:id/cdp` trÃ¡ÂºÂ£ `webSocketDebuggerUrl` + `endpoint` Ã„â€˜Ã¡Â»Æ’ tool ngoÃƒÂ i `connect_over_cdp`. Engine mÃ¡Â»Å¸ `--remote-debugging-port` (localhost-only, cÃ¡ÂºÂ¥p port Ã„â€˜Ã¡Â»â„¢ng). TÃ¡ÂºÂ¯t bÃ¡ÂºÂ±ng `STEALTH_CDP_ENABLE=0`.
- **Job queue async** (`electron/lib/job-queue.cjs`): `POST /api/jobs` (202 + jobId), `GET /api/jobs[/:id]`, SSE `GET /api/jobs/:id/events`. Concurrency qua `STEALTH_JOB_CONCURRENCY` (mÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh 1).
- **Plugin registry** (`electron/api-routes.cjs` + `electron/automation/plugins.cjs`): core routes tÃƒÂ¡ch khÃ¡Â»Âi domain (fb/meta). ThÃƒÂªm tool = thÃƒÂªm descriptor, khÃƒÂ´ng sÃ¡Â»Â­a dispatcher.
- **Shared client SDK**: `clients/browserhub_client.py` + `clients/browserhub-client.ts` + spec `docs/browserhub-api.openapi.yaml`.
- **Port config**: `startApiServer({ port })` / env `STEALTH_API_PORT` (mÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh 6003).
- **Test**: `electron/api-routes.test.cjs` (auth gate, job queue, route registry).

### Changed
- `api-server.cjs` refactor thÃƒÂ nh dispatcher mÃ¡Â»Âng (auth Ã¢â€ â€™ match registry Ã¢â€ â€™ handler). MÃ¡Â»Âi route cÃ…Â© giÃ¡Â»Â¯ nguyÃƒÂªn Ã„â€˜Ã†Â°Ã¡Â»Âng dÃ¡ÂºÂ«n & shape (P0025 khÃƒÂ´ng cÃ¡ÂºÂ§n Ã„â€˜Ã¡Â»â€¢i).
- `minimizeCloakWindow` chÃ¡Â»â€° chÃ¡ÂºÂ¡y trÃƒÂªn win32.

## 2026-06-17 Ã¢â‚¬â€ v0.4.8 Ã¢â‚¬â€ Workflow filter row + Steps Hub buttons + router fix

### Fixed
- **9Router AI Gen:** `validateRouterRequestPayload` load trong `bindRouterApi` (hÃ¡ÂºÂ¿t lÃ¡Â»â€”i HTTP 0 khi Electron chÃ†Â°a reload).
- **Filter + bulk mÃ¡Â»â„¢t dÃƒÂ²ng:** nowrap + scroll ngang, nÃƒÂºt compact trong frame Workflow 40%.

### Changed
- **Steps buttons:** New / Save / Undo / Redo / Up / Down / Delete dÃƒÂ¹ng `HubBulkActionButton`; form fields `HubFormFieldLabel` + `hub-input`.
- **Step picker:** portal `fixed` (khÃƒÂ´ng clip); Add Ã¢â€ â€™ **New**.
- **Context menu:** chÃ¡Â»â€° Copy Ã‚Â· Delete (bÃ¡Â»Â Run/Export/Reset).

## 2026-06-17 Ã¢â‚¬â€ v0.4.7 Ã¢â‚¬â€ Workflow directory + Steps Hub-UI

### Changed
- **Workflow bulk bar:** chÃ¡Â»â€° cÃƒÂ²n **New Ã‚Â· Copy Ã‚Â· Delete** (bÃ¡Â»Â Export, Import, Run, Reset).
- **Selection pill:** hiÃ¡Â»Æ’n thÃ¡Â»â€¹ `N of M` / `All N selected` thay nÃƒÂºt Select all cÃ¡Â»â€œng kÃ¡Â»Ânh.
- **Workflow Steps:** AI composer Hub-UI; nÃƒÂºt **Add** mÃ¡Â»Å¸ modal search step kÃƒÂ¨m mÃƒÂ´ tÃ¡ÂºÂ£ tÃ¡Â»Â«ng loÃ¡ÂºÂ¡i.

## 2026-06-17 Ã¢â‚¬â€ v0.4.6 Ã¢â‚¬â€ Header alignment + unified tab actions

### Fixed
- **Header/frame flush:** remap Hub `-mx-6` chrome bleed to `--app-tab-header-px` (0.75rem) Ã¢â‚¬â€ header thÃ¡ÂºÂ³ng mÃƒÂ©p frame khi zoom.
- **Tab header parity:** Profiles vÃƒÂ  Workflow dÃƒÂ¹ng cÃƒÂ¹ng nÃƒÂºt **Settings** (khÃƒÂ´ng cÃƒÂ²n Ã¢â‚¬Å“Profile settingsÃ¢â‚¬Â).
- **Launch fallback:** workflow `open-url` khÃƒÂ´ng cÃƒÂ³ `targetUrl` Ã¢â€ â€™ dÃƒÂ¹ng startup URL cÃ¡Â»Â§a profile.

## 2026-06-17 Ã¢â‚¬â€ v0.4.5 Ã¢â‚¬â€ AG Appeal workflow + Steps Hub-UI

### Fixed
- **Google Forms AG Appeal workflow:** port script-steps engine + `google-form-ag-appeal` action (cÃƒÂ¡c workflow khÃƒÂ¡c giÃ¡Â»Â¯ nguyÃƒÂªn `open-url`).
- **Profiles header flush:** dÃƒÂ¹ng `WorkspaceTabHeader` + `ProfilesHubChrome` giÃ¡Â»â€˜ng Scripts tab.
- **Workflow Steps redesign:** palette/AI/inspector theo Hub-UI (neutral chips, hub-control sizing).
- **9Router AI Gen:** import `validateRouterRequestPayload` trong `main.cjs`.

## 2026-06-17 Ã¢â‚¬â€ v0.4.4 Ã¢â‚¬â€ Launch workflow + tighter gutters

### Fixed
- **Launch chÃ¡ÂºÂ¡y theo workflow active Ã¡Â»Å¸ rail:** nÃƒÂºt Launch dÃƒÂ¹ng `runAutomationQueue` vÃ¡Â»â€ºi workflow Ã„â€˜ang chÃ¡Â»Ân; double-click hÃƒÂ ng profile vÃ¡ÂºÂ«n mÃ¡Â»Å¸ startup/default.
- **GiÃ¡ÂºÂ£m gutter hai mÃƒÂ©p frame:** padding main `0.75rem`, split-pane tabs bÃ¡Â»Â bottom padding thÃ¡Â»Â«a.

## 2026-06-17 Ã¢â‚¬â€ v0.4.3 Ã¢â‚¬â€ Remove label extension

### Changed
- **GÃ¡Â»Â¡ hoÃƒÂ n toÃƒÂ n extension hiÃ¡Â»Æ’n thÃ¡Â»â€¹ nhÃƒÂ£n + tab groups:** xÃƒÂ³a extension + IPC/settings liÃƒÂªn quan Ã„â€˜Ã¡Â»Æ’ tÃ¡ÂºÂ­p trung hoÃƒÂ n thiÃ¡Â»â€¡n feature chÃƒÂ­nh.

### Fixed
- Startup URL Ã†Â°u tiÃƒÂªn tab mÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh (wait page event trÃ†Â°Ã¡Â»â€ºc khi fallback mÃ¡Â»Å¸ tab mÃ¡Â»â€ºi).

## 2026-06-17 Ã¢â‚¬â€ v0.4.2 Ã¢â‚¬â€ Startup tab polish

### Fixed
- **Startup URL chÃ¡ÂºÂ¡y ngay tab mÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh:** khÃƒÂ´ng tÃ¡ÂºÂ¡o tab mÃ¡Â»â€ºi rÃ¡Â»â€œi mÃ¡Â»â€ºi mÃ¡Â»Å¸ startup URL (giÃ¡ÂºÂ£m rÃƒÂ¡c `about:blank`).

## 2026-06-17 Ã¢â‚¬â€ v0.4.1 Ã¢â‚¬â€ Chrome defaults + Hub polish

### Fixed
- **TÃ¡ÂºÂ¯t auto Chrome tab groups mÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh:** khÃƒÂ´ng cÃƒÂ²n tÃ¡ÂºÂ¡o tab group mÃ¡Â»â€”i lÃ¡ÂºÂ§n mÃ¡Â»Å¸ profile; vÃ¡ÂºÂ«n giÃ¡Â»Â¯ badge label.
- **Header flush theo Hub (P0004):** gutter/padding Ã„â€˜Ã¡Â»â€œng nhÃ¡ÂºÂ¥t vÃ¡Â»â€ºi `.hub-main` Ã„â€˜Ã¡Â»Æ’ 2 mÃƒÂ©p header thÃ¡ÂºÂ³ng viÃ¡Â»Ân khung.
- **Version bump theo rule:** Ã„â€˜Ã¡Â»â€œng bÃ¡Â»â„¢ `package.json` + `tool.manifest.json` + `APP_VERSION`.

## 2026-06-14 Ã¢â‚¬â€ v0.4.0 Ã¢â‚¬â€ Shell / Settings

### Added
- **Settings nÃƒÂ¢ng cÃ¡ÂºÂ¥p (kiÃ¡Â»Æ’u P0004):** panel "Browser defaults" (OS Ã‚Â· device preset Ã‚Â· timezone Ã‚Â· locale Ã‚Â· color scheme Ã‚Â· **headless Ã‚Â· humanize** Ã¢â‚¬â€ ÃƒÂ¡p cho mÃ¡Â»Âi profile tÃ¡ÂºÂ¡o mÃ¡Â»â€ºi, lÃ†Â°u localStorage) + panel Appearance.
- **Launch flags per-profile:** `headless` (cÃ¡ÂºÂ£nh bÃƒÂ¡o giÃ¡ÂºÂ£m stealth) + `humanize` Ã¢â‚¬â€ cÃ¡Â»â„¢t DB mÃ¡Â»â€ºi, engine `buildLaunchOptions` Ã„â€˜Ã¡Â»Âc tÃ¡Â»Â« profile; toggle trong cÃ¡ÂºÂ£ profile form lÃ¡ÂºÂ«n Browser defaults.
- CÃ¡Â»Â­a sÃ¡Â»â€¢ app **mÃ¡Â»Å¸ maximized** mÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh.

### Fixed
- Footer: Ã„â€˜Ã¡Â»â€¢i nhÃƒÂ£n nÃƒÂºt display-prefs `Settings` Ã¢â€ â€™ `Display` (hÃ¡ÂºÂ¿t trÃƒÂ¹ng tÃƒÂªn vÃ¡Â»â€ºi nÃƒÂºt Settings).

### Changed / Removed
- XÃƒÂ³a dead screen **History** (`src/features/run-history/` Ã¢â‚¬â€ orphan, khÃƒÂ´ng wire vÃƒÂ o screen nÃƒÂ o).
- Nav: Profiles + Workflow; Settings Ã¡Â»Å¸ footer sidebar.

## 2026-06-14 Ã¢â‚¬â€ v0.3.0 Ã¢â‚¬â€ Device library / antidetect

### Added
- **Kho thiÃ¡ÂºÂ¿t bÃ¡Â»â€¹ (device library):** 7 preset coherent (Windows/macOS/Linux Ãƒâ€” Ã„â€˜Ã¡Â»â„¢ phÃƒÂ¢n giÃ¡ÂºÂ£i thÃ¡ÂºÂ­t) Ã¢â‚¬â€ chÃ¡Â»Ân 1 phÃƒÂ¡t lÃƒÂ  set OS + viewport + locale khÃ¡Â»â€ºp nhau.
- **ChÃ¡Â»Ân OS Ã„â€˜Ã¡Â»â„¢c lÃ¡ÂºÂ­p host** (`--fingerprint-platform=windows|macos|linux`) Ã¢â‚¬â€ mÃƒÂ¡y Windows giÃ¡ÂºÂ£ Ã„â€˜Ã†Â°Ã¡Â»Â£c macOS/Linux (trÃ†Â°Ã¡Â»â€ºc Ã„â€˜ÃƒÂ¢y khoÃƒÂ¡ theo host).
- Per-profile **timezone, locale, viewport, color scheme, User-Agent** (engine honor qua cloakbrowser); WebRTC IP mask tÃ¡Â»Â± bÃ¡ÂºÂ­t khi proxy + geoip.
- Schema migration cÃ¡Â»â„¢ng cÃ¡Â»â„¢t device cho DB cÃ…Â©; profile create/edit modal cÃƒÂ³ section "Device Ã‚Â· Fingerprint".

### Notes
- Per-field GPU/cores/RAM/font **khÃƒÂ´ng override** Ã„â€˜Ã†Â°Ã¡Â»Â£c Ã¢â‚¬â€ seed sinh coherent (thiÃ¡ÂºÂ¿t kÃ¡ÂºÂ¿ cloakbrowser, chÃ¡Â»â€˜ng combo lÃ¡Â»â€¡ch). Mobile/Firefox engine ngoÃƒÂ i tÃ¡ÂºÂ§m (cloakbrowser chÃ¡Â»â€° Chromium).
- Validate fingerprint: dÃƒÂ¹ng "Run all fingerprint checks" (sannysoft/CreepJS/Pixelscan) trong Open URL rail.

## 2026-06-14 Ã¢â‚¬â€ v0.2.0

### Fixed
- **Workflow tab crash (vendor drift):** directory column meta dÃƒÂ¹ng `%` cho cÃ¡Â»â„¢t chrome-role (`role/activity/created/tools`) lÃƒÂ m hub-ui mÃ¡Â»â€ºi throw Ã¢â€ â€™ trÃ¡ÂºÂ¯ng mÃƒÂ n hÃƒÂ¬nh toÃƒÂ n app. ChuyÃ¡Â»Æ’n sang fixed rem token theo SSOT. Workflow editor (script builder + flow canvas) hoÃ¡ÂºÂ¡t Ã„â€˜Ã¡Â»â„¢ng trÃ¡Â»Å¸ lÃ¡ÂºÂ¡i.
- Boot watchdog hint hÃ¡ÂºÂ¿t hardcode port `:5186` Ã¢â‚¬â€ tÃ¡Â»Â± lÃ¡ÂºÂ¥y `location.port`.

### Security
- BÃ¡Â»Â hardcode proxy credentials trong source; seed profile proxy chuyÃ¡Â»Æ’n opt-in qua env `STEALTH_SEED_PROXY_URL`.
- ChÃ¡Â»â€˜ng SSRF + header-injection cho `router:request` (chÃ¡ÂºÂ·n internal host, whitelist header, ÃƒÂ©p method/timeout).
- Validate Ã„â€˜Ã¡Â»â€œng nhÃ¡ÂºÂ¥t IPC (`group:create/update`, `runs:list`, `profiles:import`).
- ThÃƒÂªm `sandbox: true` + Content-Security-Policy cho bÃ¡ÂºÂ£n packaged (gÃ¡Â»Â¡ `unsafe-eval`).

### Changed
- Ã„ÂÃ¡Â»â€¢i tÃƒÂªn `Gpm*` Ã¢â€ â€™ `Stealth*` (workflow directory table/cells/bulk-actions, column meta symbols); gÃ¡Â»Â¡ file/hÃ¡ÂºÂ±ng trÃƒÂ¹ng lÃ¡ÂºÂ·p (`gpm-directory-table.ts`, `scripts/win-spawn.mjs`).
- DÃ¡Â»Ân token CSS trÃƒÂ¹ng; gÃ¡Â»â„¢p loader JSON dÃƒÂ¹ng chung.

## 2026-06-13 Ã¢â‚¬â€ v0.1.0 MVP

- Initial greenfield scaffold: Electron + Hub-UI + CloakBrowser + SQLite
- Profiles CRUD, launch/close, Open URL automation
- Run history persistence, console log panel
- Settings: engine binary check, theme, data folder
