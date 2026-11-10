import {
  withPrefKeyHeaderStatClicks,
  type FilterValues,
  type KpiTileData,
  type TabHeaderStatItem,
} from "@tool-workspace/hub-ui";
import { isLocalCalendarToday, isWithinLocalDays } from "../../../lib/local-calendar-today";
import type { CachedStoreExtension } from "../../../types";
import type { ExtensionKindFilter } from "./extension-filters";

export const EXTENSION_ACTIVITY_KPI_KEYS = [
  "create_today",
  "create_week",
  "update_today",
  "local",
  "staged",
  "pinned",
] as const;

export type ExtensionActivityKpiKey = (typeof EXTENSION_ACTIVITY_KPI_KEYS)[number];

export function isExtensionActivityKpiKey(value: string): value is ExtensionActivityKpiKey {
  return (EXTENSION_ACTIVITY_KPI_KEYS as readonly string[]).includes(value);
}

export function matchesExtensionKpiFilter(
  ext: CachedStoreExtension,
  activeKpi: string | null | undefined,
  now = new Date(),
): boolean {
  if (!activeKpi || activeKpi === "cached") return true;
  switch (activeKpi) {
    case "create_today":
      return isLocalCalendarToday(ext.createdAt ?? ext.updatedAt, now);
    case "create_week":
      return isWithinLocalDays(ext.createdAt ?? ext.updatedAt, now, 7);
    case "update_today":
      return isLocalCalendarToday(ext.updatedAt, now);
    case "store":
      return ext.kind === "store";
    case "local":
      return ext.kind === "local";
    case "staged":
      return ext.staged !== false;
    case "pinned":
      return (
        ext.autoPinned === true ||
        ext.storeId === "kaaadageakdandpobcofplmfbjfjabdk" ||
        ext.localKey === "e0002-browser-operator"
      );
    default:
      return true;
  }
}

function sameKind(current: ExtensionKindFilter[], next: ExtensionKindFilter[]): boolean {
  return JSON.stringify([...current].sort()) === JSON.stringify([...next].sort());
}

/** Cached = clear Kind; Store = Kind Store (toggle). */
export function extensionKpiFilterPatch(
  prefKey: string,
  currentKinds: ExtensionKindFilter[],
): FilterValues | null {
  if (prefKey === "cached") {
    return currentKinds.length ? { kind: [] } : null;
  }
  if (prefKey === "store") {
    return sameKind(currentKinds, ["store"]) ? { kind: [] } : { kind: ["store"] };
  }
  return null;
}

export function isExtensionKpiFilterActive(
  prefKey: string,
  currentKinds: ExtensionKindFilter[],
  activeKpi: string | null = null,
): boolean {
  if (prefKey === "store") return sameKind(currentKinds, ["store"]) && !activeKpi;
  if (isExtensionActivityKpiKey(prefKey)) return activeKpi === prefKey;
  return false;
}

export function applyExtensionKpiFilterPatch(
  prefKey: string,
  currentKinds: ExtensionKindFilter[],
): ExtensionKindFilter[] | null {
  const next = extensionKpiFilterPatch(prefKey, currentKinds);
  if (!next) return null;
  return (next.kind ?? []).filter((value): value is ExtensionKindFilter => value === "store");
}

function applyKindPref(
  prefKey: string,
  selectedKinds: ExtensionKindFilter[],
  setSelectedKinds: (values: ExtensionKindFilter[]) => void,
  activeKpi: string | null = null,
  setActiveKpi?: (next: string | null) => void,
): void {
  if (prefKey === "cached") {
    if (selectedKinds.length) setSelectedKinds([]);
    if (activeKpi) setActiveKpi?.(null);
    return;
  }
  if (prefKey === "store") {
    if (activeKpi) setActiveKpi?.(null);
    const next = applyExtensionKpiFilterPatch(prefKey, selectedKinds);
    if (next != null) setSelectedKinds(next);
    return;
  }
  if (isExtensionActivityKpiKey(prefKey)) {
    if (selectedKinds.length) setSelectedKinds([]);
    setActiveKpi?.(activeKpi === prefKey ? null : prefKey);
  }
}

/** Header Cached/Store — same Kind map as KPI tiles. */
export function withExtensionHeaderStatFilterClicks(
  stats: TabHeaderStatItem[],
  selectedKinds: ExtensionKindFilter[],
  setSelectedKinds: (values: ExtensionKindFilter[]) => void,
): TabHeaderStatItem[] {
  return withPrefKeyHeaderStatClicks(
    stats,
    (key) => isExtensionKpiFilterActive(key, selectedKinds),
    (key) => applyExtensionKpiFilterPatch(key, selectedKinds),
    setSelectedKinds,
  );
}

export function withExtensionKpiFilterClicks(
  items: KpiTileData[],
  selectedKinds: ExtensionKindFilter[],
  setSelectedKinds: (values: ExtensionKindFilter[]) => void,
  activeKpi: string | null = null,
  setActiveKpi?: (next: string | null) => void,
): KpiTileData[] {
  return items.map((item) => {
    const key = item.prefKey;
    if (!key) return item;
    return {
      ...item,
      active: isExtensionKpiFilterActive(key, selectedKinds, activeKpi),
      onClick: () => applyKindPref(key, selectedKinds, setSelectedKinds, activeKpi, setActiveKpi),
    };
  });
}
