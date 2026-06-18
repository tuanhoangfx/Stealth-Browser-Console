import { useLayoutEffect, type ReactNode } from "react";
import type { KpiTileData } from "../shell/KpiStrip";

export type DirectoryBandHandlers = {
  setDirectoryKpis: (kpis: KpiTileData[] | undefined) => void;
  setDirectoryCharts: (charts: ReactNode | null) => void;
  setSectionRuleLabel: (label: string | undefined) => void;
};

export type DirectoryBandSyncSnapshot = {
  kpis?: KpiTileData[];
  charts?: ReactNode | null;
  sectionRuleLabel?: string;
  /** Stable fingerprint — e.g. kpiTilesSignature(kpis). */
  kpiKey?: string;
  /** Stable fingerprint — e.g. chartKeysSignature + series data. */
  chartsKey?: string;
};

/**
 * Lift KPI/charts into WorkspaceDirectoryScreen before paint (P0004 Hub parity).
 * Use layout effect + stable keys to avoid flicker on F5 and filter-count updates.
 */
export function useDirectoryBandSync(
  snapshot: DirectoryBandSyncSnapshot,
  handlers: DirectoryBandHandlers,
  enabled = true,
) {
  const { kpis, charts, sectionRuleLabel, kpiKey = "", chartsKey = "" } = snapshot;

  useLayoutEffect(() => {
    if (!enabled) return;
    handlers.setDirectoryKpis(kpis?.length ? kpis : undefined);
    handlers.setDirectoryCharts(charts ?? null);
    handlers.setSectionRuleLabel(sectionRuleLabel);
    return () => {
      handlers.setDirectoryKpis(undefined);
      handlers.setDirectoryCharts(null);
      handlers.setSectionRuleLabel(undefined);
    };
    // kpiKey/chartsKey are stable fingerprints; kpis/charts omitted from deps to avoid ReactNode identity loops.
  }, [enabled, kpiKey, chartsKey, sectionRuleLabel, handlers.setDirectoryCharts, handlers.setDirectoryKpis, handlers.setSectionRuleLabel]);
}
