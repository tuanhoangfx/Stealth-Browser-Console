import { Position } from "@xyflow/react";

const COL_ALIGN_EPS = 14;
/** Same-row Y drift from measure rounding — still route horizontal. */
const ROW_SNAP_EPS = 32;

/** Design V5 — horizontal cubic between steps (midpoint control). */
function v5SpacedBezierPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): [path: string, labelX: number, labelY: number] {
  const midX = (sourceX + targetX) / 2;
  const path = `M ${sourceX},${sourceY} C ${midX},${sourceY} ${midX},${targetY} ${targetX},${targetY}`;
  return [path, midX, (sourceY + targetY) / 2];
}

/**
 * LTR row wrap — exit source bottom, travel corridor, enter target top.
 * Makes step N → step N+1 on the next row visually obvious.
 */
function rowWrapPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): [path: string, labelX: number, labelY: number] {
  const midY = (sourceY + targetY) / 2;
  const path = `M ${sourceX},${sourceY} L ${sourceX},${midY} L ${targetX},${midY} L ${targetX},${targetY}`;
  return [path, (sourceX + targetX) / 2, midY];
}

function isRowWrapEdge(
  ady: number,
  sourcePosition: Position,
  targetPosition: Position,
): boolean {
  if (ady <= ROW_SNAP_EPS) return false;
  if (sourcePosition === Position.Bottom && targetPosition === Position.Top) return true;
  if (sourcePosition === Position.Bottom && targetPosition === Position.Left) return true;
  return sourcePosition === Position.Right && targetPosition === Position.Top;
}

/** Straight when aligned; horizontal same row; row-wrap corridor; fallback bezier. */
export function getWorkflowScriptSmartPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position = Position.Right,
  targetPosition: Position = Position.Left,
): [path: string, labelX: number, labelY: number] {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (adx <= 1 && ady <= 1) {
    const path = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
    return [path, sourceX, sourceY];
  }

  // Same row — straight horizontal (snap Y drift from measure rounding).
  if (ady <= ROW_SNAP_EPS && adx > 8) {
    const y = (sourceY + targetY) / 2;
    const path = `M ${sourceX},${y} L ${targetX},${y}`;
    return [path, (sourceX + targetX) / 2, y];
  }

  // Next row — down from last column, across, into first column below.
  if (isRowWrapEdge(ady, sourcePosition, targetPosition)) {
    return rowWrapPath(sourceX, sourceY, targetX, targetY);
  }

  if (adx <= COL_ALIGN_EPS && ady > 0) {
    const x = (sourceX + targetX) / 2;
    const path = `M ${x},${sourceY} L ${x},${targetY}`;
    return [path, x, (sourceY + targetY) / 2];
  }

  if (adx > ady) {
    const midX = (sourceX + targetX) / 2;
    const path = `M ${sourceX},${sourceY} L ${midX},${sourceY} L ${midX},${targetY} L ${targetX},${targetY}`;
    return [path, midX, (sourceY + targetY) / 2];
  }

  return v5SpacedBezierPath(sourceX, sourceY, targetX, targetY);
}
