# Hub UI component patterns

> **Deprecated:** merged into [`UI_PATTERNS.md`](./UI_PATTERNS.md) + `Tool/schemas/ui-patterns.catalog.json`. Modal/auth patterns are Layer **modal**.

Only patterns **not** already bundled in a screen/table golden. Directory chrome lives in **`directory`** pattern golden `HubListPage`.

**Catalog:** `Tool/schemas/ui-patterns.catalog.json`  
**Legacy:** `ui-components.catalog.json`

---

## Patterns (6)

| ID | Golden | Clone |
|----|--------|-------|
| `hub-filter-bar` | P0004/hub-list | *(via directory screen)* |
| `hub-view-toggle` | P0004/hub-list | *(via directory screen)* |
| `hub-display-prefs` | P0004/hub-list | *(via directory/system screen)* |
| `hub-tab-chrome` | P0004/system | P0020/system |
| `hub-user-access-modal` | P0004/users | — |
| `hub-auth-gate` | **hub-ui/auth** (`HubAuthGate` + `HubAuthGateModal`) | **P0020/auth** (`NotesAuthGate.tsx`) |

---

## Auth gate (Golden V2)

- **Canonical:** `packages/hub-ui/src/auth/` — `HubAuthGate`, `HubAuthGateModal`, `HubAuthLogoutChip`, `HubAuthGateGoldenPreview`
- **CSS:** `packages/hub-ui/src/styles/hub-auth-gate.css` (30rem panel · blur 8px · 3-tab grid)
- **Golden app:** `Tool/P0004-Tool-Hub/src/features/identity/HubAuthGate.tsx` · ref `P0004/auth`
- **Clone:** `Tool/P0020-Data-Box/src/features/notes/NotesAuthGate.tsx` (+ Anonymous tab · `onAnonymous`)
- **Preview:** `packages/hub-ui/examples/GoldenAuthGateScreen.tsx` · P0004 Design Template

---

## Related

- [UI_TABLES.md](./UI_TABLES.md) — `directory-table` + `composedChrome`
- [UI_TEMPLATES.md](./UI_TEMPLATES.md)
