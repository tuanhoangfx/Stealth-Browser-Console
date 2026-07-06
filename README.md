# Stealth Browser Console (P0003)

Standalone desktop console for **CloakBrowser** antidetect profiles and Open URL automation.

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
- Test bản cài: `corepack pnpm desktop:open` (không `--replace` khi chạy song song dev).
- Chi tiết: `.cursor/rules/p0003-stealth-browser-ssot.mdc` · skill `ship-until-done` (Local dev → P0003).

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

| Layer | Location | Who writes |
|-------|----------|------------|
| **Supabase (Hub)** | `public.stealth_workflow_catalog` on Hub Supabase | `pnpm workflow:publish -- --file path/to/workflow.json` (service role) |
| **Drive / static** | `public/workflow-store/index.json` + `public/workflow-store/workflows/*.json` | Git commit or set `VITE_WORKFLOW_STORE_DRIVE_MANIFEST_URL` |
| **Local (after Install)** | `localStorage` keys `stealth-console-workflows`, `stealth-console-workflow-store-installed` | App UI |

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
