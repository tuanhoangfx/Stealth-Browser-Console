import { memo, useCallback } from "react";
import { useWorkflowPicker } from "../../context/workflow-picker-context";
import { useWorkflowRuntime } from "../../context/workflow-runtime-context";
import { useStealthShell } from "../../context/stealth-shell-context";
import { stampPendingEditorWorkflow } from "../workflows/workflow-defaults";
import { WorkflowRailPanel } from "../workflows/WorkflowRailPanel";
import { AutomationRuntimePanel } from "../runtime/AutomationRuntimePanel";

/** Profiles right rail — Hub workflow picker pattern. */
export const ProfilesWorkflowRail = memo(function ProfilesWorkflowRail({
  backupJobLabel = null,
  runtimeOnly = false,
}: {
  backupJobLabel?: string | null;
  /** System Backup / Extensions — History + Console only (no workflow script rail). */
  runtimeOnly?: boolean;
}) {
  const { setView, setWorkflowTab } = useStealthShell();
  const { openProfilesForWorkflow } = useWorkflowRuntime();
  const {
    filteredWorkflows,
    workflowConfigs,
    workflowSearch,
    setWorkflowSearch,
    workflowGroupFilters,
    setWorkflowGroupFilters,
    workflowPlatformFilters,
    setWorkflowPlatformFilters,
    selectedWorkflowIds,
    activeWorkflow,
    setSelectedWorkflowIds,
    setActiveWorkflow,
    builtinWorkflows
  } = useWorkflowPicker();

  const handleSelectWorkflow = useCallback(
    (id: string) => {
      openProfilesForWorkflow(id);
    },
    [openProfilesForWorkflow],
  );

  const handleOpenWorkflowEditor = useCallback(
    (id: string) => {
      stampPendingEditorWorkflow(id);
      setActiveWorkflow(id);
      setSelectedWorkflowIds([]);
      setWorkflowTab("editor");
      setView("workflow");
    },
    [setActiveWorkflow, setSelectedWorkflowIds, setView, setWorkflowTab],
  );

  if (runtimeOnly) {
    return (
      <aside className="stealth-workflow-rail stealth-runtime-rail-only">
        <AutomationRuntimePanel backupJobLabel={backupJobLabel} />
      </aside>
    );
  }

  return (
    <aside className="stealth-workflow-rail">
      <WorkflowRailPanel
        workflowConfigs={workflowConfigs}
        filteredWorkflows={filteredWorkflows}
        workflowSearch={workflowSearch}
        setWorkflowSearch={setWorkflowSearch}
        workflowGroupFilters={workflowGroupFilters}
        setWorkflowGroupFilters={setWorkflowGroupFilters}
        workflowPlatformFilters={workflowPlatformFilters}
        setWorkflowPlatformFilters={setWorkflowPlatformFilters}
        selectedWorkflowIds={selectedWorkflowIds}
        setSelectedWorkflowIds={setSelectedWorkflowIds}
        activeWorkflowId={activeWorkflow}
        onSelectWorkflow={handleSelectWorkflow}
        onOpenWorkflowEditor={handleOpenWorkflowEditor}
        defaultWorkflows={builtinWorkflows}
      />
      <AutomationRuntimePanel backupJobLabel={backupJobLabel} />
    </aside>
  );
});
