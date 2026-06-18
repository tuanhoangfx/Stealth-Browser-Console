import { memo, useCallback } from "react";
import { useWorkflowPicker } from "../../context/workflow-picker-context";
import { useWorkflowRuntime } from "../../context/workflow-runtime-context";
import { useStealthShell } from "../../context/stealth-shell-context";
import { WorkflowRailPanel } from "../workflows/WorkflowRailPanel";
import { AutomationRuntimePanel } from "../runtime/AutomationRuntimePanel";

/** Profiles right rail — P0001 ProfilesWorkflowRail parity. */
export const ProfilesWorkflowRail = memo(function ProfilesWorkflowRail() {
  const { setView } = useStealthShell();
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
      setActiveWorkflow(id);
      setSelectedWorkflowIds([]);
      setView("workflow");
    },
    [setActiveWorkflow, setSelectedWorkflowIds, setView],
  );

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
      <AutomationRuntimePanel />
    </aside>
  );
});
