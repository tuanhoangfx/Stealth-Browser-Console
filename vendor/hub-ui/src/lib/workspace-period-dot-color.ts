import type { WorkspacePeriodKey } from "./hub-workspace-period";

/** Distinct dot colors for workspace period options (Today, This Week, Last 30 Days, …). */
export const WORKSPACE_PERIOD_DOT_COLORS: Record<WorkspacePeriodKey, string> = {
  all: "#94a3b8",
  today: "#34d399",
  thisWeek: "#38bdf8",
  lastWeek: "#a78bfa",
  last30Days: "#fbbf24",
  thisMonth: "#818cf8",
  customMonth: "#f472b6",
  customRange: "#fb923c",
};

export function workspacePeriodDotColor(key: WorkspacePeriodKey): string {
  return WORKSPACE_PERIOD_DOT_COLORS[key] ?? WORKSPACE_PERIOD_DOT_COLORS.all;
}

/** Trigger icon — brighter than label; "All" uses sky (not slate dot gray). */
export function workspacePeriodTriggerIconColor(key: WorkspacePeriodKey): string {
  if (key === "all") return "#38bdf8";
  return workspacePeriodDotColor(key);
}
