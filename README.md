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

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
- [RELEASE.md](./RELEASE.md)
