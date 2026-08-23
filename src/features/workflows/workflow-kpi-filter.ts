import type { KpiTileData } from "@tool-workspace/hub-ui";
import { isWorkflowActivityKpi } from "./workflow-activity";

/** Toggle Scripts activity KPI. `undefined` = no-op (e.g. already-cleared Total). */
export function nextWorkflowActivityKey(prefKey: string, current: string | null): string | null | undefined {
  if (prefKey === "total") return current ? null : undefined;
  if (!isWorkflowActivityKpi(prefKey)) return undefined;
  return current === prefKey ? null : prefKey;
}

export function isWorkflowActivityActive(prefKey: string, current: string | null): boolean {
  if (prefKey === "total" || !prefKey) return false;
  return current === prefKey;
}

export function withWorkflowKpiFilterClicks(
  items: KpiTileData[],
  current: string | null,
  onApply: (next: string | null) => void,
): KpiTileData[] {
  return items.map((item) => {
    const key = item.prefKey;
    if (!key) return item;
    const next = nextWorkflowActivityKey(key, current);
    if (next === undefined) return item;
    return {
      ...item,
      active: isWorkflowActivityActive(key, current),
      onClick: () => onApply(next),
    };
  });
}
