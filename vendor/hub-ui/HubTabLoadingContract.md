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

---

## AI checklist (new tab / screen)

- [ ] Suspense fallback uses product wrapper with `enabled={activeTab}`
- [ ] Directory fetch uses portaled overlay only when no cached rows
- [ ] No custom “Loading…” header + inline orb (use portaled center)
- [ ] Modals use `portaled={false}` inside `relative` container
- [ ] Banners wrapped in `HubMainChromeStack` if present
- [ ] `HubLoaderRoot mainRef={mainRef}` on `.hub-main`
- [ ] Smoke: hidden inactive tabs must not show `[role="status"]` overlay on active tab

---

## Related files

- `Tool/schemas/ui-patterns.catalog.json` → pattern `tab-loading`
- `packages/hub-ui/src/shell/HubLoadingView.tsx`
- `packages/hub-ui/src/shell/HubScreenChunkFallback.tsx`
- `packages/hub-ui/src/shell/HubLoaderRoot.tsx`
- `packages/hub-ui/src/styles/hub-boot.css`
- P0016: `scripts/smoke-tab-loading.mjs`
