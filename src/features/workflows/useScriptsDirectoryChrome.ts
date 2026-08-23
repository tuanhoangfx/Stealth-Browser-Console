import { useMemo } from "react";
import type { KpiTileData } from "@tool-workspace/hub-ui";
import { useStealthHubListPrefs } from "../../lib/useStealthHubListPrefs";
import { withWorkflowKpiFilterClicks } from "./workflow-kpi-filter";
import {
  buildWorkflowKpiItems,
  computeWorkflowKpiNumbers,
  resolveWorkflowKpiVisibleKeys,
} from "./workflow-kpi-items";
import { matchesWorkflowActivity } from "./workflow-activity";
import type { WorkflowConfig } from "./workflow-types";

export function useScriptsDirectoryChrome(
  workflows: readonly WorkflowConfig[],
  activityKpi: string | null,
  onActivityKpi: (next: string | null) => void,
) {
  const hubPrefs = useStealthHubListPrefs();
  const visibleKeys = useMemo(() => resolveWorkflowKpiVisibleKeys(hubPrefs.kpi), [hubPrefs.kpi]);
  const numbers = useMemo(() => computeWorkflowKpiNumbers(workflows), [workflows]);

  const kpis = useMemo<KpiTileData[]>(
    () =>
      withWorkflowKpiFilterClicks(
        buildWorkflowKpiItems(numbers).filter((item) => !item.prefKey || visibleKeys.has(item.prefKey)),
        activityKpi,
        onActivityKpi,
      ),
    [activityKpi, numbers, onActivityKpi, visibleKeys],
  );

  return { kpis };
}

export function filterWorkflowsByActivity(
  workflows: readonly WorkflowConfig[],
  activityKpi: string | null,
): WorkflowConfig[] {
  if (!activityKpi) return [...workflows];
  return workflows.filter((workflow) => matchesWorkflowActivity(workflow, activityKpi));
}
