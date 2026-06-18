import { memo, type ReactElement } from "react";

import {
  EdgeText,
  getSmoothStepPath,
  type EdgeProps,
  type SmoothStepPathOptions,
  Position,
} from "@xyflow/react";

export type WorkflowScriptStepEdgeProps = EdgeProps & { className?: string };

function svgDefSuffix(edgeId: string): string {
  return edgeId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Smooth-step connector with solid body, soft glow, and a traveling specular streak (pathLength-normalized dash).
 */
export const WorkflowScriptStepEdge = memo(function WorkflowScriptStepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Bottom,
  targetPosition = Position.Top,
  markerEnd,
  markerStart,
  style,
  className,
  interactionWidth = 26,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
  pathOptions,
}: WorkflowScriptStepEdgeProps): ReactElement {
  const po = pathOptions as SmoothStepPathOptions | undefined;

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: po?.borderRadius,
    offset: po?.offset,
    stepPosition: po?.stepPosition,
  });

  const gid = `wf-edge-sheen-${svgDefSuffix(id)}`;

  const groupClass = className ? `workflow-script-edge ${className}` : "workflow-script-edge";

  return (
    <g className={groupClass}>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0)" />

          <stop offset="38%" stopColor="rgba(200, 245, 255, 0.35)" />

          <stop offset="50%" stopColor="rgba(255, 255, 255, 0.96)" />

          <stop offset="62%" stopColor="rgba(186, 230, 253, 0.45)" />

          <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </linearGradient>
      </defs>

      <path d={path} fill="none" pathLength={1} className="workflow-script-edge__ambient" aria-hidden />

      <path
        id={id}
        d={path}
        fill="none"
        pathLength={1}
        className="react-flow__edge-path workflow-script-edge__base"
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
      />

      <path
        d={path}
        fill="none"
        pathLength={1}
        className="workflow-script-edge__sheen"
        stroke={`url(#${gid})`}
        aria-hidden
      />

      {interactionWidth ? (
        <path
          d={path}
          fill="none"
          strokeOpacity={0}
          strokeWidth={interactionWidth}
          className="react-flow__edge-interaction"
        />
      ) : null}

      {label != null && Number.isFinite(labelX) && Number.isFinite(labelY) ? (
        <EdgeText
          x={labelX}
          y={labelY}
          label={label}
          labelStyle={labelStyle}
          labelShowBg={labelShowBg}
          labelBgStyle={labelBgStyle}
          labelBgPadding={labelBgPadding}
          labelBgBorderRadius={labelBgBorderRadius}
        />
      ) : null}
    </g>
  );
});
