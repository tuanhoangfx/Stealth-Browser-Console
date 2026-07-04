import type { WorkflowStoreEntry } from "./workflow-store-types";

export function workflowStoreUpdatedMs(entry: WorkflowStoreEntry): number | null {
  const raw = entry.updatedAt?.trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}
