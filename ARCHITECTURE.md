# Architecture — P0003 Stealth Browser Console

## Layers

| Layer | Path | Role |
|-------|------|------|
| Renderer | `src/` | Hub-UI shell, profiles directory, Open URL rail, settings |
| Preload | `electron/preload.cjs` | `window.stealthApi` IPC bridge |
| Main | `electron/main.cjs` | IPC handlers, app lifecycle |
| DB | `electron/db/` | SQLite SSOT for profiles, groups, runs |
| Engine | `electron/engine/` | CloakBrowser launch/close, session map, CDP info |
| Automation | `electron/automation/open-url.cjs` | Navigate + screenshot workflow |
| **API** | `electron/api-server.cjs` + `api-routes.cjs` | BrowserHub HTTP :6003 — dispatcher mỏng + route registry |
| API plugins | `electron/automation/plugins.cjs` | Domain routes (fb/meta) tách khỏi core |
| API libs | `electron/lib/{api-auth,job-queue,net-port}.cjs` | Auth token, job queue async, CDP port helper |
| Clients | `clients/` + `docs/browserhub-api.openapi.yaml` | SDK Python/TS + spec cho tool workspace |

## Data flow

1. UI calls `src/api.ts` → `window.stealthApi`
2. Main process validates via `electron/ipc-contracts.cjs`
3. Profile CRUD → `profile-service.cjs` → SQLite
4. Launch → `session-manager.cjs` → `cloak-browser-engine.cjs` → `launchPersistentContext`
5. Open URL → reuse active context or launch first → `open-url.cjs` → persist run in `runs` table

## Profile storage

- **Metadata**: `userData/data/stealth-console.db`
- **Browser data**: `userData/profiles/{uuid}/` (CloakBrowser persistent context)
- **Screenshots**: `userData/screenshots/`

## Engine contract (MVP)

Only `CloakBrowserEngine` is implemented. Future engines implement the same session-manager interface.

Default launch flags:

- `headless: false`
- `humanize: true`
- `geoip: true` when proxy set
- `--fingerprint={seed}` from SQLite

## UI golden pattern

- Shell: P0004 sidebar + tab chrome
- Profiles: P0020/notes split — directory pane + workflow rail
- Settings: P0004/system HubPanel cards
- Directory table: `HubDirectoryTableShell` only (see `StealthProfileDirectoryTable`)

## BrowserHub API (port 6003)

Service cho tool workspace khác (P0025...) điều khiển profile/automation.

- **Auth**: bearer token qua `STEALTH_API_TOKEN` (không set → mở cho localhost). `/api/health` luôn mở.
- **CDP passthrough**: `GET /api/profiles/:id/cdp` → `endpoint`/`webSocketDebuggerUrl`. Tool ngoài `connect_over_cdp` cắm thẳng Playwright/Puppeteer vào context sống. Engine mở `--remote-debugging-port` localhost-only (tắt: `STEALTH_CDP_ENABLE=0`).
- **Job queue**: `POST /api/jobs` → jobId; poll `GET /api/jobs/:id` hoặc SSE `/api/jobs/:id/events`. `STEALTH_JOB_CONCURRENCY` (mặc định 1).
- **Registry**: core routes (`api-routes.cjs`) + domain plugins (`automation/plugins.cjs`). Thêm tool = thêm descriptor.
- **Batch runner**: job queue có dedupe theo profileId + retry/backoff + jitter. Chạy ~20–30 profile/lần qua `STEALTH_JOB_CONCURRENCY`.
- **Pagination**: `GET /api/profiles?limit&offset&search&group&status&sort&dir` cho catalog 10k–50k (không param = trả tất cả, giữ tương thích). `reconcileActiveStatuses()` thay full-scan.
- **Proxy**: `POST /api/proxy/check` health + geoip-consistency (`lib/proxy-pool.cjs`).
- **Env**: `STEALTH_API_PORT`, `STEALTH_API_TOKEN`, `STEALTH_CDP_ENABLE`, `STEALTH_JOB_CONCURRENCY` (đặt 20–30), `STEALTH_GEOIP_URL`.

### Scale 10k–50k profile
- **Catalog**: index đầy đủ + pagination ở tầng SQL. Lưu ý: `sql.js` export TOÀN BỘ file mỗi lần ghi → cân nhắc chuyển `better-sqlite3` (ghi incremental) khi >50k.
- **Chạy**: chỉ ~20–30 đồng thời → 1 máy thừa sức. Fingerprint seed đã mở rộng (2^31, ép unique) tránh va chạm ở catalog lớn.

Contract: `docs/browserhub-api.openapi.yaml`. SDK: `clients/browserhub_client.py`, `clients/browserhub-client.ts`.

## Out of scope (MVP)

External antidetect vendor API, Camoufox. (Concurrent queue → đã có job model cơ bản v0.5.)
