# P0003 Stealth Browser Console — Agent Entry Map

- **Code & Ports:** `P0003` (`Tool/P0003-Stealth-Browser-Console`) · Desktop Electron + React 19 + SQLite (`WAL`) anti-detect browser & Android farm console · Renderer `:5173` · Local HTTP/CDP Control API `:6003` · `deployTarget: "github-release"`.
- **Hard Safety Standing Orders:**
  - Agent browser smoke uses headless pool **`9000–9999`** (`X-Stealth-Agent-Smoke: 1`, `headless: true`) via `Tool/scripts/lib/agent-inline-kit.mjs`.
  - **NEVER** touch customer profiles **`8000–8999` (`8xxx`)** and **NEVER** hijack/close/CDP-attach to user profiles open in Headed mode (`headless: false`, especially `0001–0020`, `0021`, `0059`, `0069`).
- **Real Electron Backend Paths (Never Hallucinate `electron/api/local-server.cjs` or `electron/storage/db.cjs`):**
  - Control API: `electron/api-server.cjs`, `electron/api-routes.cjs`
  - SQLite DB & Profiles: `electron/db/init.cjs`, `electron/db/profile-service.cjs`
  - Browser Engine & Sync: `electron/engine/session-manager.cjs`, `electron/lib/stealth-multiplatform-sync.cjs` (facade + 9 domain slices in `electron/lib/multiplatform-sync/*.cjs`), `electron/lib/profile-cookie-guard.cjs`
- **Frontend Paths:** `src/views/**`, `src/features/{profiles,android,runtime,settings}/**` (`@tool-workspace/hub-ui` SSOT).
- **Cards & Skills:** `_cards/p0003-stealth-agent-smoke.md` · `_cards/desktop-exe-release.md` · skill `p0003-stealth-meta-ops`.
