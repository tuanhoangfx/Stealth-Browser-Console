# Changelog — P0003 Stealth Browser Console

## 2026-06-18 — v0.5.2 — Catalog 10k–50k + batch runner + proxy pool

- Version: `0.5.2`
- Timestamp: 2026-06-18 15:00 (UTC+7)
- Type: Minor
- Status: Committed

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
