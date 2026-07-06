import { memo, type ReactElement } from "react";

import { EdgeText, type EdgeProps, Position } from "@xyflow/react";

import { getWorkflowScriptSmartPath } from "./workflowScriptSmartEdgePath";

export type WorkflowScriptStepEdgeProps = EdgeProps & { className?: string };

/** Straight or single-corner orthogonal edge — no smooth-step bulges. */
export const WorkflowScriptStepEdge = memo(function WorkflowScriptStepEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
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
}: WorkflowScriptStepEdgeProps): ReactElement {
  const [path, labelX, labelY] = getWorkflowScriptSmartPath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  );

  const groupClass = className ? `workflow-script-edge ${className}` : "workflow-script-edge";

  return (
    <g className={groupClass}>
      <path
        id={id}
        d={path}
        fill="none"
        className="react-flow__edge-path workflow-script-edge__base"
        style={style}
        markerEnd={markerEnd}
        markerStart={markerStart}
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
