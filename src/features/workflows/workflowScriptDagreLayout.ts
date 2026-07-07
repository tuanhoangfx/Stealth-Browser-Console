import type { Edge, Node } from "@xyflow/react";
import { Position } from "@xyflow/react";
import type { ScriptStep } from "../../types";
import { WORKFLOW_CANVAS_VISUAL_SCALE, workflowLayoutNodePx } from "./workflowCanvasFit";

/** Hit-box & spacing — scaled so default fitView @ 100% matches prior 85% overview. */
export const WORKFLOW_FLOW_NODE_MEASURED = workflowLayoutNodePx();

/** Step chips: ≤ threshold grows freely; above enables Hub scroll pane. */
export const WORKFLOW_PICKER_SCROLL_STEP_THRESHOLD = 6;


/** Locked to Design V5 — LTR grid + wide spacing + bezier edges. */
export type WorkflowLayoutMode = "curve_spaced";

const LOCKED_LAYOUT: WorkflowLayoutMode = "curve_spaced";
const WORKFLOW_LAYOUT_STORAGE_KEY = "p0003_workflow_layout_mode";

const V5_COLS_MAX = 5;
const GAP_X_GRID = Math.round(30 * WORKFLOW_CANVAS_VISUAL_SCALE);
const GAP_Y_GRID = Math.round(26 * WORKFLOW_CANVAS_VISUAL_SCALE);

const WORKFLOW_LAYOUT_ORIGIN_PADDING = 48;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function columnCount(stepCount: number): number {
  if (stepCount <= 1) return 1;
  if (stepCount <= V5_COLS_MAX) return stepCount;
  return V5_COLS_MAX;
}

/** Design V5 — always LTR rows, 5 columns max, generous spacing. */
function layoutCurveSpacedLtr<D extends { step: ScriptStep }>(nodes: Node<D>[]): Node<D>[] {
  const n = nodes.length;
  if (n === 0) return nodes;

  const cols = columnCount(n);
  const { width: w, height: h } = WORKFLOW_FLOW_NODE_MEASURED;
  const strideX = w + GAP_X_GRID;
  const strideY = h + GAP_Y_GRID;

  return nodes.map((node, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return {
      ...node,
      position: {
        x: col * strideX,
        y: row * strideY,
      },
    };
  });
}

function centerLayoutNodes<D extends { step: ScriptStep }>(nodes: Node<D>[]): Node<D>[] {
  if (nodes.length === 0) return nodes;
  const { width: w, height: h } = WORKFLOW_FLOW_NODE_MEASURED;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + w);
    maxY = Math.max(maxY, node.position.y + h);
  }
  const graphW = maxX - minX;
  const graphH = maxY - minY;
  const offsetX = WORKFLOW_LAYOUT_ORIGIN_PADDING + graphW / 2 - (minX + maxX) / 2;
  const offsetY = WORKFLOW_LAYOUT_ORIGIN_PADDING + graphH / 2 - (minY + maxY) / 2;
  return nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
    },
  }));
}

const COL_ALIGN_EPS = 14;

function assignChainHandlePositions<D extends { step: ScriptStep }>(nodes: Node<D>[]): Node<D>[] {
  if (nodes.length <= 1) return nodes;

  const rowThreshold = (WORKFLOW_FLOW_NODE_MEASURED.height + GAP_Y_GRID) * 0.35;

  return nodes.map((node, index) => {
    const prev = nodes[index - 1];
    const next = nodes[index + 1];
    let sourcePosition = Position.Right;
    let targetPosition = Position.Left;

    if (next) {
      const dy = next.position.y - node.position.y;
      const dx = next.position.x - node.position.x;
      if (Math.abs(dy) > rowThreshold || Math.abs(dx) <= COL_ALIGN_EPS) {
        sourcePosition = dy >= 0 ? Position.Bottom : Position.Top;
      } else {
        sourcePosition = dx >= 0 ? Position.Right : Position.Left;
      }
    }

    if (prev) {
      const dy = node.position.y - prev.position.y;
      const dx = node.position.x - prev.position.x;
      if (Math.abs(dy) > rowThreshold || Math.abs(dx) <= COL_ALIGN_EPS) {
        targetPosition = dy >= 0 ? Position.Top : Position.Bottom;
      } else {
        targetPosition = dx >= 0 ? Position.Left : Position.Right;
      }
    }

    return { ...node, sourcePosition, targetPosition };
  });
}

export function readStoredWorkflowLayoutMode(): WorkflowLayoutMode {
  try {
    const raw = localStorage.getItem(WORKFLOW_LAYOUT_STORAGE_KEY);
    if (raw && raw !== LOCKED_LAYOUT) {
      localStorage.setItem(WORKFLOW_LAYOUT_STORAGE_KEY, LOCKED_LAYOUT);
    }
  } catch {
    /* ignore */
  }
  return LOCKED_LAYOUT;
}

export function resolveWorkflowLayoutMode(
  _stepCount: number,
  _stored?: WorkflowLayoutMode,
): WorkflowLayoutMode {
  return LOCKED_LAYOUT;
}

export function persistWorkflowLayoutMode(_mode: WorkflowLayoutMode): void {
  try {
    localStorage.setItem(WORKFLOW_LAYOUT_STORAGE_KEY, LOCKED_LAYOUT);
  } catch {
    /* ignore */
  }
}

export function layoutWorkflowScriptNodes<D extends { step: ScriptStep }>(
  nodes: Node<D>[],
  edges: Edge[],
  _mode: WorkflowLayoutMode,
): Node<D>[] {
  void edges;
  return assignChainHandlePositions(centerLayoutNodes(layoutCurveSpacedLtr(nodes)));
}
