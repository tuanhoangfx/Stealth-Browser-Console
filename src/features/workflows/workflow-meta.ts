import type { WorkflowConfig } from "./workflow-types";

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

export function ensureWorkflowTimestamps(workflow: WorkflowConfig, seedMs = Date.now()): WorkflowConfig {
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
