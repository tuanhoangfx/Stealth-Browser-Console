/** Bakes former 0.85 maxZoom into layout so default fit reads 100% at same overview size. */
export const WORKFLOW_CANVAS_VISUAL_SCALE = 0.85;

/** Shared React Flow fitView options — workflow layout canvas overview. */
export const WORKFLOW_CANVAS_FIT_VIEW = {
  padding: 0.42,
  maxZoom: 1,
  duration: 180,
} as const;

export const WORKFLOW_CANVAS_MIN_ZOOM = 0.08;

/** Layout node box (pre-scale design = 72). */
export const WORKFLOW_NODE_DESIGN_PX = 72;

export function workflowLayoutNodePx(): { width: number; height: number } {
  const size = Math.round(WORKFLOW_NODE_DESIGN_PX * WORKFLOW_CANVAS_VISUAL_SCALE);
  return { width: size, height: size };
}
