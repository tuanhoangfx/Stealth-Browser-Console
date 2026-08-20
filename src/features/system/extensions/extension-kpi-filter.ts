import {
  withPrefKeyHeaderStatClicks,
  type FilterValues,
  type KpiTileData,
  type TabHeaderStatItem,
} from "@tool-workspace/hub-ui";
import type { ExtensionKindFilter } from "./extension-filters";

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

export function isExtensionKpiFilterActive(prefKey: string, currentKinds: ExtensionKindFilter[]): boolean {
  return prefKey === "store" && sameKind(currentKinds, ["store"]);
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
): void {
  const next = applyExtensionKpiFilterPatch(prefKey, selectedKinds);
  if (next == null) return;
  setSelectedKinds(next);
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
): KpiTileData[] {
  return items.map((item) => {
    const key = item.prefKey;
    if (!key) return item;
    return {
      ...item,
      active: isExtensionKpiFilterActive(key, selectedKinds),
      onClick: () => applyKindPref(key, selectedKinds, setSelectedKinds),
    };
  });
}
