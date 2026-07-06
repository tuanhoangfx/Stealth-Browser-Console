import type { WorkflowLayoutMode } from "./workflowScriptDagreLayout";

/** Design V5 locked — minimap edge routing uses tight offset. */
export function workflowScriptSmoothStepPathOptions(
  _mode: WorkflowLayoutMode,
): { borderRadius: number; offset: number; stepPosition: number } {
  return { borderRadius: 12, offset: 18, stepPosition: 0.5 };
}
