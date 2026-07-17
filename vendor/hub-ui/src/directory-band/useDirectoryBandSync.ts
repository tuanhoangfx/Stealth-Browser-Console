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
 * useLayoutEffect keeps chrome frame stable on vault/tab switch.
 *
 * Stale-while-revalidate SSOT: empty/undefined KPI/charts must **not** clear the last
 * good band — otherwise `reserveAnalyticsBand` shows a 1–3s blank hole while O(n)
 * facet/KPI memos recompute (P0020 large vault).
 */
export function useDirectoryBandSync(
  snapshot: DirectoryBandSyncSnapshot,
  handlers: DirectoryBandHandlers,
  enabled = true,
) {
  const { kpis, charts, sectionRuleLabel, kpiKey = "", chartsKey = "" } = snapshot;

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }
    if (kpis?.length) handlers.setDirectoryKpis(kpis);
    if (charts != null) handlers.setDirectoryCharts(charts);
    if (sectionRuleLabel !== undefined) handlers.setSectionRuleLabel(sectionRuleLabel);
    // kpiKey/chartsKey are stable fingerprints; kpis/charts omitted from deps to avoid ReactNode identity loops.
  }, [enabled, kpiKey, chartsKey, sectionRuleLabel, handlers.setDirectoryCharts, handlers.setDirectoryKpis, handlers.setSectionRuleLabel]);
}
