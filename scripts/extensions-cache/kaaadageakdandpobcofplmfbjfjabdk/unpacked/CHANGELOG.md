# Changelog

## 2026-11-12 - Preserve CWS published and submitted version exports in sync-p0020-cws-badge

- Version: `1.2.37`
- Timestamp: 2026-11-12 16:32 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Aligned scripts/sync-p0020-cws-badge.mjs with P0020 sync-extension-version.mjs so EXTENSION_CWS_PUBLISHED_VERSION and EXTENSION_CWS_SUBMITTED_VERSION are never stripped.

### Verification

- node Extension/E0001-cookie-bridge/scripts/sync-p0020-cws-badge.mjs + tsc-baseline-gate P0020

---
## 2026-11-12 - Declarative GOOGLE_OSID_APP_DOMAINS SSOT & CWS API v2 Auto-Submit Queue

- Version: `1.2.36`
- Timestamp: 2026-11-12 15:36 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Generalize Google Subdomain OSID Adapter across Google Flow, Google AI Studio, NotebookLM, and Firebase Studio; upgrade Chrome Web Store API to v2 with automatic queued submission.

### Verification

- pnpm --dir Extension/E0001-cookie-bridge test

---
## 2026-11-12 - Google Flow (flow.google.com) host-only OSID, login guard, bulk load & brand SSOT

- Version: `1.2.35`
- Timestamp: 2026-11-12 14:00 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Harden host-only OSID / __Secure-OSID & __Host-1PLSID cookie writes on flow.google.com and accounts.google.com, block unauthenticated first-time Google/Flow visitor vaults, preserve .google.com cookies during Direct Bulk Load of .flow.google.com, detect App Router account identity on + New, and sync Google Flow brand match for flow.google.com.

### Verification

- pnpm --dir Extension/E0001-cookie-bridge test

---
## 2026-11-11 - Align popup icons with labels, default 2 Route filters, and add + New active-session route button

- Version: `1.2.34`
- Timestamp: 2026-11-11 19:49 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Port Hub-UI color emoji + [data-icon] flex centering so filter/header/button icons align optically with text labels; show 2 labeled Route filters (Platform, Role) by default; fit Loaded header inside 800px popup viewport; add + New button (active-session-route.js) to auto-detect active tab website + logged-in account and create & sync Cloud route in 1 click.

### Verification

- pnpm --dir Extension/E0001-cookie-bridge test + pnpm --dir Extension/E0002-browser-operator test + hub-ui-icon-parity-check

---
## 2026-11-11 - Bulk Sync & Load toolbar on Routes table with Direct Mode batch fallback

- Version: `1.2.33`
- Timestamp: 2026-11-11 18:49 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Added Hub-UI Bulk Sync (N) and Load (N) actions on Routes Row 2, compact icon-only Route filter triggers, and syncMultipleBindingsDirectFromPopup + applyMultipleVaultsDirectFromPopup Direct Mode batch fallback.

### Verification

- pnpm --dir Extension/E0001-cookie-bridge test

---
## 2026-11-11 - Shared sync-engine-core SSOT, Direct Mode header recovery, and store package test gate

- Version: `1.2.32`
- Timestamp: 2026-11-11 17:57 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Unify cookie/tab/guard/vault engine into sync-engine-core.js across background.js and popup-direct-ops.js, add Direct Mode header badge with 1-click worker reload in popup, and enforce unit/fallback/DOM regression suites in package-store.ps1 and run-tests.mjs

### Verification

- powershell -NoProfile -ExecutionPolicy Bypass -File Extension/E0001-cookie-bridge/scripts/package-store.ps1

---
## 2026-11-11 - Direct popup Sync/Load fallback and syncAll status fix

- Version: `1.2.31`
- Timestamp: 2026-11-11 17:22 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Add popup-direct-ops fallback for Sync, Load, Open site, and cloud vault status hydration when MV3 Service Worker transport is unavailable, and fix syncAll boolean/error clobbering and per-route status scoping in background.js

### Verification

- node Extension/E0001-cookie-bridge/scripts/test-popup-direct-sync-fallback.mjs; node Extension/E0001-cookie-bridge/scripts/test-popup-dom-ssot.mjs

---
## 2026-11-11 - Auto-refresh expired JWT on light popup status & direct popup auth fallback

- Version: `1.2.30`
- Timestamp: 2026-11-11 15:05 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Auto-refresh expired Hub/Data Box JWTs on popup hydration and GET_STATUS light probes, add direct popup sign-in/cloud-route fallback when MV3 SW transport is unavailable, guard hot-reload during active runtime ops, and coalesce UI tick storage writes.

### Verification

- node --check + verifyExtensionPopupDom + Stealth #0004 headless smoke

---
## 2026-11-11 - Vault Realtime Secondary Socket Heartbeats

- Version: `1.2.29`
- Timestamp: 2026-11-11 02:49 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Sent Phoenix heartbeats across all secondary vaultSockets (>50 routes) to prevent 60s idle disconnects.

### Verification

- node Tool/scripts/verify-extension-packages-ssot.mjs

---
## 2026-11-10 - Google Flow (`flow.google.com`) SSO + Passive OSID Handshake + Logged-Out Sync Guard + SPA Identity Badge

- Version: `1.2.28`
- Timestamp: 2026-11-10 22:55 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Added dedicated `flow.google.com` / `.flow.google.com` route support (`isGoogleFlowDomain`, `googleFlowSessionUrl`, `googleFlowPassiveLoginUrl`, `shouldForceNavigateGoogleFlowTab`, `hasGoogleFlowOsidCookie`): unions `.google.com` + `.flow.google.com` + `.labs.google`, prevents hijacking `flow.google.com` tabs to Gmail (`mail.google.com`), escapes `/about?pli=1` marketing redirect to `https://flow.google.com/?pli=1`, and automatically performs passive `accounts.google.com/ServiceLogin?passive=1209600&osid=1&continue=https%3A%2F%2Fflow.google.com%2F%3Fpli%3D1` handshake when `OSID@flow.google.com` is missing.
- Implemented Logged-Out Cloud Vault Sync Guard in `syncBindingWithVault` so clicking Sync on a logged-out `.elevenlabs.io`, `.google.com`, or `.flow.google.com` tab never overwrites an existing authenticated Cloud Vault with marketing/analytics cookies.
- Surfaced SPA Auth Identity (`storageEmail` / `storageUid` badge + `+SPA` storage count) in Popup Routes & Cookies directory tabs (`popup.js`, `site-cookie-cleaner.js`, `site-auth-storage.js`).

### Verification

- `node Extension/E0001-cookie-bridge/scripts/test-domain-routes.mjs` + `node Extension/E0001-cookie-bridge/scripts/test-popup-dom-ssot.mjs` + live Stealth headless `#9840` verification on `https://flow.google.com/?pli=1`

---
## 2026-11-10 - SPA Auth Storage Sync/Load (Firebase IndexedDB + Web Storage) for ElevenLabs

- Version: `1.2.27`
- Timestamp: 2026-11-10 21:50 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Added `site-auth-storage.js` to capture and restore SPA Web Storage (`localStorage`, `sessionStorage`) and Firebase Auth IndexedDB (`firebaseLocalStorageDb` -> `firebaseLocalStorage`) with automatic `securetoken.googleapis.com` `refresh_token` -> `accessToken` renewal on Load.
- Wired `storage` payload through `vault-crypto.js`, `vault-api.js`, `background.js`, and `site-cookie-cleaner.js` so ElevenLabs (`.elevenlabs.io`) and other Firebase/SPA routes sync and load seamlessly alongside HTTP cookies.
- Updated `domain-routes.js` (`siteUrlForDomain`, `shouldForceNavigateElevenLabsTab`) to navigate ElevenLabs tabs to `https://elevenlabs.io/app` after Load.

### Verification

- `node Extension/E0001-cookie-bridge/scripts/test-domain-routes.mjs` + `node Extension/E0001-cookie-bridge/scripts/test-popup-dom-ssot.mjs` + live cloud vault update & decryption test for `167c10dd-ee5c-4a6a-bf73-ad38f16e0b4f` (`d2n86@outlook.com`)

---
## 2026-11-10 - Instant reload-nonce broadcast listener & 15s hot-reload polling

- Version: `1.2.26`
- Timestamp: 2026-11-10 18:18 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Added e0001-stealth-reload-nonce-v1 check in checkAndHotReloadFromStealthConsole so clicking Reload Open Profiles in P0003 triggers immediate chrome.runtime.reload().

### Verification

- POST /api/extensions/reload-open + live Chromium reload test

---
## 2026-11-10 - Self-healing atomic stage sync & auto-pin across Stealth profiles

- Version: `1.2.25`
- Timestamp: 2026-11-10 17:51 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Synced build-info.js v1.2.25 and hardened unpacked cache/stage against 0-byte truncation during concurrent profile opens.

### Verification

- verifyExtensionPopupDom + headless 9xxx smoke

---
## 2026-11-05 - Auto hot-reload E0001 Service Worker when P0003 stages a newer extension version

- Version: `1.2.24`
- Timestamp: 2026-11-05 18:09 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Poll :6003/api/extensions on startup, GET_STATUS, and 60s interval to auto-reload E0001 when stageVersion/workspaceVersion exceeds manifest version

### Verification

- node Tool/P0020-Data-Box/scripts/sync-extension-version.mjs

---
## 2026-11-05 - Sync Server TOTP Clock Offset & RFC 6238 Generator into E0001 Extension

- Version: `1.2.23`
- Timestamp: 2026-11-05 17:39 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Added totp-clock.js to E0001-cookie-bridge sharing p0020_totp_clock_offset_ms_v1 across localStorage and chrome.storage.local, relayed live offset from P0020/P0022 tabs via content-bridge.js, exposed SYNC_TOTP_CLOCK and GENERATE_TOTP_CODE in background.js, and aligned isJwtExpired with totpNowMs().

### Verification

- verifyExtensionPopupDom OK + RFC 6238 vector & live /api/quota-time parity verified

---
## 2026-11-03 - Add verifyExtensionPopupDom headless DOM & geometry test

- Version: `1.2.22`
- Timestamp: 2026-11-03 13:51 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Add scripts/test-popup-dom-ssot.mjs powered by verifyExtensionPopupDom (loopback HTTP + MV3 chrome mock + 8s hard watchdog) to verify Searchbar Row 1/Row 2 31px SSOT, F shortcut, and Cookie table geometry in ~1.2s without MV3 Service Worker CDP hangs.

### Verification

- node Extension/E0001-cookie-bridge/scripts/test-popup-dom-ssot.mjs && node Extension/E0001-cookie-bridge/scripts/validate-store-package.mjs

---
## 2026-11-03 - Compact Site Column, 2 Default Cookie Filters & Shared Filter Dropdown Renderer

- Version: `1.2.21`
- Timestamp: 2026-11-03 13:24 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Reduced Site column width in Cookie tab (10.5rem) so Site, Status, Actions, and Cookies are fully visible without clipping, displayed 2 default filters (Platform & Status) on Cookie filter bar so bulk buttons never overlap filters, and unified renderFilterDropdown + renderCookieFilterDropdown into renderSharedFilterDropdown.

### Verification

- node --check popup.js + test-user-modal-login-ssot.mjs + validate-store-package.mjs

---
## 2026-11-03 - Unify Cookie Tab Buttons, Filter Dropdowns & Horizontal Scroll Table SSOT with Routes Tab

- Version: `1.2.20`
- Timestamp: 2026-11-03 05:53 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Removed all custom size/width/overflow overrides on #cookie-table-wrap and table.cookie-jar-table so Cookie tab shares 100% the same table.routes-table layout, horizontal scrollbar, column widths, .route-action button dimensions (Copy/Update/Clear), and labeled .filter-dd-trigger dropdown buttons as Routes tab.

### Verification

- node --check popup.js + test-user-modal-login-ssot.mjs + validate-store-package.mjs

---
## 2026-11-03 - Cookie Tab Column Order (Status after Site), Anti-Overlap Widths & Auth-Priority Expiry

- Version: `1.2.19`
- Timestamp: 2026-11-03 05:42 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Moved Status column right after Site in #cookie-jar-table, rebalanced fixed column widths (Actions 174px, Cookies 88px, Scope 74px, Status 68px, Expires 58px) with strict ellipsis overflow so buttons/cells never overlap, fixed Active status icon key, and prioritized HttpOnly/Auth cookie expiration for Expires column.

### Verification

- node --check popup.js + site-cookie-cleaner.js + validate-store-package.mjs

---
## 2026-11-03 - Hub-UI searchbar & compact filter row SSOT

- Version: `1.2.18`
- Timestamp: 2026-11-03 04:20 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Collapse Cookie tab filter triggers (iconOnlyTrigger SSOT) so Bulk Actions fit on the same Row 2 without wrapping, standardize HubSearchField + HubResultCount + HubFilterClearBtn across Routes and Cookie tabs, and fix Cookie table column overlap.

### Verification

- node scripts/test-user-modal-login-ssot.mjs && node scripts/validate-store-package.mjs + P0003 #9992 headless geometry check

---
## 2026-11-03 - Cookie tab Export/Update JSON, session UID hints & infi28.com parity

- Version: `1.2.17`
- Timestamp: 2026-11-03 03:42 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Add per-site Copy (Cookie-Editor JSON export), Update/Import JSON & name=value dialog, session/UID badges & Signed-in filter on Cookie tab; update remaining infi.io.vn endpoints/docs to infi28.com.

### Verification

- node Extension/E0001-cookie-bridge/scripts/test-user-modal-login-ssot.mjs + validate-store-package.mjs + P0003 live headless smoke

---
## 2026-11-03 - Settings modal zoom SSOT & Cookie Site Directory table (1 row per site, filters, bulk clear)

- Version: `1.2.16`
- Timestamp: 2026-11-03 01:01 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Moved Display Zoom (90% / 100% / 110% / 120%) out of Sidebar Footer into Settings modal per hub-header-footer-chrome-ssot; removed #current-site-bar and #cookie-open-tabs-chips from Cookie tab; rebuilt Cookie tab as a full Site Directory table (1 row per site domain with checkbox selection, Platform/Tab/Scope/Cookies filters, Clear Selected bulk action, and Clear Active Tab action).

### Verification

- node Extension/E0001-cookie-bridge/scripts/test-user-modal-login-ssot.mjs + validate-store-package.mjs

---
## 2026-11-03 - Add dedicated Cookie tab for no-login site cookie cleaner and sync build-info timestamp

- Version: `1.2.15`
- Timestamp: 2026-11-03 00:30 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Added dedicated Cookie sidebar tab (#tab-panel-cookie) for local site cookie & web storage inspection and 1-click clearing without login while keeping Routes tab 100% unchanged; fixed version-sync-lib.cjs to stamp build-info.js updated ISO+07:00 timestamp and auto-sync P0020 extensionBuildInfo.ts.

### Verification

- node Extension/E0001-cookie-bridge/scripts/test-domain-routes.mjs; node Extension/E0001-cookie-bridge/scripts/test-user-modal-login-ssot.mjs; node Tool/scripts/check-version-sync.mjs

---
## 2026-11-02 - Clear Current Site Cookies without Login

- Version: `1.2.14`
- Timestamp: 2026-11-02 23:49 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Add 1-click Clear Site Cookies bar and per-route Clear action (supporting multi-domain SSO families like Adobe, Outlook/Microsoft, Google, Claude, ChatGPT, Facebook, CHIPS partitioned cookies, and web storage) usable immediately without signing in.

### Verification

- node Extension/E0001-cookie-bridge/scripts/test-domain-routes.mjs; node Extension/E0001-cookie-bridge/scripts/test-user-modal-login-ssot.mjs; node Extension/E0001-cookie-bridge/scripts/validate-store-package.mjs; node Tool/scripts/hub-auth-gate-parity-check.mjs

---
## 2026-10-29 - Wire Account modal password Save and dual-plane mirror password sync

- Version: `1.2.13`
- Timestamp: 2026-10-29 22:23 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Bind #user-modal-save in hub-workspace-user-modal.js and popup.js to update Hub + Data Box password via updateExtensionUserPassword, and auto-sync Data Box mirror password via /hub/auth/sync-mirror-password during sign-in fallback.

### Verification

- node --check auth-session.js hub-workspace-user-modal.js popup.js

---
## 2026-10-28 - Align Chrome MV3 manifest & package lean GitHub Release ZIP asset

- Version: `1.2.12`
- Timestamp: 2026-10-28 21:31 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/E0001-cookie-bridge/releases/tag/v1.2.12

### Changes

- Synced manifest.json/build-info.js with package.json via version-sync-lib.cjs and packaged traced runtime files into GitHub Release ZIP asset.

### Verification

- node Tool/scripts/package-extension-release.mjs --code E0001

---
## 2026-10-28 - Cutover E0001 Cookie Bridge to *.infi28.com

- Version: `1.2.11`
- Timestamp: 2026-10-28 19:14 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://github.com/tuanhoangfx/E0001-cookie-bridge/releases/tag/v1.2.11

### Changes

- Update manifest.json, supabase-config.js, content-bridge.js, auth-session.js, background.js, popup.js, options.js, and vendor hub-resolve-login to default to *.infi28.com while preserving *.infi.io.vn compatibility.

### Verification

- node Tool/scripts/sync-hub-identity-vendor.cjs --check

---
## 2026-10-27 - Auto-discover runtime import graph in package-store.ps1 via validate-store-package.mjs --print-files

- Version: `1.2.10`
- Timestamp: 2026-10-27 19:51 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Added --print-files and manifest entry point discovery to validate-store-package.mjs, and wired package-store.ps1 to automatically merge all traced runtime files into the Chrome Web Store package.

### Verification

- powershell -NoProfile -ExecutionPolicy Bypass -File Extension/E0001-cookie-bridge/scripts/package-store.ps1

---
## 2026-10-27 - Include cookie-share-panel.js in Chrome Web Store package and publish to CWS

- Version: `1.2.9`
- Timestamp: 2026-10-27 18:51 (UTC+7)
- Type: Patch
- Status: Verified

### Changes

- Added cookie-share-panel.js to package-store.ps1 runtime file allowlist so store package dependency validation passes and E0001 can be packaged and published to Chrome Web Store.

### Verification

- powershell -NoProfile -ExecutionPolicy Bypass -File Extension/E0001-cookie-bridge/scripts/package-store.ps1

---
## 2026-09-23 - Patch bump for completed agent task

- Version: `1.2.8`
- Timestamp: 2026-09-23 16:34 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-09-03 - Patch bump for completed agent task

- Version: `1.2.7`
- Timestamp: 2026-09-03 16:25 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.2.6`
- Timestamp: 2026-08-20 10:52 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - CWS publish above live Store 1.2.4 + package-store assets

- Version: `1.2.5`
- Timestamp: 2026-08-20 10:43 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://databox.infi.io.vn/cookie

### Changes

- Bump past Chrome Web Store live 1.2.4; include hub-shell/zoom lite + options-theme in store ZIP.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.1.36`
- Timestamp: 2026-08-20 10:24 (UTC+7)
- Type: Patch
- Status: Verified
- Release: https://databox.infi.io.vn/cookie

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.1.35`
- Timestamp: 2026-08-20 10:09 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.1.34`
- Timestamp: 2026-08-20 09:00 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.1.33`
- Timestamp: 2026-08-20 08:57 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.1.32`
- Timestamp: 2026-08-20 08:40 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.1.31`
- Timestamp: 2026-08-20 08:35 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.1.30`
- Timestamp: 2026-08-20 08:28 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.1.29`
- Timestamp: 2026-08-20 08:24 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.1.28`
- Timestamp: 2026-08-20 08:12 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.1.27`
- Timestamp: 2026-08-20 07:46 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
## 2026-08-20 - Patch bump for completed agent task

- Version: `1.1.26`
- Timestamp: 2026-08-20 07:42 (UTC+7)
- Type: Patch
- Status: Draft

### Changes

- Automatic patch bump after completed E0001 task.

### Verification

- pending

---
# Changelog — E0001-cookie-bridge

> **Ship keywords:** `Git E0001` · `Push E0001` · `Release E0001`  
> **Template:** `E:\Dev\Rules\templates\tool-docs\CHANGELOG_ENTRY_TEMPLATE.md`  
> **Script:** `powershell -File E:\Dev\Tool\scripts\ship-product.ps1 -Code E0001 -Keyword Push`

## 2026-07-16 - Fix owner Sync blocked (dual-plane user id)

- Version: `1.1.25`
- Timestamp: 2026-07-16 14:20 (UTC+7)
- Type: Patch
- Product: E0001
- Prompt: Đúng owner nhưng vẫn không sync được
- Status: Verified

### Changes

- **Owner match** — route owner on sb-api `user_id`; popup was comparing hub-api identity id → false "Owner only".
- **`route-access.js`** — shared owner check: data user id, hub id fallback, email fallback.
- **GET_STATUS** — expose `dataUserId` + prefer sb-api id for route permissions.

## 2026-07-15 - CWS submit v1.1.24 + Claude.ai icon fan-out

- Version: `1.1.24`
- Timestamp: 2026-07-15 01:20 (UTC+7)
- Type: Release
- Product: E0001 + hub-ui + P0020
- Prompt: ok 2 3 (fan-out icons + CWS package/submit)
- Status: Verified

### Changes

- **Fan-out** Claude.png (quality) → P0003/P0004/P0005/P0006/P0016/P0020/E0001; registry `faviconDomain=claude.ai`.
- **CWS** — packaged `E0001-cookie-bridge-store-v1.1.24.zip`, API upload+publish **OK**; listing `crxVersion=1.1.24` published.
- Store screenshot/promo assets 1280×800 + 440×280 regenerated.

## 2026-07-15 - Claude icon for claude.ai

- Version: `1.1.24`
- Timestamp: 2026-07-15 01:00 (UTC+7)
- Type: Patch
- Product: E0001 + hub-ui + P0020
- Prompt: sửa icon Claude hiện cho Claude.ai (trước là Claude.com)
- Status: Done

### Changes

- **hub-brand-icons** — `faviconDomain` Claude → `claude.ai`; `faviconDomains` gồm `.ai` / `.com` / `anthropic.com`.
- **sync-cookie-brand-icons** — build match OR từ `faviconDomains` → extension icon cho cả Claude.ai và Claude.com.

## 2026-07-15 - Claude Load: toast domain + cookie family

- Version: `1.1.24`
- Timestamp: 2026-07-15 00:45 (UTC+7)
- Type: Patch
- Product: E0001 + P0020
- Prompt: Load Claude toast facebook.com; vault 0 dù Sync; ok 3
- Status: Done

### Changes

- **Toast Load** — không hardcode `facebook.com`; hint theo domain route (`claude.ai` cho Claude family).
- **Claude cookie family** — Sync/Load `.claude.com` cũng đọc/ghi `.claude.ai` + `.anthropic.com` (`sessionKey`).
- **Open site** — Claude → `https://claude.ai/`; empty vault error rõ ràng hơn.
- **Load filter** — ưu tiên `bindingKey` (một route), không chỉ `noteId`.
- **P0020** — `cookieBridge.applySql` → `APPLY_ALL_DATABOX_API.sql` (file SSOT thật).

## 2026-07-14 - Ready scan icon + header icon SSOT

- Version: `1.1.23`
- Timestamp: 2026-07-14 02:45 (UTC+7)
- Type: Patch
- Product: E0001 + hub-ui + P0020
- Prompt: Ready vs OK khác gì; đổi icon Ready; ok 1 2 3
- Status: Done

### Changes

- **Ready** — icon `scan` (probe jar), xanh lam; **OK** — `check` xanh lá sau probe thành công.
- **`COOKIE_BRIDGE_ROUTE_TABLE_HEADER_ICONS`** — thead icon từ SSOT, không hardcode HTML.
- **Parity gate** — assert `HUB_ROUTE_STATUS_ICON_SVGS` + vendor sync; refresh P0020 hub-ui vendor.

## 2026-07-14 - Ready xanh lam + Loaded icon + icon SSOT

- Version: `1.1.22`
- Timestamp: 2026-07-14 02:40 (UTC+7)
- Type: Patch
- Product: E0001 + hub-ui + P0020
- Prompt: Ready icon+màu xanh lam; sửa Loaded icon bị che; ok 1 2 3
- Status: Done

### Changes

- **Ready** — icon `loader` (radiating lines), màu `#38bdf8` (xanh lam).
- **Loaded header** — icon `download` thay `clock`; `thead/th` overflow visible; cột rộng 80px.
- **`hub-route-status-icons-vanilla.mjs`** — SSOT SVG status icons; golden preview legend; P0020 chip tone từ vanilla.

## 2026-07-14 - Status icon/màu riêng từng trạng thái

- Version: `1.1.21`
- Timestamp: 2026-07-14 02:35 (UTC+7)
- Type: Patch
- Product: E0001 + hub-ui + P0020
- Prompt: đổi icon và màu khác nhau cho mỗi status; icon không vòng tròn bao ngoài
- Status: Done

### Changes

- **4 tone riêng** — `ready` (amber/hourglass), `ok` (green/check), `empty` (violet/database), `error` (red/alertTriangle).
- **Icon không circle** — bỏ checkCircle2/alertCircle/clock có `<circle>`; dùng glyph path-only.
- **P0020** — `RouteSyncChip` lucide map + vitest cập nhật.

## 2026-07-14 - Column header hints SSOT + Synced column fix

- Version: `1.1.20`
- Timestamp: 2026-07-14 02:30 (UTC+7)
- Type: Patch
- Product: E0001 + hub-ui
- Prompt: Tiêu đề cột Tooltip SSOT; Synced không bị che; ok 1 2 3
- Status: Done

### Changes

- **`HubDirectoryColumnHint` vanilla** — `hub-directory-column-hint-vanilla.mjs` + `hub-directory-popover-vanilla.mjs`; all 7 column headers wired with rich popover.
- **Synced/Loaded** — stale label `dd/mm/yy` (hub activity SSOT); `overflow: visible`; typography 10px / gap 5px.
- **`hub-route-status-label`** — ported to `hub-directory-table.css`; parity gate marker.

## 2026-07-14 - Status icon+label (no badge pill)

- Version: `1.1.19`
- Timestamp: 2026-07-14 02:15 (UTC+7)
- Type: Patch
- Product: E0001
- Prompt: Status không cần badge — chỉ icon + nhãn SSOT, không che dữ liệu
- Status: Done

### Changes

- **`hub-route-status-label`** — parity `HubUsersStatusLabel`: inline icon + text, không pill/border/background.
- **`.col-status`** — rộng 78px, `overflow: visible` tránh cắt label.

## 2026-07-14 - Role tokens + verify gate vanilla sync

- Version: `1.1.18`
- Timestamp: 2026-07-14 01:50 (UTC+7)
- Type: Patch
- Product: E0001 + hub-ui + P0020
- Prompt: ok 1 2 3 — gate vanilla sync, role icon tokens, P0020 health SSOT
- Status: Done

### Changes

- **`--hub-role-icon-*` tokens** — hub-theme-tokens.css + popup-theme + hub-auth-gate.css parity.
- **`agent-verify-gate`** — `extension-vanilla-sync` acceptance item (E0001/P0020).
- **P0020** — `RouteSyncChip` icons from vanilla SSOT via `extension-route-health-display.ts`.

## 2026-07-13 - Vanilla SSOT hub-ui + HubAuthLogoutChip role icon

- Version: `1.1.17`
- Timestamp: 2026-07-13 23:45 (UTC+7)
- Type: Patch
- Product: E0001 + hub-ui
- Prompt: ok 1 2 3 — gom chip SSOT, golden preview, role icon parity
- Status: Done

### Changes

- **`packages/hub-ui/src/lib/*-vanilla.mjs`** — SSOT role icon + route status chip; sync script `sync-hub-vanilla-e0001.mjs`.
- **E0001 `hub-vanilla/`** — fan-out từ hub-ui; wrappers re-export.
- **`HubAuthLogoutChip.tsx`** — `roleKey` + crown/shield/userRound (parity E0001 + sidebar).
- **`hub-auth-gate-golden-preview.html`** — admin crown + status chips section.

## 2026-07-13 - Status chip + header role icon (Hub SSOT)

- Version: `1.1.16`
- Timestamp: 2026-07-13 23:10 (UTC+7)
- Type: Patch
- Product: E0001
- Prompt: Chuẩn hóa cột Status (icon+label); xóa nhãn Signed in; icon role cạnh email header
- Status: Done

### Changes

- **Status column** — `hub-route-status-chip.js`: chip icon+label parity P0020 `RouteStatChip` (Ready/OK/0 jar/Error).
- **Header** — xóa badge "Signed in"; role icon (crown/shield/userRound) theo `profiles.role` như sidebar P0020.
- **`hub-auth-logout-chip.js`** — nhận `roleKey` + `renderIconHtml`, bỏ session badge.

## 2026-07-13 - Modal close rotate (hub-modal SSOT)

- Version: `1.1.15`
- Timestamp: 2026-07-13 22:58 (UTC+7)
- Type: Patch
- Product: E0001
- Prompt: Nút X không xoay như P0020
- Status: Done

### Changes

- **`.hub-modal-close`** — copy hover/active từ `packages/hub-ui/src/styles/hub-modal.css`: `rotate(90deg) scale(1.06)` + spring transition.

## 2026-07-13 - User modal icon colors + profiles.role SSOT

- Version: `1.1.14`
- Timestamp: 2026-07-13 22:45 (UTC+7)
- Type: Patch
- Product: E0001
- Prompt: Modal không giống 100% Data Box — icon không màu, role sai; rà soát DB chuẩn mới
- Status: Done

### Changes

- **Icon colors** — parity `HubWorkspaceUserModal` FIELD_ICON_CLASS (sky/indigo/amber/emerald/violet/slate).
- **Role SSOT** — fetch `profiles.role` + `/auth/v1/user` from **hub-api** (identity plane), not JWT default `user`.
- **`hub-workspace-profile-role.js`** — port fetch logic from hub-ui `workspace-profile-role.ts`.
- Sign-in caches profile fields on identity + data sessions.

### Verification

- `sync-e0001-databox --check` OK (`sb-api.infi.io.vn`)
- Reload extension → User modal shows Admin + crown (colored) for admin profiles

## 2026-07-13 - User modal Data Box parity (no scrollbar)

- Version: `1.1.13`
- Timestamp: 2026-07-13 18:30 (UTC+7)
- Type: Patch
- Product: E0001
- Prompt: Modal cùng code Databox 100%, không cần thanh kéo
- Status: Done

### Changes

- **HubWorkspaceUserModal parity** — fields Email · Role · Provider · Created · Last sign in | User ID · Note; footer Sign Out only (centered).
- **No inner scrollbar** — remove 14rem scroll cap + `scrollbar-gutter: stable`; fit-to-content shell.
- Persist Auth user profile fields on sign-in/refresh for Created / Last sign in / Role.

### Verification

- Golden preview: `needsScroll=false`, `overflowY=visible`
- Auth gate parity markers still pass

### Rollback

```powershell
cd E:\Dev\Extension\E0001-cookie-bridge
git checkout v1.1.12 -- hub-workspace-user-modal.css hub-workspace-user-modal.js popup.html popup.js background.js auth-session.js manifest.json build-info.js
```

## 2026-07-13 - User modal Hub SSOT overlay

- Version: `1.1.12`
- Timestamp: 2026-07-13 18:15 (UTC+7)
- Type: Patch
- Product: E0001
- Prompt: User modal detail chèn vào frame — chuyển modal Hub SSOT overlay
- Status: Done

### Changes

- **User modal overlay** — port Hub SSOT `.modal-backdrop { position: fixed; inset: 0 }` (+ shell/header/body) vào `hub-workspace-user-modal.css` để không còn render in-flow trong popup 800×500.
- Compact tokens giữ `--hub-modal-max-w: 28rem` / max-h 460px cho extension shell.
- Parity gate: assert `position: fixed` trên user-modal CSS.

### Verification

- `hub-auth-gate-parity-check.mjs` markers include `position: fixed`
- Browser: open user chip → modal covers shell (blur backdrop), not appended under route table

### Rollback

```powershell
cd E:\Dev\Extension\E0001-cookie-bridge
git checkout v1.1.11 -- hub-workspace-user-modal.css manifest.json build-info.js
```

## 2026-07-13 - Identity plane hub-api (Lenovo)

- Version: `1.1.11`
- Timestamp: 2026-07-13 17:55 (UTC+7)
- Type: Patch
- Product: E0001
- Prompt: Fix Sign In Invalid login credentials (czpgo@outlook.com) — identity still on cloud
- Status: Done

### Changes

- **Identity URL** — `E0001_IDENTITY_SUPABASE_URL` → `https://hub-api.infi.io.vn` (parity with P0004 / Phase C). Cloud `fmnraf…supabase.co` password grant returns 401 after cutover.
- **host_permissions** — explicit `hub-api.infi.io.vn`.
- Data plane unchanged: `sb-api.infi.io.vn`.

### Verification

- Password grant `czpgo@outlook.com` → hub-api 200 + sb-api 200; cloud hub 401
- Reload unpacked extension after load

### Rollback

```powershell
cd E:\Dev\Extension\E0001-cookie-bridge
git checkout v1.1.10 -- supabase-config.js manifest.json
```

## 2026-07-10 - Data plane sb-api (Lenovo) + store host perms

- Version: `1.1.10`
- Timestamp: 2026-07-10 18:47 (UTC+7)
- Type: Patch
- Product: E0001
- Prompt: ok 1 2 3 — OI0604046 share invisible on CWS build; publish store
- Status: In progress

### Changes

- **Data URL** — `E0001_DATA_SUPABASE_URL` → `https://sb-api.infi.io.vn` (parity with P0020 prod / Lenovo).
- **host_permissions** — `sb-api.infi.io.vn` + `*.infi.io.vn` so vault RPC is allowed.
- **Sync** — P0020 `predev` runs `sync-e0001-databox`; `pnpm verify:e0001-databox` drift check.

### Verification

- RPC `note_cookie_routes_accessible_v2` as OI0604046 on sb-api → 1 Kalodata member route
- `node scripts/sync-e0001-databox.mjs --check` OK

### Rollback

```powershell
cd E:\Dev\Extension\E0001-cookie-bridge
git checkout v1.1.9 -- supabase-config.js manifest.json
```

## 2026-06-22 - Popup activity timestamps auto-refresh

- Version: `1.1.9`
- Type: Patch
- Product: E0001
- Timestamp: 2026-07-07 09:09 (UTC+7)

### Changes

- Synced/Loaded columns refresh every 60s while popup is open (shared tick with P0020/hub-ui).
- Stale labels use `hh:mm dd/mm/yy` via `formatTime`.

### Verification

- Manual: keep popup open >1 min — relative labels update without reload

## 2026-06-22 - Sync/Load activity timestamps in popup

- Version: `1.1.7`
- Type: Patch
- Product: E0001

### Changes

- Synced / Loaded columns and user sync sub-line: colored dot + relative age (`just now`, `6m ago`, `6h ago`) within 24h; `dd/mm/yy` when older than 1 day.
- Tone buckets: fresh ≤1h (cyan), recent ≤24h (amber), stale >24h (gray) — aligned with P0003 / P0020 pattern.

### Verification

- Manual: reload extension popup on routes with recent sync/load

## 2026-06-22 - Gmail Load v3: apply-first, no overlay loop

- Version: `1.1.6`
- Type: Patch
- Product: E0001
- Prompt: Gmail still infinite load on workspace.google.com with route `.mail.google.com`
- Commit: pending
- Status: Draft

### Changes

- Google Load: **apply cookies first**, navigate inbox after (no pre-navigate to logged-out page).
- Route `.mail.google.com` → cookie scope `.google.com`; exclude `workspace.google.com` from tab match/overlay.
- No tab overlay for Google (popup progress only); disable `onUpdated` overlay reinject.
- `try/finally` always removes overlays; session probe fails Load when redirect to workspace.
- Skip `clearBeforeLoad` for Google routes (avoid wiping jar mid-apply).

### Verification

- `node Extension/E0001-cookie-bridge/scripts/test-domain-routes.mjs` — passed

## 2026-06-22 - Gmail Load: block workspace redirect loop

- Version: `1.1.5`
- Type: Patch
- Product: E0001
- Prompt: Google Load stuck on workspace.google.com marketing page + infinite overlay
- Commit: pending
- Status: Draft

### Changes

- Treat `workspace.google.com` as invalid cookie context — always force-navigate to `mail.google.com/mail/u/0/`.
- Popup Google routes always run `openSite` (even when tab locked) so cookies apply after inbox navigation.
- Stop overlay re-inject on marketing redirects; cap tab `onUpdated` reinject to 2.
- Post-load: navigate Google tabs to inbox instead of reload marketing URL; warn when vault lacks SID/HSID.

### Verification

- `node Extension/E0001-cookie-bridge/scripts/test-domain-routes.mjs` — passed
- Load `.google.com` → tab stays on mail.google.com (not workspace marketing)

## 2026-06-22 - Gmail Load: mail.google.com cookie context

- Version: `1.1.4`
- Type: Patch
- Product: E0001
- Prompt: Fix Load cookies for route `.google.com` / Gmail sign-in page
- Commit: pending
- Status: Draft

### Changes

- `domain-routes.js`: Google/Gmail entry URL (`mail.google.com/mail/u/0/`) and multi-host `cookies.set` retries (`mail`, `accounts`, `myaccount`).
- `background.js`: sync/read jar includes `mail.google.com` + `accounts.google.com` URL queries (host-only Gmail cookies).
- `vault-api.js`: apply vault uses Google subdomain hosts (same pattern as Facebook `www`/`m`).

### Verification

- `node Extension/E0001-cookie-bridge/scripts/test-domain-routes.mjs` — passed
- Reload extension → Load route `.google.com` → Gmail inbox (not Sign in)

## 2026-06-17 - Rename Cookie Auto → Cookie Bridge (UI copy)

- Product: E0001 + P0020 parity
- Popup, options, auth gate, toasts, CWS listing scripts, and store docs now say **Cookie Bridge** (tab name in Data Box).

### User impact

- Extension popup header and sign-in copy match P0020 sidebar tab **Cookie Bridge**.
- Chrome Web Store listing text updated on next publish (`upload-chrome-store.mjs` / `complete-cws-listing.mjs`).

## 2026-06-13 - CWS v1.1.3 approved — live on Chrome Web Store

- Version: `1.1.3`
- Type: Patch
- Product: E0001
- Status: **Published** — [Chrome Web Store](https://chromewebstore.google.com/detail/e0001-cookie-bridge/kaaadageakdandpobcofplmfbjfjabdk)

### Changes

- Google approved store package v1.1.3 (login modal + hub workspace user modal deps).
- `tool.manifest.json` → `chromeWebStore.listingStatus: published`
- P0020 `extensionCwsBuildInfo.ts` synced via `sync-p0020-cws-badge.mjs`

### User impact

- **Chrome Web Store installs** auto-update to v1.1.3 (Chrome background; restart if needed).
- **Load unpacked / GitHub ZIP** — re-download [v1.1.3 release](https://github.com/tuanhoangfx/E0001-cookie-bridge/releases/tag/v1.1.3) and reload extension.

## 2026-06-13 - CWS store package: fix missing login modal files

- Version: `1.1.3`
- Type: Patch
- Product: E0001

### Changes

- `package-store.ps1`: include `toast.js`, `hub-auth-logout-chip.js`, `hub-workspace-user-modal.js/css` (popup.js failed to load on Store build → no Login modal).
- `validate-store-package.mjs`: trace ES module + CSS imports before ZIP upload.

## 2026-06-08 - Extension sign-in: User ID → @infix1.io.vn

- Version: `1.1.2`
- Type: Patch
- Product: E0001

### Changes

- `hub-login` vendor: canonical `@infix1.io.vn` + legacy `@id.hub.x1z10.local` fallback (aligned with P0020 / hub-identity).
- `signInWithHubPassword` in extension `auth-session.js` — `CS00761` works without typing full synthetic email.
- Sync script copies `hub-auth-submit.template.js` → E0001 vendor on `sync-hub-identity-vendor.cjs`.

## 2026-06-05 - Cookie Bridge 1.1 — manual sync and route activity

- Version: `1.1.1`
- Type: Major
- Product: E0001
- Timestamp: 2026-06-08 15:40 (UTC+7)
- Prompt: Release P0004, P0020, E0001 — member Load/Sync visibility and per-route sync
- Commit: `df0692b`
- Status: Committed
- Release: https://github.com/tuanhoangfx/E0001-cookie-bridge/releases/tag/v1.1.1

### Changes

- Major semver `1.1.1` (MV3 manifest); per-route manual Sync/Load only (no bulk note sync).
- `vault-api` uses user JWT for `cookie_route_record_load/sync` and activity list so Hub People & access updates.
- Member `synced_at` via RPC `note_cookie_synced_at_for_accessible`; popup User column from route activity.
- Popup/options theme and schema probe aligned with P0020 cookie tab.

### Verification

- Reload unpacked extension; Load/Sync one route; owner sees activity on Route details
- GitHub release `v1.1.1` zip for distribution

### Rollback

- Revert to `v0.5.100` tag

---

## [0.5.100] — 2026-06-04
- Product: E0001 + P0020
- Prompt: User Load thành công nhưng Route Details People & access không cập nhật Load
### Fixed
- `cookie_route_record_load` / `cookie_route_record_sync` / `cookie_route_activity_list` now use **user JWT** (`userHeaders`), not anon — `auth.uid()` was null so `cookie_route_user_activity` stayed empty.
- Persist `userLoadedAt` / `userSyncedAt` on binding status after cloud record succeeds.
- Hub: fuzzy email match for member Load/Sync columns; SQL restores flexible domain filter on activity list.

## [0.5.99] — 2026-06-04
- Product: E0001 + P0020
- Prompt: Member login không thấy cột Synced dù admin thấy
### Fixed
- `fetchNoteSyncedAtMap` uses RPC `note_cookie_synced_at_for_accessible` (security definer) so shared members read route `notes.synced_at` without notes RLS.
- `cookie_route_activity_list` allows users with route **apply** access (read activity for User column).
- DB: `20260604230000_cookie_synced_at_accessible_members.sql` — run `pnpm apply:synced-at-accessible:api`.

## [0.5.98] — 2026-06-04
- Product: E0001 + P0020
- Prompt: Vẫn sync hàng loạt 23:09; cột User không đồng bộ sau Sync cookie
### Fixed
- `recordRouteSyncOnCloud` after every successful manual Sync (not only vault upload).
- Popup **User** shows your per-route Sync time (`cookie_route_user_activity` + realtime).
- GET_STATUS returns `routeUserActivityByKey` for current user.

## [0.5.97] — 2026-06-04
- Product: E0001 + P0020
- Prompt: Vẫn sync hàng loạt dù không bấm Sync
### Fixed
- `syncBindings` requires `manual: true` (only extension popup Sync).
- `SYNC_NOW` requires `bindingKey` (`noteId:domain`) — no multi-route sync by noteId alone.
- RPC sends `p_touch_synced_at: true` only on manual Sync (DB must run `APPLY_NOTE_SYNC_TOUCH_FLAG.sql`).

## [0.5.96] — 2026-06-04
- Product: E0001 + P0020
- Prompt: Sync time Cookie Auto vs Extension không khớp; giờ sync đổi đồng loạt dù không bấm Sync
### Fixed
- Popup **Synced** = cloud `notes.synced_at` (batch fetch on GET_STATUS + Supabase realtime on `notes`).
- `skippedSync` no longer overwrites local `pushedAt` / `cloudSyncedAt`.
- After manual Sync, `cloudSyncedAt` matches RPC timestamp.

## [0.5.95] — 2026-06-03
- Product: E0001 + P0020
- Prompt: Synced chỉ manual per route; Options Sync explained
### Changed
- Popup **Synced** = `pushedAt` only (manual Sync button).
- Options **Sync now** → message to use popup per route (bulk `SYNC_NOW` disabled).

## [0.5.94] — 2026-06-03
- Product: E0001 + P0020
- Prompt: Kiểm tra sync tự động — user không bấm Sync nhưng giờ đổi
### Fixed
- Stopped copying `vault.updated_at` into `pushedAt` (GET_STATUS + vault realtime) — looked like auto-sync.
- Removed dead `pollAgentCommandsOnce` call on STORE_BINDINGS.
- Removed web `E0001_COOKIE_BRIDGE_SYNC` → `SYNC_NOW` relay (manual extension button only).

## [0.5.93] — 2026-06-03
- Product: E0001 + P0020
- Prompt: Tất cả route Kalodata cùng Synced time
### Fixed
- Binding sync status key is `noteId:domain` (not noteId alone); legacy keys migrated on GET_STATUS.
- Vault realtime route match uses normalized `.domain`.

## [0.5.90] — 2026-06-04
- Product: E0001 + P0020
- Prompt: Record per-user route Load time without agent heartbeat
### Added
- After successful Load, POST `cookie_route_record_load` (note + domain + auth user).

## [0.5.89] — 2026-06-04
- Product: E0001 + P0020
- Prompt: Remove Connected browsers cloud tracking; Sync always full (snapshot + vault)
### Removed
- Agent poll loop (7s upsert `cookie_bridge_agents`, `cookie_bridge_commands` fetch/execute).
- `AGENT_HEARTBEAT` message handler.
- P0020 **Upload vault on Sync** toggle; extension `vaultSync: false` path.
### Changed
- Manual **Sync** always uploads snapshot + encrypted vault (guards/pass unchanged).

## [0.5.88] — 2026-06-04
- Product: E0001 + P0020
- Prompt: Manual-only Sync/Load per route on extension popup; remove all auto sync/apply
### Changed
- Removed `chrome.cookies.onChanged` auto snapshot/vault paths.
- Vault realtime: metadata UI tick only — no `tryApplyVaultFromRemote`.
- After manual `SYNC_NOW`, no `pollVaultsAndApply` for other routes.
- Agent commands `sync-now` / `apply-vault` rejected (use extension popup).
- Popup `?auto=sync|apply-vault` removed.
- Web `STORE_PREFS` always forces `realtimeVaultApply: false`.

## [0.5.87] — 2026-06-04
- Product: E0001
- Prompt: Toast Sign in on Tool khi đã có routes + session
### Fixed
- Auth toast only when `sessionReady` is false (`hasBindings && !ready`), not on every refresh with routes loaded.

## [0.5.86] — 2026-06-04
- Product: E0001
- Prompt: Báo đỏ schema khi không làm gì — probe gửi tham số RPC sai
### Fixed
- **Schema probe** no longer sends `p_updated_by` (RPC has 7 args only); `PGRST202` false positive removed.
- Treat **note not found** on probe UUID as schema OK (DB functions exist).

## [0.5.85] — 2026-06-04
- Product: E0001
- Prompt: Thông báo schema nháy liên tục
### Fixed
- Popup toast **schema/warn** no longer re-fires every refresh (`lastBannerKey` was cleared when session ready).
- **GET_STATUS** no longer runs `pullCloudRoutes` on every call (broke storage→refresh loop with realtime `ui-tick`).
- Debounced popup refresh on `chrome.storage.onChanged` (400ms).

## [0.5.84] — 2026-06-03
- Product: E0001 + P0020 Cookie Auto
- Prompt: Refresh nhiều lần không tự cập nhật — realtime qua database
### Added
- Extension **route/vault DB realtime** default on (`routeDbRealtime`), independent of web `realtimeSync` toggle.
- `STORAGE_UI_TICK` bumps popup when routes pull or vault metadata changes over Supabase `postgres_changes`.
### Changed
- Popup `storage.onChanged` no longer ignores `LAST_ROUTE_PULL`-only updates; refreshes when popup becomes visible.
- `STORE_PREFS` from web no longer disables extension DB realtime (`realtimeSync` not relayed).
- Session relay (`relayOnly`) starts vault/route realtime after `pullCloudRoutes`.
- Vault websocket always subscribes for **Synced / Vault count** metadata; cookie jar apply still gated by `realtimeVaultApply`.

## [0.5.83] — 2026-06-03
- Product: E0001 + P0020 Cookie Auto UI
- Prompt: Alarm Sync interval — hoạt động chưa, ảnh hưởng, xóa nếu cần
### Removed
- Periodic `chrome.alarms` route pull (was default 60m; redundant with popup open / User Refresh / realtime).
- P0020 Extension bridge **Sync interval** UI; `syncIntervalMinutes` pref dropped from bridge contract.
- Extension `alarms` permission.

## [0.5.82] — 2026-06-03
- Product: E0001
- Prompt: Tách STORE_AUTH relay; User header → User Detail; cookie sync explicit only
### Changed
- **Relay `STORE_AUTH`/`STORE_IDENTITY`**: session + `pullCloudRoutes` only — no `refreshVaultTransport`, no agent loop, no bulk vault apply.
- **`SYNC_NOW`**: requires `noteId` or `bindingKey` (one route per sync).
- **Header user** opens User modal; removed shield User Detail button. **Refresh** in modal pulls session from Tool tab.
- Popup open no longer auto-relays to Tool; periodic alarm pulls routes only (no bulk cookie sync).

## [0.5.81] — 2026-06-03
- Product: E0001
- Prompt: Giữ Page x of y cùng Showing a-b of n
### Changed
- Pager label: `Page 1 of 2 · Showing 1-5 of 7`.

## [0.5.80] — 2026-06-03
- Product: E0001
- Prompt: Đổi nhãn pager Showing 1-5 of 7
### Changed
- Pager label: `Showing 1-5 of 7`, `Showing 6-7 of 7` (index range / total).

## [0.5.79] — 2026-06-03
- Product: E0001
- Prompt: Thêm số trang vào pager
### Changed
- Pager label includes page: `Page 1 of 2 · Showing 5 of 7`.

## [0.5.78] — 2026-06-03
- Product: E0001
- Prompt: Nhãn tiếng Anh; Prev/Next sát nhãn (không tách rộng)
### Changed
- Pager label: `Showing x of y`.
- Prev / label / Next grouped in one compact row (centered).

## [0.5.77] — 2026-06-03
- Product: E0001
- Prompt: Pager bị che — tăng chiều cao; chuyển Prev/Next lên trên bảng; nhãn Hiển thị x trên y
### Changed
- Popup height 460→500px so footer controls are not clipped.
- Route pager moved below filter bar, above table.
- Pager label: `Hiển thị x trên y` (visible count / total matched).

## [0.5.76] — 2026-06-03
- Product: E0001
- Prompt: Thêm nút next/prev nếu có nhiều hơn 5 route
### Added
- Route pager: **Prev** / **Next** when more than 5 routes match (5 per page, newest sync first).
- Page label shows `page / total · range`; search/filters reset to page 1.

## [0.5.75] — 2026-06-03
- Product: E0001
- Prompt: Đổi Sync trước Load; tối đa 5 route/s màn hình (sort theo sync time)
### Changed
- Actions column: **Sync** before **Load**.
- Route table: newest sync first, max 5 visible rows; cap hint when more routes match filters.
- Popup layout: no body/table scroll; compact fixed row height for 5 routes.

## [0.5.74] — 2026-06-04
- Product: E0001
- Prompt: 0.5.73 vẫn frozen — hub-login.js import fail
### Fixed
- Valid `hub-login.js` + `hub-login.template.js` (sync script no longer emits invalid TS stubs).
- Verified dynamic import + `resolveHubLogin('CS00786')`.

## [0.5.73] — 2026-06-04
- Product: E0001
- Prompt: Extension 0.5.72 — không thao tác được button nào
### Fixed
- `vendor/hub-identity/hub-login.js`: invalid JS (`authEmail?;`) broke service worker import → all popup actions dead.
- Auth lock CSS: header + auth-waiting stay clickable when body is locked.
- `sync-hub-identity-vendor.cjs`: strip TS object types when generating E0001 hub-login.js.

## [0.5.72] — 2026-06-04
- Product: E0001
- Prompt: Extension Sign In/Sign Up by User ID — sync hub-identity with P0004/P0020
### Changes
- `vendor/hub-identity/hub-login.js` + `resolveHubLogin` in `auth-session.js` (User ID → `@id.hub.x1z10.local`).
- Popup: `type="text"`, placeholder User ID or email; subtitle aligned with Tool Hub modal.
- Dual auth sequential (Hub → Data Box) to reduce rate-limit bursts.

## [Unreleased]
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.71] — 2026-05-29
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Route filter dropdowns no longer clip inside the popup (floating panel + reposition on scroll/resize).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Platform**, **Role**, **Vault**, and **Access** filters list only values present on current routes (no ghost options from the full catalog).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **All …** row counts reflect the number of distinct filter values on loaded routes.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.69] — 2026-05-29
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Added
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Platform** filter on routes table (Facebook, Kalodata, Google, TikTok, … + Other) from the shared brand icon registry.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Cookie Auto header **Download extension** fetches the latest GitHub release ZIP on each click (P0020).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.60] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Added
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- `scripts/package-extension.ps1` and GitHub Actions release workflow to ship Load unpacked ZIP assets.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Production bridge host `https://databox.infi.io.vn/cookie` (legacy Vercel URL kept).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Add a Loaded column showing each route's latest Load cookies time.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Center popup table data for Cookies, User, Loaded, Status, and Actions.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.59] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Load route brand icons from the generated Cookie Auto icon registry.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Keep Extension route icon mapping generated from the P0020 registry source.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Center and bold popup table column headers.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.58] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Store the Kalodata route icon as a local Extension asset.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Keep Cookie Auto brand icon mapping aligned with P0020 Web.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Replace the generic Route fallback glyph so it no longer resembles a broken brand icon.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.57] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Add brand icon mapping for Surfshark via theSVG.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Add Kalodata favicon mapping by domain and fallback handling for failed route icons.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.56] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Remove the dedicated tickbox/select column so the table starts with Route.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Normalize table header typography and colored header/user icons.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Add Excel-style route selection: drag rows, Ctrl/Meta multi-select, Shift range-select, and Ctrl/Meta+A select visible routes.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Restore the normal mouse cursor over route rows.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.55] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Move the per-route open-site action next to the route domain.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Use the former open-site position for a site icon and route status dot.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Add current user email and a Cookie Auto Web shortcut to the popup header.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Rebalance route table columns so row actions are not clipped.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.54] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Replace native popup filters with P0004 Hub-style searchable dropdown panels.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Add consistent SVG icons to filter triggers, table headers, and Load/Sync row actions.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.53] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Widen popup and compress route rows to avoid horizontal scrolling.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Clone the P0020 Cookie Auto filter toolbar styling with search, Ctrl+K hint, and two-row filters.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Remove visible technical row detail labels and source/browser IDs from route rows.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.52] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Replace popup diagnostics cards/manual panel/footer actions with a compact route table toolbar.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Add route search and Role/Vault/Source filters inspired by the P0004 Links table.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Move Load and Sync actions into each route row.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.51] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Added
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Add stage-specific progress effects for Reading vault, Applying cookies, and Verifying browser in both popup and tab overlays.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.50] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Use the same Load cookies progress card design in the active browser tab overlay as the Extension popup.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.49] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Keep the Load cookies tab overlay continuous across navigation/reload by tracking active tab locks.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Avoid force-navigating the route tab again when the immediate tab lock already prepared the site.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.48] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Lock the target browser tab immediately when Load cookies is clicked, before the vault apply flow starts.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.47] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Keep the browser tab overlay locked until cookies finish applying, the tab reloads, and the browser state settles.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Re-inject the tab overlay after route tab reloads so users cannot interact with the page mid-apply.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.46] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Added
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Add a V1 Minimal Lock progress modal when Load cookies applies vault data.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Lock the active browser tab with a matching overlay while cookies settle.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.45] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Stop popup refresh flicker by ignoring route-pull timestamp-only storage changes and avoiding binding storage writes when DB routes are unchanged.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Change route selection to Excel-style row selection with a compact green circular check and keyboard support.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Remove the footer explainer text from the popup so the action area stays compact.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.44] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Call accessible route RPCs with the Tool user's JWT so `auth.uid()` resolves and the extension receives the same DB routes as P0020.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.43] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Enforce DB-first route loading: Tool binding events now trigger a Supabase route pull instead of writing Web-local routes into extension storage.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Always run cloud route pull during popup status refresh and show the route source in diagnostics.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.42] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Auto-inject the Tool content bridge into already-open P0020 tabs when the popup requests current routes after an extension reload.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.41] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Popup now asks the open P0020 Tool tab to relay the current user session and route cache before rendering, keeping Extension and Web route counts aligned.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Preserve stored owner user metadata when Tool relays auth without explicit user fields.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.40] — 2026-05-27
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Allow `Sync now` by default for the route owner when a route has no Source browser lock.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Show the route owner/creator in the popup `User` column and keep Source lock as an optional browser-level publish guard.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Refresh route changes over Supabase Realtime so linked browser profiles receive new owner routes without manual route buttons.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Show the exact reason above the `Sync now` button when the selected route is read-only.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Rename popup route timing from Push/Load to Sync/Load to make the publish/apply directions explicit.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.38] — 2026-05-26
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Use the linked Tool user session for vault v3 fetch/upsert RPCs so shared Note ID members can see and load the encrypted vault.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Add a popup Load cookies timeout and show the real vault probe reason instead of leaving the popup stuck at "Đang load vault cookies...".
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.37] — 2026-05-26
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Add timeout guards for agent `apply-vault` commands and individual `chrome.cookies.set` writes so browser Test cannot stay stuck in `running`.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Mark stale running agent commands as failed on the next poll, allowing manual Load to be retried cleanly after extension reload.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.22] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Remove P0020 protocol/storage/decrypt compatibility from active E0001 flows.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Purge old `p0020-*` extension storage keys and alarm when E0001 starts or installs.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Keep only E0001 event names, storage keys, and vault encryption namespace for new runtime data.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.21] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Rename extension identity from `P0020-cookie-bridge` to `E0001-cookie-bridge`.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Move public metadata to `E0001` naming: manifest, popup/options titles, build info, docs, and console prefix.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Use `e0001-*` storage/protocol keys with legacy `p0020-*` fallback migration.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Encrypt new vault rows with the `e0001` namespace while keeping decrypt fallback for older `p0020` vault rows.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.20] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Load cookies** không cần F5 trước: luôn điều hướng context về `www.facebook.com`, chờ tab ổn định rồi mới ghi cookie.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Dùng pipeline `loadVaultIntoBrowser()` chung cho Load/realtime; apply tối đa 4 vòng với retry ngắn.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Thành công khi jar tăng hoặc khớp vault, không chỉ dựa vào `chrome.cookies.set` return.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Reload/confirm tab sau khi ghi xong; không reload giữa lúc apply.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Chặn auto-upload vault trong 45 giây sau Load/paste; `cookie.onChanged` chỉ cập nhật snapshot mask, không ghi đè vault.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Popup render lại cột **User** từ `note_cookie_vault.updated_by`.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.15] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Load cookies**: tự mở tab site trước khi `cookies.set` (không cần F5 thủ công).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Kiểm tra `chrome.cookies.set` trả về `null` = thất bại; thêm URL `m.facebook.com`, `partitionKey` trong vault.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Load (force): xóa watermark cũ — luôn apply vault mới sau Sync.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Reload tab nếu chưa có tab mở; toast báo cookie lỗi khi ghi 7/10.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.14] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Sync now**: `prefs is not defined` trong `syncBindings` (regression 0.5.13).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.13] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Peer-to-peer sync**: mọi browser đều **Sync now** và **Load cookies** — không chặn theo Writer/Reader.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Sync = bản mới nhất**: bỏ downgrade guard; jar hiện tại luôn ghi đè `note_cookie_vault` khi Sync.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Writer/Reader trong Settings chỉ còn **nhãn tạm** (chưa khóa quyền).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.12] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Added
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Writer / Reader role** (`bridgeRole` pref): Writer = Sync/upload; Reader = chỉ Load / paste (chặn Sync, alarm, cookie-change upload).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Popup tách thời gian: **Jar** · **Vault cloud** (`note_cookie_vault.updated_at`) · **Pushed** (Sync now) · **Loaded** (Load cookies).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Tool Settings: chọn Writer/Reader; bảng **Vault cloud** + **Note synced**.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Meta popup: Role, Vault cloud (route đang chọn), Push/Load times.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Tool Sync now cảnh báo khi Reader.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.11] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Vault downgrade guard**: Sync không ghi đè vault trên cloud khi jar local &lt; vault (vd. 7 thay vì 10).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Tắt auto-sync khi push bindings (tránh browser phụ sync 7 cookie lên vault).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Badge **Vault N** khi vault được giữ nguyên trên server.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.10] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Sync once, vault = snapshot**: một lần `getCookiesForDomain` cho cả RPC và vault (tránh 10 lines / 7 vault).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Thu cookie thêm qua `getAll({ url })` (`www`, `m`) như Cookie-Editor.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Sau **Load cookies** cập nhật cột Lines = số cookie thật trong jar local.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Toast Load: `Vault N → ghi X/Y · jar Z` + cảnh báo vault lệch.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.9] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Added
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Popup **Test thủ công**: Copy JSON (browser / vault), paste & Apply (Cookie-Editor format).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Load / Apply reports **applied/total** and **failed cookie names**.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- `chrome.cookies.set` retries `https://www.facebook.com` + host-only fallback (more cookies apply).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.8] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Popup table layout: **Route** column stacks domain + note (no overlapping text).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Sync one route** no longer wipes other routes’ line counts in storage.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Lines column shows `6 / 10` when local jar &lt; vault on server.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Toast moved to **top-right** (does not cover Load / Sync buttons).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.7] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **STORE_BINDINGS** clears stale per-route sync status when note/domain changes (no old snapshot/vault badges).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Tool **connectAndPush** sends full binding list (not one row overwriting extension).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Load cookies** refreshes matching open tabs instead of opening a new tab.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Popup table: **Synced** column (per-route time).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Toasts: compact, bottom of popup / Tool bottom-right, max 2.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.6] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Popup **Vault** / **Schema** badges no longer lie when user JWT expired — vault probe uses anon RPC (same on every profile).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Schema probe** no longer upserts into a **real** note (was corrupting vault + false “Schema” errors).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- `GET_STATUS` auto **refresh_token** before showing Session expired.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.5] — 2026-05-24
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Vault serialize preserves **`no_restriction`** / **`unspecified`** sameSite (was defaulting to `lax` → Facebook login failed).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- `hostOnly` cookies: omit `domain` on `chrome.cookies.set` (Cookie-Editor parity).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Added
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Settings → Import Cookie-Editor JSON** — paste export from [cookie-editor](https://github.com/moustachauve/cookie-editor) and apply locally.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.4] — 2026-05-24
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- **Load cookies**: omit `storeId` when applying vault (fixes 0 cookies applied cross-profile).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Normalize `sameSite`, `__Host-` / `__Secure-` cookie rules; retry without `domain`.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Watermark only after successful apply; clearer errors from vault load.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Auto-open site tab before Load cookies.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Notifications use **toast** (top overlay), not inline red banner in popup.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.3] — 2026-05-25
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Schema probe uses **real binding noteId** (catches stale `v_note` / `sync_pass_hash` on live rows).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Banner points to `APPLY_FIX_V_NOTE_DROP.sql` when DB functions are outdated.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.2] — 2026-05-24
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Fixed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Clear stale vault/schema warnings when Supabase RPCs are healthy (`clearStaleVaultErrors`, `schema-probe.js`).
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Banner text distinguishes old DB functions vs “sync now” when schema is OK.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
### Changed
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Popup layout **520×720px**; separate **Snapshot** and **Vault** columns.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.1] — 2026-05-23
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- Schema probe via REST; vault error cleanup on `GET_STATUS`.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
## [0.5.0] — prior
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry

- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
- V4 vault sync (AES-GCM), realtime apply, hourly sync alarm.
- Prompt: Legacy entry
- Product: E0001
- Prompt: Legacy entry
