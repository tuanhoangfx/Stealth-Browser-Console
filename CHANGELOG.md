# Changelog — P0003 Stealth Browser Console

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
