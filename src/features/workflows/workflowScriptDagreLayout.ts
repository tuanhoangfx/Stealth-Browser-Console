import type { Edge, Node } from "@xyflow/react";
import type { ScriptStep } from "../../types";

/** Hit-box & spacing for layout (~ card width + orb + badge + labels). */
export const WORKFLOW_FLOW_NODE_MEASURED = {
  width: 178,
  height: 168,
};

export const WORKFLOW_LAYOUT_STORAGE_KEY = "stealth-console-workflow-layout-mode";

export type WorkflowLayoutMode = "serpentine" | "zigzag_lr" | "linear_lr";

const MODES = new Set<WorkflowLayoutMode>(["serpentine", "zigzag_lr", "linear_lr"]);

const GAP_X_GRID = 40;
const GAP_Y_GRID = 32;

const ROW_GAP_LR = 36;
/** Y offset alternating on one horizontal baseline */
const ZIGZAG_HALF_AMPLITUDE = 52;

/** Cap columns for serpentine grid */
const MAX_COLS_CAP = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function readStoredWorkflowLayoutMode(): WorkflowLayoutMode {
  try {
    const raw = localStorage.getItem(WORKFLOW_LAYOUT_STORAGE_KEY);
    if (raw && MODES.has(raw as WorkflowLayoutMode)) return raw as WorkflowLayoutMode;
  } catch {
    /* ignore */
  }
  return "linear_lr";
}

export function persistWorkflowLayoutMode(mode: WorkflowLayoutMode): void {
  try {
    localStorage.setItem(WORKFLOW_LAYOUT_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function compactColumnCount(stepCount: number): number {
  if (stepCount <= 1) return 1;

  let cols = Math.ceil(Math.sqrt(stepCount * 1.25));
  cols = clamp(cols, 2, MAX_COLS_CAP);
  cols = Math.min(cols, stepCount);
  return cols;
}

function layoutSerpentine<D extends { step: ScriptStep }>(
  nodes: Node<D>[],
): Node<D>[] {
  const n = nodes.length;
  if (n === 0) return nodes;

  const cols = compactColumnCount(n);
  const { width: w, height: h } = WORKFLOW_FLOW_NODE_MEASURED;
  const strideX = w + GAP_X_GRID;
  const strideY = h + GAP_Y_GRID;

  return nodes.map((node, i) => {
    const row = Math.floor(i / cols);
    const slotInRow = i % cols;
    const col = row % 2 === 0 ? slotInRow : cols - 1 - slotInRow;
    return {
      ...node,
      position: {
        x: col * strideX,
        y: row * strideY,
      },
    };
  });
}

/** Single horizontal spine; alternating Y above/below baseline — keeps one row without stacking cells. */
function layoutZigzagRow<D extends { step: ScriptStep }>(nodes: Node<D>[]): Node<D>[] {
  const { width: w } = WORKFLOW_FLOW_NODE_MEASURED;
  const strideX = w + ROW_GAP_LR;
  const baseY = 120;

  return nodes.map((node, i) => ({
    ...node,
    position: {
      x: i * strideX,
      y: baseY + (i % 2 === 0 ? -ZIGZAG_HALF_AMPLITUDE : ZIGZAG_HALF_AMPLITUDE),
    },
  }));
}

/** One straight baseline — shallow vertical footprint, widest horizontal stretch. */
function layoutLinearRow<D extends { step: ScriptStep }>(nodes: Node<D>[]): Node<D>[] {
  const { width: w } = WORKFLOW_FLOW_NODE_MEASURED;
  const strideX = w + ROW_GAP_LR;

  return nodes.map((node, i) => ({
    ...node,
    position: {
      x: i * strideX,
      y: 120,
    },
  }));
}

/**
 * Applies one of several linear-chain placements (workflow steps are sequential only).
 */
export function layoutWorkflowScriptNodes<D extends { step: ScriptStep }>(
  nodes: Node<D>[],
  edges: Edge[],
  mode: WorkflowLayoutMode,
): Node<D>[] {
  void edges;

  switch (mode) {
    case "zigzag_lr":
      return layoutZigzagRow(nodes);
    case "linear_lr":
      return layoutLinearRow(nodes);
    case "serpentine":
    default:
      return layoutSerpentine(nodes);
  }
}
