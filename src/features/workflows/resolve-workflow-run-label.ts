import { humanizeWorkflowSlug } from "../../lib/run-display";
import { DEFAULT_WORKFLOWS } from "./workflow-defaults";
import type { WorkflowConfig } from "./workflow-types";

/** Run History task label — SSOT from workflow registry `name`, else title-case slug. */
export function resolveWorkflowRunLabel(
  workflowId: string,
  registry: readonly WorkflowConfig[] = DEFAULT_WORKFLOWS,
): string {
  const id = String(workflowId || "").trim();
  if (!id) return "Workflow";
  const hit = registry.find((workflow) => workflow.id === id);
  if (hit?.name?.trim()) return hit.name.trim();
  const builtin = DEFAULT_WORKFLOWS.find((workflow) => workflow.id === id);
  if (builtin?.name?.trim()) return builtin.name.trim();
  return humanizeWorkflowSlug(id);
}

/** Run History line 1 — profile ID, browser name, registry task label. */
export function formatRunHistoryPrimaryLabel(
  entry: {
    profileId: string;
    profileName: string;
    workflow: string;
  },
  registry: readonly WorkflowConfig[] = DEFAULT_WORKFLOWS,
): string {
  return [
    entry.profileId.trim(),
    entry.profileName.trim(),
    resolveWorkflowRunLabel(entry.workflow, registry),
  ]
    .filter(Boolean)
    .join(" ");
}
