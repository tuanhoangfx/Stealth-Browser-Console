import { useMemo } from "react";
import type { KpiTileData } from "@tool-workspace/hub-ui";
import { useStealthHubListPrefs } from "../../lib/useStealthHubListPrefs";
import { withStoreKpiFilterClicks } from "./workflow-store-kpi-filter";
import {
  buildWorkflowStoreKpiItems,
  computeWorkflowStoreKpiNumbers,
  matchesStoreActivity,
  resolveWorkflowStoreKpiVisibleKeys,
} from "./workflow-store-kpi-items";
import type { WorkflowStoreEntry } from "./workflow-store-types";

export function useStoreDirectoryChrome(
  entries: readonly WorkflowStoreEntry[],
  localIds: ReadonlySet<string>,
  installedIds: ReadonlySet<string>,
  selectedCount: number,
  activityKpi: string | null,
  onActivityKpi: (next: string | null) => void,
) {
  const hubPrefs = useStealthHubListPrefs();
  const visibleKeys = useMemo(() => resolveWorkflowStoreKpiVisibleKeys(hubPrefs.kpi), [hubPrefs.kpi]);
  const numbers = useMemo(
    () => computeWorkflowStoreKpiNumbers(entries, localIds, installedIds, selectedCount),
    [entries, installedIds, localIds, selectedCount],
  );

  const kpis = useMemo<KpiTileData[]>(
    () =>
      withStoreKpiFilterClicks(
        buildWorkflowStoreKpiItems(numbers).filter((item) => !item.prefKey || visibleKeys.has(item.prefKey)),
        activityKpi,
        onActivityKpi,
      ),
    [activityKpi, numbers, onActivityKpi, visibleKeys],
  );

  return { kpis };
}

export function filterStoreEntriesByActivity(
  entries: readonly WorkflowStoreEntry[],
  activityKpi: string | null,
  localIds: ReadonlySet<string>,
  installedIds: ReadonlySet<string>,
): WorkflowStoreEntry[] {
  if (!activityKpi) return [...entries];
  return entries.filter((entry) => matchesStoreActivity(entry, activityKpi, localIds, installedIds));
}
