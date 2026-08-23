import { isLocalCalendarToday } from "../../lib/local-calendar-today";
import type { WorkflowConfig } from "./workflow-types";

export const WORKFLOW_ACTIVITY_KPI_KEYS = [
  "create_today",
  "update_today",
  "ran_today",
  "idle",
  "empty",
] as const;

export type WorkflowActivityKpi = (typeof WORKFLOW_ACTIVITY_KPI_KEYS)[number];

export function isWorkflowActivityKpi(value: string): value is WorkflowActivityKpi {
  return (WORKFLOW_ACTIVITY_KPI_KEYS as readonly string[]).includes(value);
}

export function matchesWorkflowActivity(
  workflow: WorkflowConfig,
  key: string | null,
  now = new Date(),
): boolean {
  if (!key || key === "total") return true;
  switch (key) {
    case "create_today":
      return isLocalCalendarToday(workflow.createdAt, now);
    case "update_today":
      return isLocalCalendarToday(workflow.updatedAt, now);
    case "ran_today":
      return isLocalCalendarToday(workflow.lastRunAt, now);
    case "idle":
      return !workflow.lastRunAt?.trim();
    case "empty":
      return workflow.steps.length === 0;
    default:
      return true;
  }
}
