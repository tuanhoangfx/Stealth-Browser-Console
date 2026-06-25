/** Scripts tab — workflow step editor (editor context only). */
import { memo, useEffect, useState } from "react";
import { useWorkflowEditor } from "../../context/workflow-editor-context";
import { workflowDisplayId } from "./workflow-display";
import { WorkflowCanvasErrorBoundary } from "../../ui/WorkflowCanvasErrorBoundary";
import { WorkflowAiStepsPanel } from "./WorkflowAiStepsPanel";
import { WorkflowScriptFlowLazy, prefetchWorkflowScriptFlow } from "./WorkflowScriptFlowLazy";
import { WorkflowStepAddPicker } from "./WorkflowStepAddPicker";
import { WorkflowStepBulkActionBar } from "./WorkflowStepBulkActionBar";
import { WorkflowStepInspectorPanel } from "./WorkflowStepInspectorPanel";
import { catalogCategoryForKind } from "./script-step-catalog";

export const ScriptsEditorPane = memo(function ScriptsEditorPane() {
  const {
    activeWorkflow,
    activeWorkflowConfig,
    selectedScriptStep,
    selectedScriptStepId,
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
  const steps = activeWorkflowConfig.steps;

  useEffect(() => {
    prefetchWorkflowScriptFlow();
  }, []);

  return (
    <div className="script-editor-stack min-h-0 min-w-0 flex-1 overflow-hidden">
      <section className="script-main">
        <div className="script-steps-intro script-steps-intro--compact">
          <header className="script-steps-head">
            <div className="script-steps-head-line">
              <h2 className="script-steps-title">Workflow Steps</h2>
              <span className="script-steps-workflow-meta">
                {displayWorkflowId(activeWorkflowConfig.id)} · {activeWorkflowConfig.name}
              </span>
            </div>
          </header>
          <WorkflowAiStepsPanel
            activeWorkflowConfig={activeWorkflowConfig}
            defaultWorkflows={DEFAULT_WORKFLOWS}
            onApply={applyAiGeneratedWorkflow}
            onSave={saveWorkflowChanges}
          />
          <div className="script-steps-toolbar">
            <div className="script-steps-toolbar-frame">
              {steps.length > 1 ? (
                <div className="script-steps-picker-row" role="tablist" aria-label="Workflow steps">
                  {steps.map((step, index) => {
                    const selected = step.id === (selectedScriptStepId || steps[0]?.id);
                    const category = catalogCategoryForKind(step.kind);
                    return (
                      <button
                        key={step.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        className={`script-steps-picker-chip script-steps-picker-chip--${category}${selected ? " is-selected" : ""}`}
                        onClick={() => setSelectedScriptStepId(step.id)}
                      >
                        <span className="script-steps-picker-chip__index">{index + 1}</span>
                        <span className="script-steps-picker-chip__label">{step.name || step.kind}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {selectedScriptStep ? (
                <WorkflowStepInspectorPanel
                  step={selectedScriptStep}
                  scriptStepKinds={scriptStepKinds}
                  onSetEnabled={(enabled) => updateActiveScriptStep(selectedScriptStep.id, { enabled })}
                  onUpdate={(patch) => updateActiveScriptStep(selectedScriptStep.id, patch)}
                />
              ) : steps.length === 0 ? (
                <div className="script-steps-toolbar-row">
                  <p className="muted script-step-edit-hint">Add the first step with the New button below.</p>
                </div>
              ) : (
                <div className="script-steps-toolbar-row">
                  <p className="muted script-step-edit-hint">Select a step above to edit.</p>
                </div>
              )}
              <div className="workflow-step-bulk-shell">
                <WorkflowStepBulkActionBar
                  addSlot={<WorkflowStepAddPicker onAdd={addScriptStep} />}
                  savePulse={savePulse}
                  canUndo={workflowUndoStack.length > 0}
                  canRedo={workflowRedoStack.length > 0}
                  stepActionsDisabled={!selectedScriptStep}
                  onSave={saveWorkflowChanges}
                  onUndo={undoWorkflowChange}
                  onRedo={redoWorkflowChange}
                  onMoveUp={() => selectedScriptStep && moveScriptStep(selectedScriptStep.id, -1)}
                  onMoveDown={() => selectedScriptStep && moveScriptStep(selectedScriptStep.id, 1)}
                  onDelete={() => selectedScriptStep && removeScriptStep(selectedScriptStep.id)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="script-step-board-wrap workflow-script-steps-area">
          {steps.length === 0 ? (
            <p className="muted script-step-board-empty">Add the first step with the New button below.</p>
          ) : (
            <WorkflowCanvasErrorBoundary>
              <WorkflowScriptFlowLazy
                key={activeWorkflow}
                steps={steps}
                selectedStepId={selectedScriptStep?.id ?? selectedScriptStepId ?? ""}
                onSelectStep={setSelectedScriptStepId}
                onReorderBySortedIds={reorderScriptStepsBySortedIds}
              />
            </WorkflowCanvasErrorBoundary>
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
