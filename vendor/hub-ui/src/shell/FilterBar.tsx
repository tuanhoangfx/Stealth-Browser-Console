import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  X,
  SlidersHorizontal,
  ChevronDown,
  Check,
  Activity,
  Clock,
  FolderOpen,
  KeyRound,
  Layers,
  Rocket,
  Link2,
  AlertTriangle,
  Pin,
  RefreshCw,
  Share2,
  ShieldCheck,
  BriefcaseBusiness,
  Package,
  Star,
  LayoutTemplate,
} from "lucide-react";
import type { FilterIconMeta } from "./filter-icons";
import { resolveFilterAllIcon, resolveFilterOptionIcon } from "./filter-icons";
import {
  HUB_FILTER_DROPDOWN_LIST_CLASS,
  HUB_FILTER_DROPDOWN_PANEL_CLASS,
  HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS,
  HUB_FILTER_DROPDOWN_ROW_CLASS,
  HubFilterDropdownCircle,
  HubFilterDropdownPanelSearch,
  HUB_FILTER_OPTION_EMOJI_CLASS,
  HUB_FILTER_BRAND_ICON_CLASS,
  hubBrandIconImgClass,
  type HubBrandIconShell,
  filterDropdownPanelSearchPlaceholder,
  hubFilterTriggerClass,
  multiFilterTriggerTitle,
} from "./filter-dropdown-primitives";
import { compactIconSize } from "../ui-scale";
import { registerHubSearchClear, registerHubSearchFocus } from "../keyboard/hub-keyboard-shortcuts";
import { HubSearchField } from "./HubSearchField";

export type FilterOption = {
  value: string;
  label: string;
  color?: string;
  count?: number;
  iconSrc?: string;
  /** Brand img shell — bare (colored), tile (dark mark), darkInk (white mono). Default bare. */
  iconShell?: HubBrandIconShell;
  emoji?: string;
};
export type FilterDef = {
  key: string;
  label: string;
  options: FilterOption[];
  showAllLabel?: boolean;
  totalCount?: number;
  triggerEmoji?: string;
  /** Skip lucide/semantic fallback on trigger when no option icon (brand filters). */
  suppressDefaultTriggerIcon?: boolean;
};

const FILTER_ICONS: Record<string, React.ElementType> = {
  health: Activity,
  category: Layers,
  deploy: Rocket,
  role: ShieldCheck,
  tool: Package,
  project: BriefcaseBusiness,
  status: Activity,
  drift: AlertTriangle,
  kind: Link2,
  links: Link2,
  sync: RefreshCw,
  org: Layers,
  region: Layers,
  plan: Layers,
  entity: Layers,
  group: Layers,
  template: LayoutTemplate,
  pinned: Pin,
  share: Share2,
  folder: FolderOpen,
  service: KeyRound,
  usage: Clock,
};

export type FilterValues = Record<string, string[]>;

export type FilterBarProps = {
  placeholder?: string;
  filters?: FilterDef[];
  query: string;
  onQueryChange: (q: string) => void;
  values: FilterValues;
  onValuesChange: (next: FilterValues) => void;
  /** Row 1 — immediately after search (selection chip `x/y`). */
  searchTrailing?: React.ReactNode;
  /** Row 1 trailing (view toggle, counts) — used with layout="hub". */
  toolbar?: React.ReactNode;
  /** Row 2 leading — before filter dropdowns in hub layout. */
  row2Leading?: React.ReactNode;
  /** Row 2 trailing actions — right side of filter row (before Clear filters). */
  row2Actions?: React.ReactNode;
  /** Row 2 far-right — selection chip after bulk actions (P0003 golden). */
  row2Trailing?: React.ReactNode;
  /** Single-row trailing (legacy / Links panel). */
  trailing?: React.ReactNode;
  layout?: "inline" | "hub";
  /** Hub: sticky below tab header; section divider sits under this block. */
  pinSticky?: boolean;
  /** When pinSticky, offset for sticky tab header above. */
  headerPinned?: boolean;
  /** Panel only (inside shared sticky chrome with header). */
  embedded?: boolean;
  shortcutScope?: string;
  /** Hub dashboard-style row: filters only, no search field or F shortcut. */
  hideSearch?: boolean;
  /** Inside HubSplitDirectoryPane — parent owns border/bg; no nested panel chrome. */
  frameless?: boolean;
};

export function FilterBar({
  placeholder = "Search...",
  filters = [],
  query,
  onQueryChange,
  values,
  onValuesChange,
  searchTrailing,
  toolbar,
  row2Leading,
  row2Actions,
  row2Trailing,
  trailing,
  layout = "inline",
  pinSticky = false,
  headerPinned = true,
  embedded = false,
  shortcutScope = "default",
  hideSearch = false,
  frameless = false,
}: FilterBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const clearAllRef = useRef<() => void>(() => {});

  function setFilter(key: string, selected: string[]) {
    const next = { ...values };
    if (selected.length === 0) delete next[key];
    else next[key] = selected;
    onValuesChange(next);
  }

  function clearAll() {
    onQueryChange("");
    onValuesChange({});
  }

  clearAllRef.current = clearAll;

  useEffect(() => {
    const unregisterFocus = hideSearch
      ? () => {}
      : registerHubSearchFocus(shortcutScope, () => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
    const unregisterClear = registerHubSearchClear(
      shortcutScope,
      () => clearAllRef.current(),
      hideSearch ? undefined : () => inputRef.current,
    );
    return () => {
      unregisterFocus();
      unregisterClear();
    };
  }, [shortcutScope, hideSearch]);

  const hasActive = query !== "" || filters.some((f) => (values[f.key]?.length ?? 0) > 0);
  const activeCount =
    (query ? 1 : 0) + filters.reduce((n, f) => n + (values[f.key]?.length ?? 0), 0);

  const searchField = (
    <HubSearchField
      inputRef={inputRef}
      value={query}
      onChange={onQueryChange}
      placeholder={placeholder}
      className={layout === "hub" ? "min-w-0" : ""}
    />
  );

  const clearFiltersBtn = hasActive ? (
    <button
      type="button"
      onClick={clearAll}
      className="inline-flex h-[var(--hub-control-h)] shrink-0 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-medium text-rose-200 transition-colors hover:bg-rose-500/20"
      title="Clear search and all filters"
    >
      Clear filters
      <span className="grid h-4 min-w-[var(--hub-count-badge-min-w)] place-items-center rounded-full bg-rose-500/80 px-1 text-[9px] font-bold text-white">
        {activeCount}
      </span>
    </button>
  ) : null;

  const filterDropdowns = filters.map((f) => (
    <HubMultiFilterDropdown
      key={f.key}
      filter={f}
      selected={values[f.key] ?? []}
      onChange={(vals) => setFilter(f.key, vals)}
    />
  ));

  if (layout === "hub") {
    const stickyTop = headerPinned ? "top-[var(--app-tab-header-sticky-h)]" : "top-0";
    const panel = (
      <div
        className={
          frameless
            ? "space-y-2"
            : "space-y-2 rounded-2xl border border-white/5 bg-[var(--panel)] p-3"
        }
      >
        <div className="flex w-full min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {hideSearch ? null : searchField}
            {searchTrailing}
          </div>
          {toolbar ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{toolbar}</div>
          ) : null}
        </div>
        <div className="flex min-h-[var(--hub-control-h)] flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {row2Leading ? <div className="flex shrink-0 flex-wrap items-center gap-2">{row2Leading}</div> : null}
            {filterDropdowns}
            {clearFiltersBtn}
          </div>
          {row2Actions ? (
            <div className="ml-auto flex min-w-0 shrink flex-wrap items-center justify-end gap-2">{row2Actions}</div>
          ) : null}
          {row2Trailing ? <div className="shrink-0">{row2Trailing}</div> : null}
        </div>
      </div>
    );

    if (embedded) {
      return <div className="px-6 pb-3 pt-0">{panel}</div>;
    }

    if (!pinSticky) return panel;

    return (
      <div
        className={`hub-filter-sticky sticky z-[35] -mx-6 border-b border-white/5 bg-[var(--bg)] px-6 pb-3 pt-0 ${stickyTop}`}
      >
        {panel}
      </div>
    );
  }

  const filterRow = (
    <>
      {filterDropdowns}
      {clearFiltersBtn}
    </>
  );

  return (
    <div className="space-y-2 rounded-2xl border border-white/5 bg-[var(--panel)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        {hideSearch ? null : searchField}
        {filterRow}
        {trailing ? <div className="ml-auto flex items-center gap-2">{trailing}</div> : null}
      </div>
      {hasActive ? (
        <ActivePills
          query={query}
          onClearQ={() => onQueryChange("")}
          filters={filters}
          values={values}
          onClearAll={clearAll}
          onRemove={setFilter}
        />
      ) : null}
    </div>
  );
}

function FilterIconGlyph({ meta, size = compactIconSize(14) }: { meta: FilterIconMeta; size?: number }) {
  const Icon = meta.icon;
  return <Icon size={size} className={`shrink-0 ${meta.className}`} aria-hidden />;
}

function FilterOptionCount({ value }: { value?: number }) {
  if (value === undefined) return null;
  return (
    <span className="ml-auto shrink-0 tabular-nums text-[10px] font-medium text-[var(--muted)]">{value}</span>
  );
}

function FilterOptionGlyph({ filterKey, option }: { filterKey: string; option: FilterOption }) {
  if (option.emoji) {
    return (
      <span className={HUB_FILTER_OPTION_EMOJI_CLASS} aria-hidden>
        {option.emoji}
      </span>
    );
  }
  if (option.iconSrc) {
    return (
      <img
        src={option.iconSrc}
        alt=""
        className={hubBrandIconImgClass(option.iconShell)}
        aria-hidden
      />
    );
  }
  const meta = resolveFilterOptionIcon(filterKey, option.value);
  if (!meta) {
    return option.color ? (
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: option.color }} aria-hidden />
    ) : null;
  }
  return <FilterIconGlyph meta={meta} />;
}

function FilterAllRowGlyph({ filter }: { filter: FilterDef }) {
  if (filter.triggerEmoji) {
    return (
      <span className={HUB_FILTER_OPTION_EMOJI_CLASS} aria-hidden>
        {filter.triggerEmoji}
      </span>
    );
  }
  const allIcon = resolveFilterAllIcon(filter.key);
  if (allIcon) return <FilterIconGlyph meta={allIcon} />;
  return null;
}

function filterAllRowLabel(filter: FilterDef): string {
  return filter.showAllLabel ? `All ${filter.label}` : filter.label;
}

function resolveFilterTriggerIcon(filter: FilterDef, selected: string[]): FilterIconMeta | null {
  if (selected.length === 1) {
    const opt = filter.options.find((o) => o.value === selected[0]);
    if (opt) {
      const icon = resolveFilterOptionIcon(filter.key, opt.value);
      if (icon) return icon;
    }
  }
  const allIcon = resolveFilterAllIcon(filter.key);
  if (allIcon) return allIcon;
  if (filter.suppressDefaultTriggerIcon) return null;
  const Fallback = FILTER_ICONS[filter.key];
  if (Fallback) return { icon: Fallback, className: "opacity-75" };
  return null;
}

export type HubMultiFilterDropdownProps = {
  filter: FilterDef;
  selected: string[];
  onChange: (values: string[]) => void;
  className?: string;
  triggerClassName?: string;
  /** `label-value` (default): `Label: value`. `value`: selected option label only. */
  triggerFormat?: "label-value" | "value";
  /** Native button title — assignee tooltip, etc. */
  triggerTitle?: string;
  usePortal?: boolean;
};

export function HubMultiFilterDropdown({
  filter,
  selected,
  onChange,
  className = "",
  triggerClassName = "",
  triggerFormat = "label-value",
  triggerTitle,
  usePortal = true,
}: HubMultiFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 288 });

  useLayoutEffect(() => {
    if (!open || !usePortal || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 288),
    });
  }, [open, usePortal]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (usePortal && (e.target as Element).closest?.("[data-hub-multi-filter-panel]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, usePortal]);

  const filtered = filter.options.filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()));
  const allValues = filter.options.map((o) => o.value);
  const allSelected = selected.length > 0 && selected.length === allValues.length;
  const someSelected = selected.length > 0 && !allSelected;

  function toggle(v: string) {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  }
  function toggleAll() {
    if (allSelected) onChange([]);
    else onChange(allValues);
  }

  const buttonLabel = (() => {
    if (triggerFormat === "value") {
      if (selected.length === 0) return filter.showAllLabel ? `All ${filter.label}` : filter.label;
      if (selected.length === 1) {
        const opt = filter.options.find((o) => o.value === selected[0]);
        return opt?.label ?? selected[0];
      }
      return `${selected.length} selected`;
    }
    if (selected.length === 0) return filter.showAllLabel ? `All ${filter.label}` : filter.label;
    if (selected.length === 1) {
      const opt = filter.options.find((o) => o.value === selected[0]);
      return opt?.label ?? selected[0];
    }
    return `${selected.length} selected`;
  })();

  const triggerIcon = resolveFilterTriggerIcon(filter, selected);
  const selectedOpt = selected.length === 1 ? filter.options.find((o) => o.value === selected[0]) : undefined;
  const triggerIconSrc = selectedOpt?.iconSrc;
  const showTotalOnTrigger = selected.length === 0 && filter.totalCount !== undefined;
  const resolvedTriggerTitle =
    triggerTitle ??
    (selected.length > 1
      ? multiFilterTriggerTitle(selected, filter.options)
      : selected.length === 1
        ? filter.options.find((o) => o.value === selected[0])?.label
        : undefined);

  return (
    <div ref={ref} className={`relative ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        title={resolvedTriggerTitle}
        onClick={() => setOpen((v) => !v)}
        className={`${hubFilterTriggerClass(selected.length > 0)}${triggerClassName ? ` ${triggerClassName}` : ""}`}
      >
        {triggerIconSrc ? (
          <img
            src={triggerIconSrc}
            alt=""
            className={`${hubBrandIconImgClass(selectedOpt?.iconShell)} !h-3 !w-3`}
            aria-hidden
          />
        ) : selected.length === 1 && selectedOpt?.color ? (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selectedOpt.color }} aria-hidden />
        ) : filter.triggerEmoji ? (
          <span className={HUB_FILTER_OPTION_EMOJI_CLASS} aria-hidden>
            {filter.triggerEmoji}
          </span>
        ) : selectedOpt?.emoji ? (
          <span className={HUB_FILTER_OPTION_EMOJI_CLASS} aria-hidden>
            {selectedOpt.emoji}
          </span>
        ) : triggerIcon ? (
          <FilterIconGlyph meta={triggerIcon} size={compactIconSize(12)} />
        ) : selectedOpt?.color ? (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selectedOpt.color }} aria-hidden />
        ) : null}
        <span>{buttonLabel}</span>
        {showTotalOnTrigger ? (
          <span className="shrink-0 tabular-nums text-[10px] font-medium text-[var(--muted)]">{filter.totalCount}</span>
        ) : null}

        <ChevronDown size={compactIconSize(12)} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        usePortal ? (
          createPortal(
            <div
              data-hub-multi-filter-panel
              className={HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS}
              style={{
                position: "fixed",
                top: panelPos.top,
                left: panelPos.left,
                width: panelPos.width,
                zIndex: 2500,
              }}
              role="listbox"
            >
              <HubFilterDropdownPanelSearch
                value={search}
                onChange={setSearch}
                placeholder={filterDropdownPanelSearchPlaceholder(filter.label)}
              />
              <div className={HUB_FILTER_DROPDOWN_LIST_CLASS}>
                <button type="button" onClick={toggleAll} className={HUB_FILTER_DROPDOWN_ROW_CLASS}>
                  <HubFilterDropdownCircle checked={allSelected} indeterminate={someSelected} />
                  <FilterAllRowGlyph filter={filter} />
                  <span className="min-w-0 flex-1 truncate text-left">{filterAllRowLabel(filter)}</span>
                  <FilterOptionCount
                    value={
                      filter.totalCount ??
                      (filter.options.some((o) => o.count !== undefined)
                        ? filter.options.reduce((sum, o) => sum + (o.count ?? 0), 0)
                        : filter.options.length)
                    }
                  />
                </button>
                <div className="my-1 border-t border-white/5" />
                {filtered.map((o) => (
                  <button key={o.value} type="button" onClick={() => toggle(o.value)} className={HUB_FILTER_DROPDOWN_ROW_CLASS}>
                    <HubFilterDropdownCircle checked={selected.includes(o.value)} />
                    <FilterOptionGlyph filterKey={filter.key} option={o} />
                    <span className="min-w-0 flex-1 truncate text-left" title={o.label}>
                      {o.label}
                    </span>
                    <FilterOptionCount value={o.count} />
                  </button>
                ))}
                {filtered.length === 0 ? <div className="py-4 text-center text-xs text-[var(--muted)]">No matches</div> : null}
              </div>
            </div>,
            document.body,
          )
        ) : (
          <div className={`${HUB_FILTER_DROPDOWN_PANEL_CLASS} absolute left-0 top-full z-30 mt-1`} role="listbox">
            <HubFilterDropdownPanelSearch
              value={search}
              onChange={setSearch}
              placeholder={filterDropdownPanelSearchPlaceholder(filter.label)}
            />
            <div className={HUB_FILTER_DROPDOWN_LIST_CLASS}>
              <button type="button" onClick={toggleAll} className={HUB_FILTER_DROPDOWN_ROW_CLASS}>
                <HubFilterDropdownCircle checked={allSelected} indeterminate={someSelected} />
                <FilterAllRowGlyph filter={filter} />
                <span className="min-w-0 flex-1 truncate text-left">{filterAllRowLabel(filter)}</span>
                <FilterOptionCount
                  value={
                    filter.totalCount ??
                    (filter.options.some((o) => o.count !== undefined)
                      ? filter.options.reduce((sum, o) => sum + (o.count ?? 0), 0)
                      : filter.options.length)
                  }
                />
              </button>
              <div className="my-1 border-t border-white/5" />
              {filtered.map((o) => (
                <button key={o.value} type="button" onClick={() => toggle(o.value)} className={HUB_FILTER_DROPDOWN_ROW_CLASS}>
                  <HubFilterDropdownCircle checked={selected.includes(o.value)} />
                  <FilterOptionGlyph filterKey={filter.key} option={o} />
                  <span className="min-w-0 flex-1 truncate text-left" title={o.label}>
                    {o.label}
                  </span>
                  <FilterOptionCount value={o.count} />
                </button>
              ))}
              {filtered.length === 0 ? <div className="py-4 text-center text-xs text-[var(--muted)]">No matches</div> : null}
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}

export type HubSingleFilterDropdownProps = {
  filterKey: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  usePortal?: boolean;
  /** `label-value` (default): `Label: value`. `value`: selected option label only — pair with external `HubFormFieldLabel`. */
  triggerFormat?: "label-value" | "value";
};

/** Single-select — identical trigger/panel chrome as `HubMultiFilterDropdown`. */
export function HubSingleFilterDropdown({
  filterKey,
  label,
  options,
  value,
  onChange,
  disabled = false,
  className = "",
  triggerClassName = "",
  usePortal = true,
  triggerFormat = "label-value",
}: HubSingleFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 288 });

  const filter: FilterDef = { key: filterKey, label, options };
  const selected = value ? [value] : [];

  useLayoutEffect(() => {
    if (!open || !usePortal || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 288),
    });
  }, [open, usePortal]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (usePortal && (e.target as Element).closest?.("[data-hub-single-filter-panel]")) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, usePortal]);

  const filtered = options.filter(
    (o) => !search || o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const opt = options.find((o) => o.value === value);
  const triggerIcon = resolveFilterTriggerIcon(filter, selected);
  const triggerIconNode = opt?.emoji ? (
    <span className={HUB_FILTER_OPTION_EMOJI_CLASS} aria-hidden>
      {opt.emoji}
    </span>
  ) : triggerIcon ? (
    <FilterIconGlyph meta={triggerIcon} size={compactIconSize(12)} />
  ) : undefined;

  const panelInner = (
    <>
      <HubFilterDropdownPanelSearch
        value={search}
        onChange={setSearch}
        placeholder={filterDropdownPanelSearchPlaceholder(label)}
      />
      <div className={HUB_FILTER_DROPDOWN_LIST_CLASS}>
        {filtered.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
            className={HUB_FILTER_DROPDOWN_ROW_CLASS}
          >
            <HubFilterDropdownCircle checked={o.value === value} />
            <FilterOptionGlyph filterKey={filterKey} option={o} />
            <span className="min-w-0 flex-1 truncate text-left" title={o.label}>
              {o.label}
            </span>
            <FilterOptionCount value={o.count} />
          </button>
        ))}
        {filtered.length === 0 ? (
          <div className="py-4 text-center text-xs text-[var(--muted)]">No matches</div>
        ) : null}
      </div>
    </>
  );

  const panelEl = open ? (
    <div
      data-hub-single-filter-panel
      className={usePortal ? HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS : HUB_FILTER_DROPDOWN_PANEL_CLASS}
      style={
        usePortal
          ? {
              position: "fixed",
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              zIndex: 2500,
            }
          : undefined
      }
      role="listbox"
    >
      {panelInner}
    </div>
  ) : null;

  return (
    <div ref={ref} className={`relative shrink-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`${hubFilterTriggerClass(selected.length > 0)}${triggerClassName ? ` ${triggerClassName}` : ""}`}
      >
        {triggerIconNode}
        <span className="min-w-0 truncate">
          {triggerFormat === "value" ? (
            opt?.label ?? label
          ) : (
            <>
              <span className="hub-filter-trigger-text__prefix">{label}:</span>{" "}
              <span className="hub-filter-trigger-text__value">{opt?.label ?? label}</span>
            </>
          )}
        </span>
        <ChevronDown size={compactIconSize(12)} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {panelEl &&
        (usePortal ? createPortal(panelEl, document.body) : (
          <div className="absolute left-0 top-full z-30 mt-1">{panelEl}</div>
        ))}
    </div>
  );
}

function ActivePills({
  query,
  onClearQ,
  filters,
  values,
  onClearAll,
  onRemove,
}: {
  query: string;
  onClearQ: () => void;
  filters: FilterDef[];
  values: FilterValues;
  onClearAll: () => void;
  onRemove: (key: string, selected: string[]) => void;
}) {
  const activeItems: { key: string; value: string; label: string; iconMeta: FilterIconMeta | null }[] = [];
  for (const f of filters) {
    for (const v of values[f.key] ?? []) {
      const opt = f.options.find((o) => o.value === v);
      activeItems.push({
        key: f.key,
        value: v,
        label: `${f.label}: ${opt?.label ?? v}`,
        iconMeta: opt ? resolveFilterOptionIcon(f.key, opt.value) : null,
      });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2 text-xs">
      <SlidersHorizontal size={compactIconSize(10)} className="text-[var(--muted)]" />
      <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Active:</span>
      {query ? (
        <button
          type="button"
          onClick={onClearQ}
          className="badge cursor-pointer border border-indigo-500/30 bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25"
        >
          q: &quot;{query}&quot; <X size={compactIconSize(10)} className="ml-1" />
        </button>
      ) : null}
      {activeItems.map((it) => {
        const PillIcon = it.iconMeta?.icon;
        return (
        <button
          key={`${it.key}:${it.value}`}
          type="button"
          onClick={() => onRemove(it.key, (values[it.key] ?? []).filter((v) => v !== it.value))}
          className="badge inline-flex cursor-pointer items-center gap-1 border border-white/15 bg-white/10 hover:bg-white/15"
        >
          {PillIcon ? <PillIcon size={compactIconSize(10)} className={it.iconMeta!.className} aria-hidden /> : null}
          {it.label} <X size={compactIconSize(10)} className="ml-0.5" />
        </button>
        );
      })}
      <button type="button" onClick={onClearAll} className="ml-auto text-[10px] text-rose-300 hover:underline">
        Clear all
      </button>
    </div>
  );
}
