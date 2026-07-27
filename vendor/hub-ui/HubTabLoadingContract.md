# Hub Tab Loading Contract (Golden Pattern)

**Scope:** P0004 Tool Hub and all Hub-shell products (P0016, P0020, P0008).  
**Canonical API:** `@tool-workspace/hub-ui` — `HubLoadingView`, `HubScreenChunkFallback`, `HubLoaderRoot`.  
**CSS:** `hub-boot.css` — `.hub-tab-loader-fill`, `.hub-tab-loader-inline`.

---

## When to use which mode

| Scenario | Component | `portaled` | `enabled` | `variant` |
|----------|-----------|------------|-----------|-----------|
| Lazy route / Suspense chunk (tab first paint) | `HubScreenChunkFallback` or product wrapper | `true` (default) | `screen === activeTab` | `overlay` |
| Directory initial fetch (no cached rows) | `HubLoadingView` / `ConsolePaneLoading` | `true` (default) | `active` prop on screen | `overlay` |
| Modal / nested panel fetch | `HubLoadingView` | **`false`** | `true` | `overlay` |
| Hidden tab still mounted (visited set) | any portaled loader | `true` | **`false`** — mandatory | any |

**Rule:** Portaled loaders **must** use `enabled={active}` (or equivalent) whenever multiple tabs can mount in the DOM. Inactive tabs must not portal over the active screen.

**Rule:** Never wrap a portaled loader in `relative min-h-[320px]` — the orb portals to `#hub-tab-loader-root` and ignores that box.

---

## Product wrappers

| Product | Suspense fallback | Directory fetch |
|---------|-------------------|-----------------|
| P0004 | `AppScreenLoadingView` | `HubLoadingView` / `UsersLoadingView` |
| P0016 | `ConsoleLoadingView` | `ConsolePaneLoading` |

Both wrappers delegate to `HubScreenChunkFallback` / `HubLoadingView` with defaults from this contract.

---

## Layout requirements

### 1. Loader portal root

Mount once inside `.hub-main`:

```tsx
<HubLoaderRoot mainRef={mainRef} />
```

`HubLoaderRoot` ensures `#hub-tab-loader-root` on `document.body` and syncs chrome inset.

### 2. Main chrome stack

Banners/alerts **above** tab content must be wrapped:

```tsx
<HubMainChromeStack>
  <DevPortBanner />
  <WorkerStatusBanner />
</HubMainChromeStack>
```

This sets `--hub-main-chrome-top` so the portaled orb centers in the **content pane**, not the full viewport.

### 3. Multi-tab mount guard

```tsx
{visited.has("inbox") ? (
  <ScreenPanel active={screen === "inbox"} hidden={!active}>
    <Suspense fallback={<ConsoleLoadingView screen="inbox" enabled={screen === "inbox"} />}>
      …
    </Suspense>
  </ScreenPanel>
) : null}
```

Use HTML `hidden={!active}` on inactive panels — Tailwind `hidden` alone is not enough for loader overlap regressions.

---

## CSS variables

| Variable | Default | Set by |
|----------|---------|--------|
| `--hub-sidebar-width` | `15rem` | `hub-shell-layout.css` / theme |
| `--hub-main-chrome-top` | `0px` | `HubLoaderRoot` + `[data-hub-main-chrome]` ResizeObserver |

Portaled loader box:

```css
.hub-tab-loader-fill {
  position: fixed;
  top: var(--hub-main-chrome-top, 0px);
  left: var(--hub-sidebar-width, 15rem);
  right: 0;
  bottom: 0;
  display: grid;
  place-items: center;
}
```

---

## Inline mode (modals only)

```tsx
<div className="relative min-h-[8rem]">
  <HubLoadingView icon={Users} ariaLabel="Loading members" variant="overlay" portaled={false} />
</div>
```

Parent **must** be `position: relative` with explicit min-height. Inline uses `.hub-tab-loader-inline { position: absolute; inset: 0; }`.

---

## Worker health probe (P0016 / P00xx worker)

Console and header chips must **not** call full `GET /api/health` on every boot — full payload includes messenger activity blobs and can block first paint for seconds.

| Use case | Endpoint | Notes |
|----------|----------|--------|
| Worker online chip, auth policy boot, gate scripts | `GET /api/health?lite=1` | `{ ok, product, hub?, worker }` only |
| Dashboard / channel status panels | `GET /api/health` | Full payload when UI needs messenger activities |

Implement `?lite=1` on worker routes that today return heavy health JSON. Front-end: `useWorkerHealth`, `useHubAuthState` policy probe.

---

## Performance (cache-first)

1. **Suspense fallback** — only while JS chunk loads; prefetch tab chunks on boot / sidebar hover (after auth session is ready — never flood APIs from AuthShell).
2. **Directory overlay** — only when `loading && rows.length === 0` (no stale cache painted).
3. **Revalidate** — use `useStaleWhileRevalidateDirectory` / `@dev/hub-load`; do not show full overlay when stale data is visible.
4. **Tab switch** — reset `.hub-main` scroll only (`resetHubMainPane`); never `replaceChildren()` on `#hub-tab-loader-root` while Suspense fallbacks are mounted (React `removeChild` crash). Use `enabled={activeTab}` on fallbacks instead.
5. **Inactive pipeline freeze** — visited keep-alive tabs must not recompute O(n) filter/KPI/chart work on every parent re-render. Use hub-ui `useTabFrozenRows(tabActive, compute, deps)` (P0005 golden) or short-circuit like P0020 `analyticsBandActive`.
6. **Defer directory chrome** — first paint after activate = table/shell; facet counts + KPI/charts via `useHubDirectoryChromeReady(tabActive)` (see `Tool/docs/ssot/hub-visited-tab-perf.md`).

---

## Workspace directory chrome lift (`syncKey` vs `statsKey`)

P0020 / P0004 workspace shells lift FilterBar + header stats into the app chrome via `useWorkspaceDirectoryChrome`.

**Inactive publisher:** When `enabled` is false, the hook must **not** clear toolbar / bulk / selection / header stats (same rule as `useDirectoryBandSync`). Dual-mount vaults (Teams + Account body) share one provider — a wiping inactive sibling would blank Display, `0/n`, and New/Detail/Delete after the active vault lifts them. Clear only on unmount.

| Key | Bump when | Lifts |
|-----|-----------|--------|
| **`syncKey`** | Toolbar slots, view mode, selection *presence* (optional boolean) | `toolbar`, `filterToolbar`, `directoryViewMode` — keep **stable** (no row counts) so Display dropdown / filter chrome do not remount |
| **`statsKey`** | Row totals, filter result counts, async pivot ready, facet option counts, **and selection count when bulk/Detail badges embed counts** | `centerStats`, `filterSelectionToolbar`, and toolbar/bulk row when they embed counts |

**Rule:** Never put row counts in `syncKey` if toolbar ReactNodes must stay mounted. Use optional `statsKey` when header shows `0 shown` while the table body already has rows (chrome lift ran before async pivot finished), or when facet counts / bulk actions must refresh without clearing FilterBar chips.

**Selection count (required for bulk CTA badges):** If `filterToolbar` embeds `HubDirectoryAdaptiveEditAction` / Detail badge with `selectedCount`, **`statsKey` must include that count** (or `selectedRows.length`). Bumping only a boolean `sel` / empty in `syncKey` freezes the badge after the first selected row (table checkboxes update; Detail stays at `(1)`).

```tsx
useP0020DirectoryChrome({
  syncKey: `${vaultScope}|${viewMode}`,
  // Include selection count — not only row totals — when bulk bar shows Detail (N).
  statsKey: `${allRows.length}|${sortedRows.length}|${pivotReady ? 1 : 0}|${selectedCount}`,
  centerStats,
  // ...
});
```

Verify:

```bash
node Tool/scripts/verify-p0020-workspace-chrome.mjs --code P0020
```

---

## AI checklist (new tab / screen)

- [ ] Suspense fallback uses product wrapper with `enabled={activeTab}`
- [ ] Directory fetch uses portaled overlay only when no cached rows
- [ ] No custom “Loading…” header + inline orb (use portaled center)
- [ ] Modals use `portaled={false}` inside `relative` container
- [ ] Banners wrapped in `HubMainChromeStack` if present
- [ ] `HubLoaderRoot mainRef={mainRef}` on `.hub-main`
- [ ] Smoke: hidden inactive tabs must not show `[role="status"]` overlay on active tab
- [ ] Heavy filter/KPI/chart pipelines gated with `useTabFrozenRows` / `tabActive` short-circuit
- [ ] Large directories: `useHubDirectoryChromeReady` before facet counts + KPI/charts; `{tabActive ? <HubDirectoryScreen/> : null}`
- [ ] **Clone bulk chrome:** if `filterToolbar` embeds Detail/bulk badges with `selectedCount`, set `statsKey: \`${rows}|${filtered}|${selectedCount}\`` (never only a boolean `sel` in `syncKey`) — see section above
- [ ] **P0020 Account vaults:** Services / Mail / Facebook / TikTok / Material / Partner / Bank share one `useHubVaultBoot` + `DirectoryBootGate` (scope = filters/columns only — not a separate boot path)

---

## Related files

- `Tool/schemas/ui-patterns.catalog.json` → pattern `tab-loading`
- `packages/hub-ui/src/shell/HubLoadingView.tsx`
- `packages/hub-ui/src/shell/HubScreenChunkFallback.tsx`
- `packages/hub-ui/src/shell/HubLoaderRoot.tsx`
- `packages/hub-ui/src/loading/useTabFrozenRows.ts`
- `packages/hub-ui/src/loading/useHubDirectoryChromeReady.ts`
- `packages/hub-ui/src/directory-band/useWorkspaceDirectoryChrome.tsx` — `syncKey` / `statsKey`
- `Tool/docs/ssot/hub-visited-tab-perf.md`
- `packages/hub-ui/src/styles/hub-boot.css`
- P0016: `scripts/smoke-tab-loading.mjs`
- P0005: `Tool/scripts/smoke-p0005-tab-switch-timing.mjs`
