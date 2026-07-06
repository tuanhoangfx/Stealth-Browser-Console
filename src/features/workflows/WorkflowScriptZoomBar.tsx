import { memo, type ReactElement } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { WORKFLOW_CANVAS_FIT_VIEW } from "./workflowCanvasFit";

function readZoomPercent(transform: [number, number, number]): number {
  const z = transform[2];
  return Number.isFinite(z) && z > 0 ? Math.round(z * 100) : 100;
}

/** Zoom bar for board footer (outside React Flow overlay panels). */
export const WorkflowScriptZoomBar = memo(function WorkflowScriptZoomBar(): ReactElement {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoomPct = useStore((state) => readZoomPercent(state.transform));

  return (
    <div className="workflow-script-zoom-panel">
      <div className="workflow-script-zoom-panel__inner">
        <button type="button" className="workflow-script-zoom-btn" title="Zoom in" onClick={() => zoomIn()}>
          <Plus size={14} aria-hidden />
        </button>
        <span className="workflow-script-zoom-label" title="Current canvas zoom">
          {zoomPct}%
        </span>
        <button type="button" className="workflow-script-zoom-btn" title="Zoom out" onClick={() => zoomOut()}>
          <Minus size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="workflow-script-zoom-btn"
          title="Fit view"
          onClick={() => void fitView(WORKFLOW_CANVAS_FIT_VIEW)}
        >
          <Maximize2 size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
});
