/** Scripts tab — workflow step editor (editor context only). */
import { memo, useState } from "react";
import { useWorkflowEditor } from "../../context/workflow-editor-context";
import { workflowDisplayId } from "./workflow-display";
import { WorkflowAiStepsPanel } from "./WorkflowAiStepsPanel";
import { WorkflowScriptFlow } from "./WorkflowScriptFlow";
import { WorkflowStepAddPicker } from "./WorkflowStepAddPicker";
import { WorkflowStepInspectorPanel } from "./WorkflowStepInspectorPanel";

export const ScriptsEditorPane = memo(function ScriptsEditorPane() {
  const {
    activeWorkflow,
    activeWorkflowConfig,
    selectedScriptStep,
    setSelectedScriptStepId,
    scriptStepKinds,
    addScriptStep,
    updateActiveScriptStep,
    removeScriptStep,
    moveScriptStep,
    reorderScriptStepsBySortedIds,
    saveWorkflowChanges,
    savePulse,
    undoWorkflowChange,
    redoWorkflowChange,
    workflowUndoStack,
    workflowRedoStack,
    applyAiGeneratedWorkflow,
    DEFAULT_WORKFLOWS,
  } = useWorkflowEditor();

  const [canvasHintOpen, setCanvasHintOpen] = useState(false);
  const displayWorkflowId = (id: string) => workflowDisplayId(id, DEFAULT_WORKFLOWS);

  return (
    <div className="script-editor-stack min-h-0 min-w-0 flex-1 overflow-hidden">
      <section className="script-main">
        <div className="script-steps-intro script-steps-intro--compact">
          <header className="script-steps-head">
            <div className="script-steps-head-line">
              <h2 className="script-steps-title">Workflow Steps</h2>
              <span className="script-steps-workflow-meta muted">
                {displayWorkflowId(activeWorkflowConfig.id)} · {activeWorkflowConfig.name}
              </span>
            </div>
            {activeWorkflowConfig.description ? (
              <p className="muted script-workflow-summary" title={activeWorkflowConfig.description}>
                {activeWorkflowConfig.description}
              </p>
            ) : null}
          </header>
          <WorkflowAiStepsPanel
            activeWorkflowConfig={activeWorkflowConfig}
            defaultWorkflows={DEFAULT_WORKFLOWS}
            onApply={applyAiGeneratedWorkflow}
            onSave={saveWorkflowChanges}
          />
          <div className="script-steps-toolbar">
            <div className="script-steps-toolbar-frame">
              <div className="script-steps-toolbar-row script-steps-toolbar-row--add">
                <WorkflowStepAddPicker onAdd={addScriptStep} />
              </div>
              {selectedScriptStep ? (
                <WorkflowStepInspectorPanel
                  step={selectedScriptStep}
                  scriptStepKinds={scriptStepKinds}
                  savePulse={savePulse}
                  canUndo={workflowUndoStack.length > 0}
                  canRedo={workflowRedoStack.length > 0}
                  onSetEnabled={(enabled) => updateActiveScriptStep(selectedScriptStep.id, { enabled })}
                  onUpdate={(patch) => updateActiveScriptStep(selectedScriptStep.id, patch)}
                  onSave={saveWorkflowChanges}
                  onUndo={undoWorkflowChange}
                  onRedo={redoWorkflowChange}
                  onMoveUp={() => moveScriptStep(selectedScriptStep.id, -1)}
                  onMoveDown={() => moveScriptStep(selectedScriptStep.id, 1)}
                  onDelete={() => removeScriptStep(selectedScriptStep.id)}
                />
              ) : (
                <div className="script-steps-toolbar-row">
                  <p className="muted script-step-edit-hint">Select a step on the canvas to edit.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="script-step-board-wrap workflow-script-steps-area">
          {activeWorkflowConfig.steps.length === 0 ? (
            <p className="muted script-step-board-empty">Add the first step with the New button above.</p>
          ) : (
            <WorkflowScriptFlow
              key={activeWorkflow}
              steps={activeWorkflowConfig.steps}
              selectedStepId={selectedScriptStep?.id ?? ""}
              onSelectStep={setSelectedScriptStepId}
              onReorderBySortedIds={reorderScriptStepsBySortedIds}
            />
          )}
          <div className="script-step-board-hint-bar">
            <button
              type="button"
              className={`script-step-board-hint-toggle${canvasHintOpen ? " is-open" : ""}`}
              onClick={() => setCanvasHintOpen((value) => !value)}
              title={canvasHintOpen ? "Hide canvas tips" : "Show canvas tips"}
              aria-expanded={canvasHintOpen}
              aria-label="Canvas tips"
            >
              ?
            </button>
            {canvasHintOpen ? (
              <p className="muted script-step-board-hint">
                Use the Layout control (top-right) to switch between serpentine, zigzag, or straight-line placement — your
                choice is saved in browser storage. Drag the canvas background to pan; scroll wheel to zoom; drag nodes to
                reorder.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
});
