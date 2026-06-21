/** Workflow Quick Run Side Panel (MV3) — OFF by default. Independent from identity-toolbar. */
function workflowSidePanelEnabled() {
  const raw = String(process.env.STEALTH_WORKFLOW_SIDE_PANEL ?? "0").toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

module.exports = { workflowSidePanelEnabled };
