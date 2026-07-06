import { memo, type ReactElement } from "react";

import type { ScriptStepKind } from "../../types";
import type { WorkflowLayoutMode } from "./workflowScriptDagreLayout";
import { WorkflowScriptFooterMiniMap } from "./WorkflowScriptFooterMiniMap";
import { minimapColorForStepKind } from "./workflowScriptStepVisual";
import { WorkflowScriptZoomBar } from "./WorkflowScriptZoomBar";

export type WorkflowScriptBoardFooterProps = {
  layoutMode: WorkflowLayoutMode;
  hintOpen: boolean;
  onToggleHint: () => void;
};

/** Layout board footer — hint + minimap + zoom on one row below the canvas. */
export const WorkflowScriptBoardFooter = memo(function WorkflowScriptBoardFooter({
  layoutMode,
  hintOpen,
  onToggleHint,
}: WorkflowScriptBoardFooterProps): ReactElement {
  return (
    <footer className="script-step-board-footer">
      <button
        type="button"
        className={`script-step-board-hint-toggle${hintOpen ? " is-open" : ""}`}
        onClick={onToggleHint}
        title={hintOpen ? "Hide canvas tips" : "Show canvas tips"}
        aria-expanded={hintOpen}
        aria-label="Canvas tips"
      >
        ?
      </button>
      {hintOpen ? (
        <p className="muted script-step-board-hint">
          Canvas uses locked <strong>Spaced flow · V5</strong> layout (LTR grid, bezier edges). Drag the
          canvas background to pan; scroll wheel to zoom; drag nodes to reorder.
        </p>
      ) : (
        <span className="script-step-board-footer__spacer" aria-hidden />
      )}
      <div className="script-step-board-footer__chrome">
        <WorkflowScriptFooterMiniMap
          layoutMode={layoutMode}
          nodeColor={(kind) => minimapColorForStepKind(kind as ScriptStepKind)}
        />
        <WorkflowScriptZoomBar />
      </div>
    </footer>
  );
});
