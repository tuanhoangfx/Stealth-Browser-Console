import type { WorkflowConfig } from "./workflow-types";

/** Catalog shipped ~Apr 2026 — stagger builtins by one day each (newest index = most recent). */
const WORKFLOW_TIMESTAMP_EPOCH_MS = Date.UTC(2026, 3, 15, 12, 0, 0);

export function workflowBuiltinSeedMs(builtinIndex: number): number {
  return WORKFLOW_TIMESTAMP_EPOCH_MS - (builtinIndex + 1) * 86_400_000;
}

export function workflowCustomSeedMs(workflowId: string): number {
  let hash = 0;
  for (let i = 0; i < workflowId.length; i += 1) {
    hash = (hash * 31 + workflowId.charCodeAt(i)) | 0;
  }
  const days = (Math.abs(hash) % 900) + 1;
  return WORKFLOW_TIMESTAMP_EPOCH_MS - days * 86_400_000;
}

/** Detect fake catalog seeds (Dec 2023 / Jan 2024) persisted before v3 migration. */
export function isLegacyCatalogTimestamp(iso?: string): boolean {
  if (!iso) return true;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return true;
  return ms >= Date.UTC(2023, 11, 1) && ms < Date.UTC(2024, 2, 1);
}

export function workflowStepCount(workflow: WorkflowConfig): number {
  return workflow.steps.length;
}

export function workflowCreatedMs(workflow: WorkflowConfig): number | null {
  if (!workflow.createdAt) return null;
  const ms = Date.parse(workflow.createdAt);
  return Number.isFinite(ms) ? ms : null;
}

export function workflowUpdatedMs(workflow: WorkflowConfig): number | null {
  if (!workflow.updatedAt) return null;
  const ms = Date.parse(workflow.updatedAt);
  return Number.isFinite(ms) ? ms : null;
}

export function workflowLastRunMs(workflow: WorkflowConfig): number | null {
  if (!workflow.lastRunAt) return null;
  const ms = Date.parse(workflow.lastRunAt);
  return Number.isFinite(ms) ? ms : null;
}

/** Default Scripts selection — workflow with the most recent lastRunAt, else first in list. */
export function resolveDefaultActiveWorkflow(workflows: WorkflowConfig[]): string {
  let bestId: string | null = null;
  let bestMs = -1;
  for (const workflow of workflows) {
    const ms = workflowLastRunMs(workflow);
    if (ms != null && ms > bestMs) {
      bestMs = ms;
      bestId = workflow.id;
    }
  }
  if (bestId) return bestId;
  return workflows[0]?.id ?? "open-url";
}

export function ensureWorkflowTimestamps(workflow: WorkflowConfig, seedMs = WORKFLOW_TIMESTAMP_EPOCH_MS): WorkflowConfig {
  const createdAt = workflow.createdAt ?? new Date(seedMs).toISOString();
  return {
    ...workflow,
    createdAt,
    updatedAt: workflow.updatedAt ?? createdAt,
  };
}

export function touchWorkflowUpdated(workflow: WorkflowConfig): WorkflowConfig {
  return { ...workflow, updatedAt: new Date().toISOString() };
}

export function newWorkflowTimestamps(): Pick<WorkflowConfig, "createdAt" | "updatedAt"> {
  const now = new Date().toISOString();
  return { createdAt: now, updatedAt: now };
}
