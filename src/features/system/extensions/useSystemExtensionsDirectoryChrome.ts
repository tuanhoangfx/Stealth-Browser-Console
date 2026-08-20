import { useMemo } from "react";
import { Archive, Puzzle } from "lucide-react";
import type { KpiTileData, TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { defaultsForPrefItems, isHubPrefVisible } from "../../../lib/display-pref-helpers";
import { SYSTEM_EXTENSIONS_DISPLAY_PREFS } from "../../../lib/display-prefs-registry";
import { STEALTH_EXTENSIONS_KPI_STICKER } from "../../../lib/stealth-column-stickers";
import { useStealthSystemTabDisplayPrefs } from "../../../lib/useStealthSystemTabDisplayPrefs";
import { useStealthHubListPrefs } from "../../../lib/useStealthHubListPrefs";
import type { CachedStoreExtension } from "../../../types";
import type { ExtensionKindFilter } from "./extension-filters";
import { withExtensionHeaderStatFilterClicks, withExtensionKpiFilterClicks } from "./extension-kpi-filter";

type ExtensionKpiNumbers = {
  cached: number;
  store: number;
};

function extensionKpiNumbers(cached: CachedStoreExtension[]): ExtensionKpiNumbers {
  return {
    cached: cached.length,
    store: cached.filter((e) => e.kind === "store").length,
  };
}

const EXTENSION_KPI_TILES: Array<{
  key: keyof ExtensionKpiNumbers;
  label: string;
  tone: NonNullable<KpiTileData["tone"]>;
  pick: (k: ExtensionKpiNumbers) => number;
}> = [
  { key: "cached", label: "Cached", tone: "indigo", pick: (k) => k.cached },
  { key: "store", label: "Store", tone: "sky", pick: (k) => k.store },
];

const EXTENSION_HEADER_STAT_DEFS: Record<
  keyof ExtensionKpiNumbers,
  { icon: typeof Puzzle; label: string; toneClass: string; pick: (k: ExtensionKpiNumbers) => number }
> = {
  cached: { icon: Puzzle, label: "Cached", toneClass: "text-indigo-300", pick: (k) => k.cached },
  store: { icon: Archive, label: "Store", toneClass: "text-sky-300", pick: (k) => k.store },
};

/** System → Extensions KPI strip + header stats (sub-tab display prefs, default off). */
export function useSystemExtensionsDirectoryChrome(
  cached: CachedStoreExtension[],
  kindFilter: {
    selectedKinds: ExtensionKindFilter[];
    setSelectedKinds: (values: ExtensionKindFilter[]) => void;
  },
) {
  const tabDisplay = useStealthSystemTabDisplayPrefs("extensions");
  const hubPrefs = useStealthHubListPrefs();
  const numbers = useMemo(() => extensionKpiNumbers(cached), [cached]);

  const kpiDefaults = useMemo(
    () =>
      defaultsForPrefItems(
        SYSTEM_EXTENSIONS_DISPLAY_PREFS.kpis,
        SYSTEM_EXTENSIONS_DISPLAY_PREFS.defaultKpiKeys,
      ),
    [],
  );

  const kpis = useMemo<KpiTileData[]>(
    () =>
      withExtensionKpiFilterClicks(
        EXTENSION_KPI_TILES.filter(
          (row) => isHubPrefVisible(tabDisplay?.kpi ?? null, kpiDefaults, row.key),
        ).map((row) => ({
          prefKey: row.key,
          label: row.label,
          value: row.pick(numbers),
          emojiGlyph: STEALTH_EXTENSIONS_KPI_STICKER[row.key],
          tone: row.tone,
        })),
        kindFilter.selectedKinds,
        kindFilter.setSelectedKinds,
      ),
    [kpiDefaults, kindFilter.selectedKinds, kindFilter.setSelectedKinds, numbers, tabDisplay?.kpi],
  );

  const headerStatDefaults = useMemo(
    () =>
      defaultsForPrefItems(
        SYSTEM_EXTENSIONS_DISPLAY_PREFS.headerStats,
        SYSTEM_EXTENSIONS_DISPLAY_PREFS.defaultHeaderStatKeys,
      ),
    [],
  );

  const centerStats = useMemo((): TabHeaderStatItem[] => {
    const items: TabHeaderStatItem[] = [];
    for (const item of SYSTEM_EXTENSIONS_DISPLAY_PREFS.headerStats) {
      if (!isHubPrefVisible(hubPrefs.systemHeaderStats, headerStatDefaults, item.key)) continue;
      const def = EXTENSION_HEADER_STAT_DEFS[item.key as keyof ExtensionKpiNumbers];
      if (!def) continue;
      items.push({
        key: item.key,
        icon: def.icon,
        label: def.label,
        value: def.pick(numbers),
        toneClass: def.toneClass,
      });
    }
    return withExtensionHeaderStatFilterClicks(
      items,
      kindFilter.selectedKinds,
      kindFilter.setSelectedKinds,
    );
  }, [
    headerStatDefaults,
    hubPrefs.systemHeaderStats,
    kindFilter.selectedKinds,
    kindFilter.setSelectedKinds,
    numbers,
  ]);

  return { kpis, centerStats };
}
