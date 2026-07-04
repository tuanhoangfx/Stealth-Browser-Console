import type { HubViewMode } from "@tool-workspace/hub-ui";

const VIEW_MODE_KEY = "stealth-workflow-store:viewMode";

export function readWorkflowStoreViewMode(): HubViewMode {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    return raw === "card" ? "card" : "table";
  } catch {
    return "table";
  }
}

export function writeWorkflowStoreViewMode(mode: HubViewMode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}
