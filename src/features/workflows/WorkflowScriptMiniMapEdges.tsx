import { memo, useId, type ReactElement } from "react";

import { Panel, Position, getSmoothStepPath, useStore } from "@xyflow/react";
import {
  getBoundsOfRects,
  getInternalNodesBounds,
  getNodeDimensions,
} from "@xyflow/system";

import type { WorkflowLayoutMode } from "./workflowScriptDagreLayout";
import { workflowScriptSmoothStepPathOptions } from "./workflowScriptSmoothStep";

const MM_W = 100;

const MM_H = 58;

const OFFSET_SCALE = 3;

export type WorkflowScriptMiniMapEdgesProps = {
  layoutMode: WorkflowLayoutMode;
};

/** Mini-map does not render edges natively; overlay the same viewBox as XYFlow’s MiniMap. */
export const WorkflowScriptMiniMapEdges = memo(function WorkflowScriptMiniMapEdges({
  layoutMode,
}: WorkflowScriptMiniMapEdgesProps): ReactElement {
  const arrowId = useId().replace(/:/g, "");

  const viewBoxStr = useStore((s) => {
    const viewBB = {
      x: -s.transform[0] / s.transform[2],
      y: -s.transform[1] / s.transform[2],
      width: s.width / s.transform[2],
      height: s.height / s.transform[2],
    };

    const boundingRect =
      s.nodeLookup.size > 0
        ? getBoundsOfRects(
            getInternalNodesBounds(s.nodeLookup, {
              filter: (n) => !n.hidden,
            }),
            viewBB,
          )
        : viewBB;

    const scaledWidth = boundingRect.width / MM_W;

    const scaledHeight = boundingRect.height / MM_H;

    const viewScale = Math.max(scaledWidth, scaledHeight);

    const viewWidth = viewScale * MM_W;

    const viewHeight = viewScale * MM_H;

    const offset = OFFSET_SCALE * viewScale;

    const x = boundingRect.x - (viewWidth - boundingRect.width) / 2 - offset;

    const y = boundingRect.y - (viewHeight - boundingRect.height) / 2 - offset;

    const w = viewWidth + offset * 2;

    const h = viewHeight + offset * 2;

    return `${x} ${y} ${w} ${h}`;
  }, Object.is);

  const rfEdges = useStore((s) => s.edges);

  const rfNodeLookup = useStore((s) => s.nodeLookup);

  const opts = workflowScriptSmoothStepPathOptions(layoutMode);

  const mmOpts = {
    borderRadius: Math.max(8, Math.round(opts.borderRadius * 0.42)),
    offset: Math.max(10, Math.round(opts.offset * 0.32)),
  };

  function gradientId(edgeId: string): string {
    return `mm-sheen-${edgeId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  }

  const paths: ReactElement[] = [];

  for (const edge of rfEdges) {
    const src = rfNodeLookup.get(edge.source);

    const tgt = rfNodeLookup.get(edge.target);

    if (!src?.internals?.positionAbsolute || !tgt?.internals?.positionAbsolute) {
      continue;
    }

    const { width: sw, height: sh } = getNodeDimensions(src.internals.userNode);

    const { height: th } = getNodeDimensions(tgt.internals.userNode);

    const sp = src.internals.positionAbsolute;

    const tp = tgt.internals.positionAbsolute;

    const [d] = getSmoothStepPath({
      sourceX: sp.x + sw,
      sourceY: sp.y + sh / 2,
      sourcePosition: Position.Right,
      targetX: tp.x,
      targetY: tp.y + th / 2,
      targetPosition: Position.Left,
      borderRadius: mmOpts.borderRadius,
      offset: mmOpts.offset,
    });

    const gid = gradientId(edge.id);

    paths.push(
      <g key={edge.id}>
        <defs>
          <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0)" />

            <stop offset="38%" stopColor="rgba(200, 245, 255, 0.4)" />

            <stop offset="50%" stopColor="rgba(255, 255, 255, 0.94)" />

            <stop offset="62%" stopColor="rgba(186, 230, 253, 0.42)" />

            <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
          </linearGradient>
        </defs>

        <path
          d={d}
          fill="none"
          pathLength={1}
          vectorEffect="nonScalingStroke"
          className="workflow-script-minimap-edge-base"
          markerEnd={`url(#arrowhead-${arrowId})`}
        />

        <path
          d={d}
          fill="none"
          pathLength={1}
          vectorEffect="nonScalingStroke"
          className="workflow-script-minimap-edge-sheen"
          stroke={`url(#${gid})`}
        />
      </g>,
    );
  }

  return (
    <Panel
      position="bottom-right"
      className="workflow-script-minimap workflow-script-minimap--edges-layer"
      style={{
        width: MM_W,
        height: MM_H,
      }}
    >
      <svg
        width={MM_W}
        height={MM_H}
        viewBox={viewBoxStr}
        className="workflow-script-minimap-edges-svg"
        aria-hidden
      >
        <defs>
          <marker
            id={`arrowhead-${arrowId}`}
            markerUnits="userSpaceOnUse"
            viewBox="0 0 10 10"
            refX={8}
            refY={5}
            markerWidth={6}
            markerHeight={6}
            orient="auto"
          >
            <path
              d="M0,0 L10,5 L0,10 Z"
              fill="rgb(157, 230, 253)"
              fillOpacity={0.92}
            />
          </marker>
        </defs>
        {paths}
      </svg>
    </Panel>
  );
});
