# Hub UI golden scaffolds (layer 3)

Minimal screens for `sync-hub-ui-screen.cjs`. Each file contains `HUB_UI_SCAFFOLD`.

| File | Template ID | Maps from user term |
|------|-------------|---------------------|
| `GoldenDirectoryScreen.tsx` | `directory` | discovery, catalog, Hub, Users |
| `GoldenDirectoryTable.tsx` | `directory-table` | HubDirectoryTableShell, colgroup, body cells |
| `GoldenAnalyticsScreen.tsx` | `analytics`, `dashboard` | dashboard, KPI |

Do not import these in production bundles — copy into `Tool/P00xx-*/src/features/...` only.
