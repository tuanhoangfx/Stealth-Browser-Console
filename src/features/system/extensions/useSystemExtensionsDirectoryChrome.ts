import { useMemo } from "react";
import type { KpiTileData } from "@tool-workspace/hub-ui";
import { useHostHeaderStats } from "../../../hooks/useHostHeaderStats";
import { defaultsForPrefItems, isHubPrefVisible } from "../../../lib/display-pref-helpers";
import { SYSTEM_EXTENSIONS_DISPLAY_PREFS } from "../../../lib/display-prefs-registry";
import { STEALTH_EXTENSIONS_KPI_STICKER } from "../../../lib/stealth-column-stickers";
import { useStealthSystemTabDisplayPrefs } from "../../../lib/useStealthSystemTabDisplayPrefs";
import { useStealthHubListPrefs } from "../../../lib/useStealthHubListPrefs";
import type { CachedStoreExtension } from "../../../types";
import type { ExtensionKindFilter } from "./extension-filters";
import { withExtensionKpiFilterClicks } from "./extension-kpi-filter";

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

/** System → Extensions KPI strip + header CPU/RAM (sub-tab display prefs, default off). */
export function useSystemExtensionsDirectoryChrome(
  cached: CachedStoreExtension[],
  kindFilter: {
    selectedKinds: ExtensionKindFilter[];
    setSelectedKinds: (values: ExtensionKindFilter[]) => void;
  },
) {
  const tabDisplay = useStealthSystemTabDisplayPrefs("extensions");
  const hubPrefs = useStealthHubListPrefs();
  const centerStats = useHostHeaderStats(hubPrefs.systemHeaderStats);
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

  return { kpis, centerStats };
}
