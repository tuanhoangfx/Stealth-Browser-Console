import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { TABLE_PAGE_SIZE_OPTIONS } from "./constants";
import { buildSemanticTocIcon, resolveSemanticIcon } from "../lib/semantic-icon-registry";
import { patchHubListPrefs } from "../lib/hub-url-prefs";
import { compactIconSize } from "../ui-scale";
import {
  HUB_TABLE_PAGE_SIZE_DEFAULT,
  patchHubTablePageSizeValue,
  useHubTablePageSize,
} from "../table/hub-table-page-size";
import { MAX_VISIBLE_CHART } from "./chart-visible";
import { MAX_VISIBLE_KPI } from "./kpi-visible";
import { Section, ToggleRow } from "./primitives";
import {
  countVisiblePrefs,
  defaultsForPrefItems,
  isHubPrefVisible,
  toggleHubPrefSet,
} from "./hub-display-visibility";
import type { HubDisplayPrefsProps, PrefItem } from "./types";

export type HubDirectoryDisplayPanelProps = Pick<
  HubDisplayPrefsProps,
  | "kpis"
  | "charts"
  | "filters"
  | "headerStats"
  | "defaultKpiKeys"
  | "defaultChartKeys"
  | "defaultFilterKeys"
  | "defaultHeaderStatKeys"
  | "headerStatLabel"
  | "filterParam"
  | "filtersFromUrl"
  | "readPrefs"
  | "patchPrefs"
  | "getScreen"
  | "getSystemTab"
  | "systemDisplay"
  | "getSubTab"
  | "subTabDisplay"
  | "onLog"
  | "tablePanel"
  | "tableSectionActions"
  | "tableActiveCount"
>;

function parseSet(raw: string | null): Set<string> | null {
  if (raw === null) return null;
  if (raw === "") return new Set();
  return new Set(raw.split(",").filter(Boolean));
}

function searchParam(key: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(key);
}

function PanelSection({
  label,
  icon,
  headerActions,
  children,
}: {
  label: string;
  icon?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="hub-directory-display-panel__section">
      <div className="hub-directory-display-panel__section-head">
        <div className="hub-directory-display-panel__section-title">
          {icon}
          <span>{label}</span>
        </div>
        {headerActions ? <div className="shrink-0">{headerActions}</div> : null}
      </div>
      <div className="hub-directory-display-panel__section-body">{children}</div>
    </div>
  );
}

/** Single search-bar control — KPI · Charts · header · filters · table columns. */
export function HubDirectoryDisplayPanel({
  kpis = [],
  charts = [],
  filters: tabFilters = [],
  headerStats: headerStatsProp = [],
  defaultKpiKeys,
  defaultChartKeys,
  defaultFilterKeys,
  defaultHeaderStatKeys,
  headerStatLabel = (isSystem) => (isSystem ? "System header" : "Hub header"),
  filterParam = "hfilt",
  filtersFromUrl = false,
  readPrefs,
  patchPrefs,
  getScreen,
  getSystemTab,
  systemDisplay,
  getSubTab,
  subTabDisplay,
  onLog,
  tablePanel,
  tableSectionActions,
  showPageSize = true,
}: HubDirectoryDisplayPanelProps & { showPageSize?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState(readPrefs);
  const [screen, setScreen] = useState(getScreen);
  const [systemTab, setSystemTab] = useState(() => getSystemTab?.() ?? "");
  const [subTab, setSubTab] = useState(() => getSubTab?.() ?? "");
  const [displayTick, setDisplayTick] = useState(0);

  const rawFilters = searchParam(filterParam);

  useEffect(() => {
    const subTabChangeEvent = subTabDisplay?.changeEvent ?? "subtab-display-change";
    const sync = () => {
      setScreen(getScreen());
      if (getSystemTab) setSystemTab(getSystemTab());
      if (getSubTab) setSubTab(getSubTab());
      setDisplayTick((tick) => tick + 1);
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("system-display-change", sync);
    window.addEventListener(subTabChangeEvent, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("system-display-change", sync);
      window.removeEventListener(subTabChangeEvent, sync);
    };
  }, [getScreen, getSystemTab, getSubTab, subTabDisplay?.changeEvent]);

  useEffect(() => {
    const sync = () => setPrefs(readPrefs());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [readPrefs]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const isSystem = screen === "system";
  const effectiveSubTab = isSystem && subTabDisplay?.screens.includes("system") ? systemTab : subTab;
  const usesSubTabDisplay = Boolean(
    subTabDisplay?.screens.includes(screen) && effectiveSubTab && subTabDisplay?.adapter,
  );
  const usesLegacySystemDisplay = Boolean(isSystem && systemDisplay && systemTab && !usesSubTabDisplay);

  const systemSlice = useMemo(() => {
    void displayTick;
    return usesLegacySystemDisplay ? systemDisplay!.read(systemTab) : null;
  }, [usesLegacySystemDisplay, systemDisplay, systemTab, displayTick]);

  const subTabSlice = useMemo(() => {
    void displayTick;
    return usesSubTabDisplay ? subTabDisplay!.adapter.read(effectiveSubTab) : null;
  }, [usesSubTabDisplay, subTabDisplay, effectiveSubTab, displayTick]);

  const visKpiEffective = usesSubTabDisplay
    ? (subTabSlice?.kpi ?? null)
    : usesLegacySystemDisplay
      ? (systemSlice?.kpi ?? null)
      : prefs.kpi;
  const visChartsEffective = usesSubTabDisplay
    ? (subTabSlice?.charts ?? null)
    : usesLegacySystemDisplay
      ? (systemSlice?.charts ?? null)
      : prefs.charts;
  const visHubFilters = filtersFromUrl ? parseSet(rawFilters) : (prefs.hubFilters ?? null);
  const visHeaderStats = isSystem ? prefs.systemHeaderStats : prefs.headerStats;
  const headerStatParam = isSystem ? "sstat" : "hstat";

  const kpiDefaults = defaultsForPrefItems(kpis, defaultKpiKeys);
  const chartsDefaults = defaultsForPrefItems(charts, defaultChartKeys);
  const filterDefaults = defaultsForPrefItems(tabFilters, defaultFilterKeys);
  const headerStatDefaults = defaultHeaderStatKeys ?? new Set(headerStatsProp.map((item) => item.key));

  const visKpiCount = countVisiblePrefs(kpis, visKpiEffective, kpiDefaults);
  const kpiAtMax = visKpiCount >= MAX_VISIBLE_KPI;
  const visChartsCount = countVisiblePrefs(charts, visChartsEffective, chartsDefaults);
  const chartAtMax = visChartsCount >= MAX_VISIBLE_CHART;

  const logScope = usesSubTabDisplay
    ? (subTabDisplay?.logScope?.(effectiveSubTab) ?? `${screen} / ${effectiveSubTab}`)
    : isSystem
      ? `System / ${systemTab}`
      : "Hub";

  function emitLog(message: string) {
    onLog?.(logScope, message);
  }

  function update(patch: Record<string, string | null>, logMessage = "Updated display settings") {
    patchPrefs(patch, logMessage);
    setPrefs(readPrefs());
    emitLog(logMessage);
  }

  function toggle(
    param: "kpi" | "charts" | "hstat" | "sstat" | typeof filterParam,
    allItems: PrefItem[],
    defaults: Set<string>,
    key: string,
    maxVisible?: number,
    capMessage?: string,
  ) {
    const cur =
      param === "kpi"
        ? visKpiEffective
        : param === "charts"
          ? visChartsEffective
          : param === "hstat" || param === "sstat"
            ? visHeaderStats
            : visHubFilters;

    const wasSelected = isHubPrefVisible(cur, defaults, key);
    if (!wasSelected && maxVisible != null) {
      const selectedCount = countVisiblePrefs(allItems, cur, defaults);
      if (selectedCount >= maxVisible) {
        if (capMessage) emitLog(capMessage);
        return;
      }
    }

    const { next, allDefault } = toggleHubPrefSet(cur, defaults, key);

    if (usesLegacySystemDisplay && systemDisplay && systemTab && (param === "kpi" || param === "charts")) {
      systemDisplay.patch(systemTab, { [param]: allDefault ? null : [...next] });
      setDisplayTick((tick) => tick + 1);
      emitLog(`Updated ${systemTab} display`);
      return;
    }

    if (usesSubTabDisplay && subTabDisplay && (param === "kpi" || param === "charts")) {
      subTabDisplay.adapter.patch(effectiveSubTab, { [param]: allDefault ? null : [...next] });
      setDisplayTick((tick) => tick + 1);
      const evt = subTabDisplay.changeEvent ?? "subtab-display-change";
      window.dispatchEvent(new CustomEvent(evt));
      emitLog(`Updated ${effectiveSubTab} display`);
      return;
    }

    update({ [param]: allDefault ? null : [...next].join(",") });
  }

  function resetDisplay() {
    if (usesLegacySystemDisplay && systemDisplay && systemTab) {
      systemDisplay.reset(systemTab);
      update({ sstat: null }, `Reset ${systemTab} display settings`);
      return;
    }

    if (usesSubTabDisplay && subTabDisplay) {
      subTabDisplay.adapter.reset(effectiveSubTab);
      const evt = subTabDisplay.changeEvent ?? "subtab-display-change";
      window.dispatchEvent(new CustomEvent(evt));
      update({}, `Reset ${effectiveSubTab} display settings`);
      return;
    }

    update(
      { kpi: null, charts: null, [filterParam]: null, hstat: null, sstat: null },
      "Reset display settings",
    );
  }

  const pageSize = useHubTablePageSize();
  const { icon: DisplayTriggerIcon, className: displayIconClass } = resolveSemanticIcon("settings.display");

  function pickPageSize(next: number) {
    patchHubListPrefs({ tpage: patchHubTablePageSizeValue(next) });
    emitLog(`Rows per page: ${next}`);
    queueMicrotask(() => setOpen(false));
  }

  const headerLabel = headerStatLabel(isSystem);
  const hasBody =
    showPageSize ||
    kpis.length > 0 ||
    charts.length > 0 ||
    headerStatsProp.length > 0 ||
    tabFilters.length > 0 ||
    Boolean(tablePanel);

  if (!hasBody) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-[var(--hub-control-h)] items-center gap-1.5 rounded-lg border border-white/10 bg-[var(--panel-2)] px-3 text-xs font-medium text-[var(--text)] transition-colors hover:bg-white/5"
        title="Display options"
        aria-expanded={open}
      >
        <DisplayTriggerIcon size={compactIconSize(13)} className={`shrink-0 opacity-90 ${displayIconClass}`} aria-hidden />
        <span>Display</span>
        <ChevronDown size={compactIconSize(12)} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="hub-directory-display-panel anim-pop absolute right-0 top-full z-30 mt-1">
          {kpis.length > 0 ? (
            <PanelSection
              label={`KPI (${visKpiCount}/${MAX_VISIBLE_KPI})`}
              icon={buildSemanticTocIcon("settings.kpi")}
            >
              <div className="space-y-0.5">
                {kpis.map((item) => {
                  const selected = isHubPrefVisible(visKpiEffective, kpiDefaults, item.key);
                  return (
                    <ToggleRow
                      key={item.key}
                      label={item.label}
                      on={selected}
                      disabled={kpiAtMax && !selected}
                      onDisabledClick={() =>
                        emitLog(`KPI limit: maximum ${MAX_VISIBLE_KPI} — turn one off to add another`)
                      }
                      onChange={() => toggle("kpi", kpis, kpiDefaults, item.key, MAX_VISIBLE_KPI)}
                    />
                  );
                })}
              </div>
            </PanelSection>
          ) : null}
          {charts.length > 0 ? (
            <PanelSection
              label={`Charts (${visChartsCount}/${MAX_VISIBLE_CHART})`}
              icon={buildSemanticTocIcon("settings.charts")}
            >
              <div className="space-y-0.5">
                {charts.map((item) => {
                  const selected = isHubPrefVisible(visChartsEffective, chartsDefaults, item.key);
                  return (
                    <ToggleRow
                      key={item.key}
                      label={item.label}
                      on={selected}
                      disabled={chartAtMax && !selected}
                      onDisabledClick={() =>
                        emitLog(`Charts limit: maximum ${MAX_VISIBLE_CHART} — turn one off to add another`)
                      }
                      onChange={() => toggle("charts", charts, chartsDefaults, item.key, MAX_VISIBLE_CHART)}
                    />
                  );
                })}
              </div>
            </PanelSection>
          ) : null}
          {headerStatsProp.length > 0 ? (
            <PanelSection
              label={`${headerLabel} (${countVisiblePrefs(headerStatsProp, visHeaderStats, headerStatDefaults)}/${headerStatsProp.length})`}
              icon={buildSemanticTocIcon("settings.headerStats")}
            >
              <div className="space-y-0.5">
                {headerStatsProp.map((item) => (
                  <ToggleRow
                    key={item.key}
                    label={item.label}
                    on={isHubPrefVisible(visHeaderStats, headerStatDefaults, item.key)}
                    onChange={() => toggle(headerStatParam, headerStatsProp, headerStatDefaults, item.key)}
                  />
                ))}
              </div>
            </PanelSection>
          ) : null}
          {tabFilters.length > 0 ? (
            <PanelSection
              label={`Filters (${countVisiblePrefs(tabFilters, visHubFilters, filterDefaults)}/${tabFilters.length})`}
              icon={buildSemanticTocIcon("settings.filters")}
            >
              <div className="space-y-0.5">
                {tabFilters.map((item) => (
                  <ToggleRow
                    key={item.key}
                    label={item.label}
                    on={isHubPrefVisible(visHubFilters, filterDefaults, item.key)}
                    onChange={() => toggle(filterParam, tabFilters, filterDefaults, item.key)}
                  />
                ))}
              </div>
            </PanelSection>
          ) : null}
          {tablePanel ? (
            <PanelSection
              label="Table columns"
              icon={buildSemanticTocIcon("settings.table")}
              headerActions={tableSectionActions}
            >
              {tablePanel}
            </PanelSection>
          ) : null}
          {showPageSize ? (
            <PanelSection label="Rows per page" icon={buildSemanticTocIcon("settings.pageSize")}>
              <div className="space-y-0.5">
                {TABLE_PAGE_SIZE_OPTIONS.map((n) => (
                  <ToggleRow
                    key={n}
                    label={`${n} rows`}
                    on={pageSize === n}
                    onChange={() => pickPageSize(n)}
                  />
                ))}
              </div>
            </PanelSection>
          ) : null}
          <div className="hub-directory-display-panel__footer">
            <button type="button" className="hub-directory-display-panel__reset" onClick={resetDisplay}>
              Reset display
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated Use `HubDirectoryDisplayPanel`. */
export const HubDisplayBandToolbar = HubDirectoryDisplayPanel;
export type HubDisplayBandToolbarProps = HubDirectoryDisplayPanelProps;
