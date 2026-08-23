# Stealth Browser Console (P0003)

Standalone desktop console for **CloakBrowser** antidetect profiles and Open URL automation.

## Agent contract

- **Dev:** `node Tool/scripts/ensure-dev-product.cjs P0003 --open` (workspace: `pnpm dev:stealth` from `E:\Dev`)
- **Verify:** `node Tool/scripts/agent-verify-gate.mjs --code P0003 --json --ensure-dev --mark-active`
- **Shell SSOT:** [Tool/docs/ssot/hub-shell-ssot.md](../docs/ssot/hub-shell-ssot.md)

Engine pin & bump policy: [`docs/ENGINE-CLOAKBROWSER.md`](docs/ENGINE-CLOAKBROWSER.md) · Fork decision: [`docs/cloakbrowser-fork-evaluation.md`](docs/cloakbrowser-fork-evaluation.md).

## Stack

- Electron + React + Vite
- Hub-UI shell (P0004 golden pattern)
- CloakBrowser (npm) + Playwright API
- SQLite (`better-sqlite3`) for profiles and run history

## Dev

```powershell
cd E:\Dev\Tool\P0003-Stealth-Browser-Console
corepack pnpm install
corepack pnpm dev
```

**Agent contract (mandatory):** sau khi sửa code/UI trong repo này, agent **tự** reload dev — user không cần nhắc:

```powershell
# từ E:\Dev\Tool\P0003-Stealth-Browser-Console
corepack pnpm dev:reload
# hoặc từ workspace root:
node Tool/P0003-Stealth-Browser-Console/scripts/dev-desktop-reload.mjs
```

- Chỉ restart dev (`:5175`, userData `-dev`, API `:6004`) — **không** kill packaged `Stealth Browser Console.exe` đang chạy.
- Agent smokes probe **`:6004` trước** (`STEALTH_BROWSER_API_MODE=dev` hoặc `STEALTH_AGENT_SMOKE=1`). Kill packaged chỉ khi `desktop:close-packaged`, `restore-stealth-catalog`, `repair-stealth-db`, hoặc `--replace-packaged`.
- Test bản cài: `corepack pnpm desktop:open` (không `--replace` khi chạy song song dev).
- Chi tiết: `.cursor/rules/p0003-stealth-browser-ssot.mdc` · skill `ship-until-done` (Local dev → P0003).

**See UI after source edit:** bake `dist/` (`pnpm dev:desktop-only -- --no-watch --keep-dev`) then F5 the **DEV** Electron window (`userData` contains `stealth-browser-console-dev`). Packaged exe (`:6003`) stays old until Release. `pnpm dev:web` (`:5175`) is layout-only (no IPC) — not the desktop SSOT.

## Version clock (P0020 SSOT)

Header `vX.Y.Z · Nm ago` reads `package.json` via `src/lib/app-meta.ts` + `resolveHubProductVersionMeta` (`src/lib/app-release.ts`). Vite bakes `VITE_APP_VERSION` + `VITE_APP_BUILT_AT` through `hubAppVersionPlugin` (`scripts/embed-app-version.mjs`). Patch bump = workspace hook — do not rewrite `APP_VERSION` as a string.

- Cards: [`hub-version-clock-ssot.md`](../docs/playbooks/_cards/hub-version-clock-ssot.md) · [`product-task-patch-version.md`](../docs/playbooks/_cards/product-task-patch-version.md)
- Gate: `node Tool/scripts/hub-version-meta-gate.mjs --code P0003`

Web-only UI (no IPC):

```powershell
corepack pnpm dev:web
```

## Build

```powershell
corepack pnpm build
corepack pnpm start
```

Package:

```powershell
corepack pnpm dist
```

## Health

Requires CloakBrowser binary — auto-download on first launch from Settings or first profile launch.

Data directory: `%APPDATA%/Stealth Browser Console/` (SQLite + profile folders + screenshots).

## Workflow Store (catalog + admin)

Remote catalog is **read-only** from the app. Install/Update copies workflow JSON into **localStorage** (`stealth-console-workflows`).

Scripts JSON is **not** a folder of files — it is Chromium localStorage in Electron userData:

- DEV: `%APPDATA%/stealth-browser-console-dev/` key `stealth-console-workflows`
- Packaged: `%APPDATA%/Stealth Browser Console/` same key

| Layer | Location | Who writes |
|-------|----------|------------|
| **Supabase (Hub)** | `public.stealth_workflow_catalog` on Hub Supabase | `pnpm workflow:publish -- --file path/to/workflow.json` (service role) |
| **Drive / static** | `public/workflow-store/*.json` (baked into `dist/` + bundle). Electron must resolve relative to `index.html` — `/workflow-store` on `file://` fails. | Git commit or `VITE_WORKFLOW_STORE_DRIVE_MANIFEST_URL` (https only) |
| **Local (Scripts + Install)** | localStorage `stealth-console-workflows` + `stealth-console-workflow-store-installed` | App UI |

**Publish to Supabase** (from repo root):

```powershell
cd E:\Dev\Tool\P0003-Stealth-Browser-Console
corepack pnpm workflow:publish -- --file public/workflow-store/workflows/gmail-login.json
```

Requires `HUB_SUPABASE_SERVICE_ROLE` in `E:\Dev\.env.shared`. Migration: `Tool/P0004-Tool-Hub/supabase/migrations/20260704120000_stealth_workflow_catalog.sql`.

**Sync Drive manifest** — after adding/editing workflows under `public/workflow-store/`:

1. Update `public/workflow-store/index.json` (`updatedAt`, per-entry `updatedAt`, `payloadUrl`).
2. Commit + deploy static assets (or point `VITE_WORKFLOW_STORE_DRIVE_MANIFEST_URL` at a hosted JSON URL).

Merge rule: same workflow `id` → **Supabase wins** over Drive.

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
- [RELEASE.md](./RELEASE.md)
