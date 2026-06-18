# Hub UI screen templates

Pick **one template per screen** in `tool.manifest.json` → `uiScreens[]`.  
Clone flow: sync shell (A) → apply template (B) → config only (C).

## Vocabulary (agent / human)

| You say | Template ID |
|---------|-------------|
| discovery, catalog, list, Hub, Users | `directory` |
| dashboard, KPI, charts | `dashboard` (alias `analytics` → `dashboard`) |
| overview, TOC left | `document-toc` |
| System sub-tabs | `system-panels` |
| Notes split editor | `workspace-composer` |
| Inbox master-detail | `inbox-split` |

**Checks:** `node Tool/scripts/hub-ui-css-check.mjs --code P00xx` · `hub-ui-parity-check.mjs --code P00xx --screen …`

## App shell (layer A — all templates)

Always sync before any screen:

```bash
node E:/Dev/Tool/scripts/sync-hub-ui-vendor.cjs
node E:/Dev/Tool/scripts/sync-hub-theme-from-p0004.cjs --target <app>/src
```

Required CSS imports in app `styles.css`:

```css
@import "@tool-workspace/hub-ui/styles/hub-check-indicator.css";
@import "@tool-workspace/hub-ui/styles/hub-shell-layout.css";
@import "@tool-workspace/hub-ui/styles/hub-app-tab-header.css";
@import "@tool-workspace/hub-ui/styles/hub-fields.css";
@import "@tool-workspace/hub-ui/styles/hub-users-table.css";
```

Bootstrap: `HubLoaderRoot` + `configureFilterIcons` / `configureHubChromePrefs` (see `README.md`).

---

## Templates (layer B)

| ID | Vietnamese | Golden source | Package entry |
|----|------------|---------------|---------------|
| `directory` | Directory | P0004 Users, Hub list; P0006 Bots, Groups, Channels | `HubDirectoryScreen` |
| `dashboard` | Dashboard (KPI + charts) | P0016 `DashboardScreen` | `HubDashboardScreen` + KPI/charts |
| `system-panels` | System sub-tabs + panels | P0004 `SystemHubScreen` | `HubTabChrome` + `HubPanel` |
| `inbox-split` | Inbox master-detail | P0016 `InboxHubChrome` | `HubSplitWorkspaceScreen` + `DirectorySearchToolbar` |
| `auth-gate` | Login / gate | hub-ui `HubAuthGate` + `HubAuthGateGoldenPreview` | `HubAuthGate`, `HubAuthGateModal`, `HubAuthLogoutChip` |

Types: `src/ui-template-types.ts` → `HubUiTemplate`, `GOLDEN_SOURCES`.

---

## `directory` — golden checklist

Card and table are **one screen** — switch with **ViewToggle** in the toolbar. Do not split into separate Agent patterns or templates.

**Do**

- Use `HubDirectoryScreen` (or app `TabScreenChrome` that wraps it + product header).
- `FilterBar` with `layout="hub"`, faceted counts, `ViewToggle` + `HubResultCount` in toolbar.
- Body: `HubDataTable` or `HubDirectoryCard` in `card-grid` — not ad-hoc `hub-card` divs.
- Optional: KPI row + mini charts above section rule (`HubTabScreenBody` props).

**Do not**

- Copy `UserManagementScreen.tsx` wholesale into another repo.
- Local duplicate of `ViewToggle` (fix Vite cache with `dev:force`, do not fork).
- Inline sticky chrome (`hub-chrome-sticky` manual stack) when `HubDirectoryScreen` exists.

**Parity verify**

```bash
node E:/Dev/Tool/scripts/hub-ui-parity-check.mjs --code P0006 --screen groups --template directory
```

Side-by-side: Hub :5176 Users vs target screen.

---

## Manifest `uiScreens`

```json
"uiScreens": [
  { "screen": "bots", "template": "directory", "golden": "P0006/bots" },
  { "screen": "dashboard", "template": "analytics", "golden": "P0006/dashboard" },
  { "screen": "notes", "template": "workspace-composer", "golden": "P0020/notes" }
]
```

Schema: `Tool/schemas/tool-manifest.schema.json`  
Catalog defaults: `Tool/schemas/ui-screens.catalog.json`

Agent: read `template` before `sync-hub-ui-screen.cjs`.

---

## Clone workflow (agent)

1. Read `uiScreens` for target screen → `template` + `golden`.
2. Run `node Tool/scripts/sync-hub-ui-screen.cjs P00xx <screen>`.
3. Implement layer B using package exports from `GOLDEN_SOURCES[template]`.
4. Run `hub-ui-parity-check.mjs`.
5. Browser verify Hub vs target (header, filter sticky, table row height, KPI `mt-5`).

---

## Anti-patterns

| Anti-pattern | Why it drifts |
|--------------|----------------|
| Sync CSS only | Layer 3 JSX still hand-rolled |
| Mix `analytics` layout with TOC left | Wrong template |
| Two hubs: P0004 src + package not synced | Forgot `sync-hub-ui-vendor.cjs` |
| `components/hub/` local forks | Bypass package |

---

## Related

- `packages/hub-ui/README.md`
- `Tool/P0004-Tool-Hub/AGENTS.md`
- `Tool/scripts/sync-hub-ui-screen.cjs`
