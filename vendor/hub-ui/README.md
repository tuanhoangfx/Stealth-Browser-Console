# @tool-workspace/hub-ui

Shared Hub UI for P0004, P0016, P0020, P0008. **Design source:** `Tool/P0004-Tool-Hub`.

**Monorepo:** `E:\Dev\pnpm-workspace.yaml` gom `packages/*` + `Tool/P0004-Tool-Hub` · `P0016-ChatCenter` · `P0020-Data-Box`. Chạy `pnpm install` tại **`E:\Dev`** sau khi đổi `workspace:*` deps.

**Screen templates:** see [UI_TEMPLATES.md](./UI_TEMPLATES.md) (`HubDirectoryScreen`, `uiScreens` in `tool.manifest.json`).  
**Tab loading contract:** [HubTabLoadingContract.md](./HubTabLoadingContract.md) — portaled orb, `enabled={active}`, chrome inset.

Refresh from P0004: `node E:\Dev\Tool\scripts\sync-hub-ui-vendor.cjs`

**Clone one screen:** `node E:\Dev\Tool\scripts\hub-ui-stack.cjs P00xx <screen>`

**Verify CSS imports:** `node E:\Dev\Tool\scripts\hub-ui-css-check.mjs --code P00xx`

**Layer 3 scaffolds:** `examples/GoldenDirectoryScreen.tsx`, `examples/GoldenAnalyticsScreen.tsx` (marker `HUB_UI_SCAFFOLD`)

---

## 1. Cài vào app

### P0016 / P0004 / P0020 (pnpm workspace — khuyến nghị dev)

`pnpm-workspace.yaml` include `../../packages/hub-ui`. Trong app:

```json
"@tool-workspace/hub-ui": "workspace:*"
```

```ts
// vite.config.ts
"@tool-workspace/hub-ui": path.resolve(__dirname, "../../packages/hub-ui/src"),
```

```css
@import "@tool-workspace/hub-ui/styles/hub-check-indicator.css";
/* … full stack — see hub-ui-css-check.mjs */
```

`tsconfig.json`: paths tới `../../packages/hub-ui/src/*` và `../../packages/hub-identity/src/*`.

Chạy `pnpm install` tại **`E:\Dev`** (root workspace). `vendor/hub-ui` / `vendor/hub-identity` vẫn sync cho P0008/P0021/E0001/deploy.

### P0008 / P0021 (vendor copy)

```json
"@tool-workspace/hub-ui": "file:./vendor/hub-ui"
```

Chạy sync script sau mỗi lần sửa hub-ui (Next.js deploy only): `node Tool/scripts/sync-hub-ui-vendor.cjs`

**Vite apps (P0004, P0016, P0020):** dùng `workspace:*` — không cần `vendor/hub-ui`.

---

## 2. CSS bắt buộc (`styles.css`)

```css
@import "@tool-workspace/hub-ui/styles/hub-check-indicator.css";
@import "@tool-workspace/hub-ui/styles/hub-shell-layout.css";
@import "@tool-workspace/hub-ui/styles/hub-app-tab-header.css";
@import "@tool-workspace/hub-ui/styles/hub-fields.css";
@import "@tool-workspace/hub-ui/styles/hub-users-table.css";
```

Theme tokens: copy từ P0004 qua `sync-hub-theme-from-p0004.cjs --target <app>/src`.

**Theme file naming:** tools import `src/theme/hub-console-globals.css` (P0016) or legacy `p0008-globals.css` alias in older apps. Canonical tokens live in that file's `:root` / `.theme-hub` (`--app-tab-header-px`, `--hub-control-h`, …). **Not** the hub-ui package path; hub-ui SSOT is `packages/hub-ui`.

---

## 3. Bootstrap (một lần trong `main.tsx`)

```ts
import { HubLoaderRoot } from "@tool-workspace/hub-ui";
import { setupHubUi } from "./lib/hub-ui-setup";

setupHubUi(); // configureFilterIcons + configureHubChromePrefs

// trong React tree:
<HubLoaderRoot />
```

`hub-ui-setup.ts` — wire filter icons + URL prefs (xem P0016 `src/lib/hub-ui-setup.ts`).

### Boot guard (`index.html` + `main.tsx`)

Keep **`hub-boot-fallback.js` as a sync `<script>` before `main.tsx`** (~2KB, boot-only). Do **not** lazy-load or `manualChunks` it — no perf gain.

```html
<div id="hub-boot-loader" class="hub-boot-loader--pane">…</div>
<script src="/hub-boot-fallback.js"></script>
<script type="module" src="/src/main.tsx"></script>
```

```ts
import { mountHubApp } from "@tool-workspace/hub-ui";

mountHubApp(rootEl, () => {
  createRoot(rootEl).render(/* … */);
});
```

Sync + verify: `node Tool/scripts/lib/sync-hub-boot-public.cjs` · `node Tool/scripts/hub-ui-boot-check.mjs --code P00xx` · recover: `pnpm dev:recover`.

---

## 4. Tab screen — pattern chuẩn (layer 1 + 3)

```tsx
import {
  FilterBar,
  HubTabChrome,
  HubTabScreenBody,
  HubDataTable,
  HubPanel,
  HubAlert,
  type KpiTileData,
} from "@tool-workspace/hub-ui";

// Wrapper giống P0016 TabScreenChrome.tsx:
<HubTabChrome header={<AppTabHeader … />} filterBar={<FilterBar layout="hub" … />}>
  <HubTabScreenBody
    kpis={kpis}
    charts={charts}           // optional MiniBarChart grid
    sectionRuleLabel="Tools"  // pill giữa KPI và nội dung
  >
    <HubDataTable columns={[…]}>{rows}</HubDataTable>
    <HubPanel title="…">…</HubPanel>
  </HubTabScreenBody>
</HubTabChrome>
```

**P0004 reference:** `features/hub/HubListPage.tsx` (inline); package `HubTabScreenBody` = cùng layout (`mt-5` KPI → section pill → `space-y-3`).

---

## 5. Export map

### Shell (sync từ P0004)

| Export | Dùng khi |
|--------|----------|
| `AppTabHeader` | Title, meta, center stats, actions |
| `FilterBar` | Search + faceted filters (`layout="hub"`) |
| `HubTabChrome` | Sticky header + filter stack |
| `KpiStrip`, `MiniBarChart`, `MiniDonut` | KPI / charts band |
| `HubTabSectionRule` | Pill divider (thường qua `HubTabScreenBody`) |
| `MetricBadge`, `ViewToggle`, `HubResultCount` | Header stats, table/card toggle, count |
| `HubDisplayPrefs` | Settings menu (wrap với app `DisplayPrefs.tsx`) |
| `HubLoadingView`, `HubLoaderRoot`, `HubMainChromeStack` | Tab loading — see [HubTabLoadingContract.md](./HubTabLoadingContract.md) |
| `configureFilterIcons`, `configureHubChromePrefs` | App setup |

### Content (package-only — chưa có trong P0004 src)

| Export | Dùng khi |
|--------|----------|
| `HubTabScreenBody` | KPI + section rule + body spacing |
| `HubDataTable`, `HubTableEmptyRow` | `hub-users-table` |
| `HubPanel` | Section card |
| `HubDirectoryCard` | Grid tile (HubToolCard surface) |
| `HubAlert` | Error/warn banner |

### Vẫn copy từ P0004 src (Hub-coupled)

| Concern | P0004 path |
|---------|------------|
| Filter icon map | `lib/badge-registry.ts` → app `*-filter-icons.ts` |
| Faceted counts | `lib/filter-option-counts.ts`, `enrichFilterDefs` |
| Hub list cards | `features/hub/HubToolCard.tsx` |
| Hub time/limit prefs | `HubTimeRangeSelect`, `HubRowLimitSelect` |
| Sidebar | `SalesSidebar` (Hub) · `WorkspaceSidebar` (P0020) |

---

## 6. Chưa có trong package (giới hạn 100% clone)

- `HubToolCard` — copy `features/hub/` hoặc dùng `HubDirectoryCard`
- `HubStickyHeader` — Hub-specific registry meta
- Full theme — phải sync CSS riêng
- Data loading (`hub-load`, `*-client-cache`) — skill § Hub-like data loading

---

## 7. Keyboard shortcuts

| Key | Action |
|-----|--------|
| F | Focus FilterBar search |
| Ctrl+Q | Clear search + filters (`registerHubSearchClear`) |
| S | Open tab Settings panel (`registerHubSettingsOpen`) |
| N | Add / create (`useHubPageShortcuts.onNew`) |
| E | Edit selection (`useHubPageShortcuts.onEdit`) |
| Esc | Close modal (per modal) |

`FilterBar` shows **F** hint. `HubKeyboardHints` for toolbar legend. See `Tool/P0004-Tool-Hub/docs/HUB-KEYBOARD-SHORTCUTS.md`.

---

## 8. Troubleshooting

| Lỗi | Fix |
|-----|-----|
| `does not provide export named 'HubTabScreenBody'` | `pnpm run dev:force` hoặc xóa `node_modules/.vite` |
| Spacing lệch Hub | Thiếu `hub-shell-layout.css` hoặc chưa dùng `HubTabScreenBody` |
| Filter không icon | Gọi `configureFilterIcons` trong setup |
| Table style khác | Import `hub-users-table.css` + dùng `HubDataTable` |
