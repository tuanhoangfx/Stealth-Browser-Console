import type { WorkflowLayoutMode } from "./workflowScriptDagreLayout";

/** Orthogonal routing tuned per layout: larger offset “bulges” bends outward and reduces overlap in compact grids. */
export function workflowScriptSmoothStepPathOptions(
  mode: WorkflowLayoutMode,
): { borderRadius: number; offset: number } {
  switch (mode) {
    case "serpentine":
      return { borderRadius: 38, offset: 92 };
    case "zigzag_lr":
      return { borderRadius: 30, offset: 56 };
    case "linear_lr":
    default:
      return { borderRadius: 22, offset: 34 };
  }
}
