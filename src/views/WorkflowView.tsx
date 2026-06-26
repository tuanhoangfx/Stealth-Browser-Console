import { lazy, memo, Suspense, useCallback, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import "../theme/stealth-scripts-hub-layout.css";
import "../theme/stealth-workflow-steps.css";
import { useWorkflowEditor } from "../context/workflow-editor-context";
import { useWorkflowPicker } from "../context/workflow-picker-context";
import type { WorkflowConfig } from "../features/workflows/workflow-types";
import { ScriptsHubChrome } from "../features/workflows/ScriptsHubChrome";
import { ScriptsWorkflowDirectory } from "../features/workflows/ScriptsWorkflowDirectory";
import { StealthWorkflowContextMenu } from "../ui/StealthWorkflowContextMenu";

const ScriptsEditorPane = lazy(() =>
  import("../features/workflows/ScriptsEditorPane").then((m) => ({ default: m.ScriptsEditorPane })),
);

function ScriptsEditorPaneSkeleton() {
  return (
    <div className="script-editor-stack min-h-0 min-w-0 flex-1 overflow-hidden" aria-busy="true" aria-label="Loading workflow editor">
      <div className="workflow-script-flow-lazy min-h-0 min-w-0 flex-1 h-full p-4">
        <div className="workflow-script-flow-skeleton" role="status">
          <span className="workflow-script-flow-skeleton__pulse" />
        </div>
      </div>
    </div>
  );
}

export const WorkflowView = memo(function WorkflowView({ headerActions }: { headerActions?: ReactNode }) {
  const { workflowConfigs, filteredWorkflows, selectedWorkflowCount } = useWorkflowPicker();
  const { activeWorkflowConfig, copyWorkflow, deleteWorkflows } = useWorkflowEditor();

  const [contextMenu, setContextMenu] = useState<{ workflow: WorkflowConfig; x: number; y: number } | null>(null);

  const handleWorkflowContextMenu = useCallback((workflow: WorkflowConfig, event: MouseEvent) => {
    setContextMenu({ workflow, x: event.clientX, y: event.clientY });
  }, []);

  const scriptCounts = useMemo(
    () => ({
      total: workflowConfigs.length,
      visible: filteredWorkflows.length,
      checked: selectedWorkflowCount,
      steps: activeWorkflowConfig.steps.length,
    }),
    [workflowConfigs.length, filteredWorkflows.length, selectedWorkflowCount, activeWorkflowConfig.steps.length],
  );

  return (
    <>
      <ScriptsHubChrome counts={scriptCounts} headerActions={headerActions}>
        <section className="script-builder anim-fade min-h-0 min-w-0 flex-1 overflow-hidden">
          <aside className="script-workflows stealth-workflow-directory-pane min-h-0 min-w-0">
            <ScriptsWorkflowDirectory onContextMenu={handleWorkflowContextMenu} />
          </aside>
          <Suspense fallback={<ScriptsEditorPaneSkeleton />}>
            <ScriptsEditorPane />
          </Suspense>
        </section>
      </ScriptsHubChrome>
      <StealthWorkflowContextMenu
        workflow={contextMenu?.workflow ?? null}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        canDelete={workflowConfigs.length > 1}
        onClose={() => setContextMenu(null)}
        onCopy={(workflow) => copyWorkflow(workflow)}
        onDelete={(workflow) => deleteWorkflows([workflow.id])}
      />
    </>
  );
});
