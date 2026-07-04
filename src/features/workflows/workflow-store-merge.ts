import type { WorkflowStoreEntry } from "./workflow-store-types";

export function mergeWorkflowStoreEntries(lists: WorkflowStoreEntry[][]): WorkflowStoreEntry[] {
  const byId = new Map<string, WorkflowStoreEntry>();
  for (const list of lists) {
    for (const entry of list) {
      const existing = byId.get(entry.id);
      if (!existing || entry.source === "supabase") {
        byId.set(entry.id, entry);
      }
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
