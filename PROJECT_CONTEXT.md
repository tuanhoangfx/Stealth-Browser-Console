# Project Context — P0003

## Goal

Standalone antidetect browser console using **CloakBrowser** — replace external GPM dependency for operators who want self-hosted profile management.

## MVP (v0.1.0)

- Local SQLite profile store (CRUD, groups)
- Launch / close CloakBrowser persistent profiles
- Open URL workflow (sequential, concurrency=1)
- Console + run history dots
- Settings: engine health, binary download, theme, data folder

## Screens

| Screen | Golden |
|--------|--------|
| Profiles | P0020/notes split |
| Workflow | P0001/scripts-pane |
| Settings | Modal (`StealthDisplayPrefs`) — P0004/system |

## Post-MVP

1. v0.2 Scripts — workflow presets + step builder (port from P0001)
2. v0.3 GPM profile import (proxy/note metadata only)
3. v0.4 Concurrent automation queue
4. v0.5 Installer post-install binary check

## Stealth checklist (production sites)

- Residential proxy per profile
- `geoip: true` when using proxy
- Headed mode (default)
- `humanize: true` (default)
- Warm persistent profile before sensitive flows

## Commands

```powershell
cd E:\Dev\Tool\P0003-Stealth-Browser-Console
corepack pnpm dev
corepack pnpm build
corepack pnpm test:smoke
```
