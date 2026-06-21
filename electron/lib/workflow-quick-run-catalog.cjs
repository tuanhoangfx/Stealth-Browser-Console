"use strict";

/** Phase 0 spike catalog — builtin workflows only (sync from UI catalog later). */
const SPIKE_CATALOG = [
  {
    id: "open-url",
    name: "Open URL",
    platform: "Generic",
    action: "open-url",
    targetUrl: "https://browserleaks.com/ip",
    takeScreenshot: true,
    closeWhenDone: false,
  },
  {
    id: "ip-check",
    name: "IP Check",
    platform: "Generic",
    action: "open-url",
    targetUrl: "https://browserleaks.com/ip",
    takeScreenshot: true,
    closeWhenDone: true,
  },
  {
    id: "screenshot-check",
    name: "Screenshot Audit",
    platform: "Generic",
    action: "open-url",
    targetUrl: "https://example.com",
    takeScreenshot: true,
    closeWhenDone: true,
  },
];

function listWorkflowQuickRunCatalog() {
  return SPIKE_CATALOG.map((entry) => ({
    id: entry.id,
    name: entry.name,
    platform: entry.platform,
    action: entry.action,
  }));
}

function findWorkflowQuickRunEntry(workflowId) {
  const id = String(workflowId || "").trim();
  return SPIKE_CATALOG.find((entry) => entry.id === id) || null;
}

module.exports = { SPIKE_CATALOG, listWorkflowQuickRunCatalog, findWorkflowQuickRunEntry };
