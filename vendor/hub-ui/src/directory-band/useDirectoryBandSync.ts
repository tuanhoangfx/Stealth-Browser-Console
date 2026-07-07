import { startTransition, useEffect } from "react";
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
 * Lift KPI/charts into WorkspaceDirectoryScreen (P0004 Hub parity).
 * useEffect + startTransition keeps band updates off the search hot-path layout frame.
 */
export function useDirectoryBandSync(
  snapshot: DirectoryBandSyncSnapshot,
  handlers: DirectoryBandHandlers,
  enabled = true,
) {
  const { kpis, charts, sectionRuleLabel, kpiKey = "", chartsKey = "" } = snapshot;

  useEffect(() => {
    if (!enabled) {
      startTransition(() => {
        handlers.setDirectoryKpis(undefined);
        handlers.setDirectoryCharts(null);
        handlers.setSectionRuleLabel(undefined);
      });
      return;
    }
    startTransition(() => {
      handlers.setDirectoryKpis(kpis?.length ? kpis : undefined);
      handlers.setDirectoryCharts(charts ?? null);
      handlers.setSectionRuleLabel(sectionRuleLabel);
    });
    // kpiKey/chartsKey are stable fingerprints; kpis/charts omitted from deps to avoid ReactNode identity loops.
  }, [enabled, kpiKey, chartsKey, sectionRuleLabel, handlers.setDirectoryCharts, handlers.setDirectoryKpis, handlers.setSectionRuleLabel]);

  useEffect(
    () => () => {
      startTransition(() => {
        handlers.setDirectoryKpis(undefined);
        handlers.setDirectoryCharts(null);
        handlers.setSectionRuleLabel(undefined);
      });
    },
    [handlers.setDirectoryCharts, handlers.setDirectoryKpis, handlers.setSectionRuleLabel],
  );
}
