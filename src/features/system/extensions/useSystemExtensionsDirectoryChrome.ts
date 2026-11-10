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
  create_today: number;
  create_week: number;
  update_today: number;
  store: number;
  local: number;
  staged: number;
  pinned: number;
};

function isSameLocalCalendarDay(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  const d = new Date(ms);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isWithinDays(iso: string | undefined, nowMs: number, days: number): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return nowMs - ms <= days * 86_400_000;
}

function extensionKpiNumbers(cached: CachedStoreExtension[]): ExtensionKpiNumbers {
  const now = new Date();
  const nowMs = now.getTime();
  return {
    cached: cached.length,
    create_today: cached.filter((e) => isSameLocalCalendarDay(e.createdAt ?? e.updatedAt, now)).length,
    create_week: cached.filter((e) => isWithinDays(e.createdAt ?? e.updatedAt, nowMs, 7)).length,
    update_today: cached.filter((e) => isSameLocalCalendarDay(e.updatedAt, now)).length,
    store: cached.filter((e) => e.kind === "store").length,
    local: cached.filter((e) => e.kind === "local").length,
    staged: cached.filter((e) => e.staged !== false).length,
    pinned: cached.filter(
      (e) =>
        e.autoPinned === true ||
        e.storeId === "kaaadageakdandpobcofplmfbjfjabdk" ||
        e.localKey === "e0002-browser-operator",
    ).length,
  };
}

const EXTENSION_KPI_TILES: Array<{
  key: keyof ExtensionKpiNumbers;
  label: string;
  tone: NonNullable<KpiTileData["tone"]>;
  pick: (k: ExtensionKpiNumbers) => number;
}> = [
  { key: "cached", label: "Cached", tone: "indigo", pick: (k) => k.cached },
  { key: "create_today", label: "Create Today", tone: "emerald", pick: (k) => k.create_today },
  { key: "create_week", label: "Create This Week", tone: "indigo", pick: (k) => k.create_week },
  { key: "update_today", label: "Update Today", tone: "cyan", pick: (k) => k.update_today },
  { key: "store", label: "Store", tone: "sky", pick: (k) => k.store },
  { key: "local", label: "Local Operator", tone: "amber", pick: (k) => k.local },
  { key: "staged", label: "Stage Ready", tone: "violet", pick: (k) => k.staged },
  { key: "pinned", label: "Auto-Pinned", tone: "rose", pick: (k) => k.pinned },
];

/** System → Extensions KPI strip + header CPU/RAM (sub-tab display prefs, default off). */
export function useSystemExtensionsDirectoryChrome(
  cached: CachedStoreExtension[],
  kindFilter: {
    selectedKinds: ExtensionKindFilter[];
    setSelectedKinds: (values: ExtensionKindFilter[]) => void;
    activeKpi?: string | null;
    setActiveKpi?: (next: string | null) => void;
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
        kindFilter.activeKpi ?? null,
        kindFilter.setActiveKpi,
      ),
    [
      kpiDefaults,
      kindFilter.activeKpi,
      kindFilter.selectedKinds,
      kindFilter.setActiveKpi,
      kindFilter.setSelectedKinds,
      numbers,
      tabDisplay?.kpi,
    ],
  );

  return { kpis, centerStats };
}
