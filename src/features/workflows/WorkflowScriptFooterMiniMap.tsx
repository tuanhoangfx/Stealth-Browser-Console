import { memo, type ReactElement } from "react";
import { MiniMap } from "@xyflow/react";

import type { WorkflowLayoutMode } from "./workflowScriptDagreLayout";
import { WorkflowScriptMiniMapEdgesSvg } from "./WorkflowScriptMiniMapEdges";
import { WorkflowScriptMiniMapNode } from "./workflowScriptMiniMapNode";
import type { ScriptFlowNodeData } from "./workflowScriptFlowTypes";

const MM_W = 100;
const MM_H = 58;

export type WorkflowScriptFooterMiniMapProps = {
  layoutMode: WorkflowLayoutMode;
  nodeColor: (kind: string) => string;
};

/** Minimap + edge overlay — lives in board footer, not canvas overlay. */
export const WorkflowScriptFooterMiniMap = memo(function WorkflowScriptFooterMiniMap({
  layoutMode,
  nodeColor,
}: WorkflowScriptFooterMiniMapProps): ReactElement {
  return (
    <div
      className="workflow-script-footer-minimap"
      style={{ width: MM_W, height: MM_H }}
      aria-label="Workflow mini-map overview"
    >
      <WorkflowScriptMiniMapEdgesSvg layoutMode={layoutMode} width={MM_W} height={MM_H} />
      <MiniMap
        className="workflow-script-minimap workflow-script-minimap--footer"
        style={{ width: MM_W, height: MM_H }}
        pannable
        zoomable
        nodeStrokeWidth={1.2}
        offsetScale={3}
        bgColor="#121830"
        maskColor="rgba(15, 23, 42, 0.45)"
        maskStrokeColor="rgba(148, 163, 184, 0.5)"
        maskStrokeWidth={1}
        ariaLabel="Workflow mini-map overview"
        nodeComponent={WorkflowScriptMiniMapNode}
        nodeColor={(n) => nodeColor(String((n.data as ScriptFlowNodeData).step.kind))}
        nodeStrokeColor="rgba(15, 23, 42, 0.45)"
      />
    </div>
  );
});
