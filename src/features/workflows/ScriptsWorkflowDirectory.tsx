/** Scripts tab — workflow directory pane (picker context only + bulk actions). */
import { useHubDirectorySelection } from "@tool-workspace/hub-ui";
import { memo, useCallback } from "react";
import { useWorkflowEditor } from "../../context/workflow-editor-context";
import { useWorkflowPicker } from "../../context/workflow-picker-context";
import type { WorkflowConfig } from "./workflow-types";
import { StealthWorkflowsDirectoryBulkActions } from "./StealthWorkflowsDirectoryBulkActions";
import { WorkflowDirectoryPanel } from "./WorkflowDirectoryPanel";

export type ScriptsWorkflowDirectoryProps = {
  onContextMenu: (workflow: WorkflowConfig, event: import("react").MouseEvent) => void;
};

export const ScriptsWorkflowDirectory = memo(function ScriptsWorkflowDirectory({
  onContextMenu,
}: ScriptsWorkflowDirectoryProps) {
  const {
    workflowConfigs,
    filteredWorkflows,
    workflowSearch,
    setWorkflowSearch,
    workflowGroupFilters,
    setWorkflowGroupFilters,
    workflowPlatformFilters,
    setWorkflowPlatformFilters,
    workflowTablePageSize,
    setWorkflowTablePageSize,
    selectScriptWorkflow,
    activeWorkflow,
  } = useWorkflowPicker();

  const {
    addWorkflow,
    duplicateWorkflow,
    deleteActiveWorkflow,
    deleteWorkflows,
    copyWorkflow,
    copyWorkflowId,
    DEFAULT_WORKFLOWS,
  } = useWorkflowEditor();

  const workflowRowId = useCallback((workflow: WorkflowConfig) => workflow.id, []);

  const {
    selectedIds: bulkSelectedIds,
    setSelectedIds: setBulkSelectedIds,
    selectedRows: bulkSelectedWorkflows,
    toggleSelect: toggleWorkflowBulkSelect,
    toggleSelectAll: toggleBulkSelectAll,
    allVisibleSelected: bulkAllVisibleSelected,
  } = useHubDirectorySelection(filteredWorkflows, workflowRowId);

  const handleBulkCopy = useCallback(() => {
    if (bulkSelectedWorkflows.length === 0) {
      duplicateWorkflow();
      return;
    }
    bulkSelectedWorkflows.forEach((workflow) => copyWorkflow(workflow));
  }, [bulkSelectedWorkflows, copyWorkflow, duplicateWorkflow]);

  const handleBulkDelete = useCallback(() => {
    if (bulkSelectedIds.size === 0) {
      deleteActiveWorkflow();
      return;
    }
    deleteWorkflows([...bulkSelectedIds]);
    setBulkSelectedIds(new Set());
  }, [bulkSelectedIds, deleteActiveWorkflow, deleteWorkflows, setBulkSelectedIds]);

  const canDeleteWorkflow = workflowConfigs.length > 1 && bulkSelectedIds.size < workflowConfigs.length;

  return (
    <WorkflowDirectoryPanel
      workflowConfigs={workflowConfigs}
      filteredWorkflows={filteredWorkflows}
      workflowSearch={workflowSearch}
      setWorkflowSearch={setWorkflowSearch}
      workflowGroupFilters={workflowGroupFilters}
      setWorkflowGroupFilters={setWorkflowGroupFilters}
      workflowPlatformFilters={workflowPlatformFilters}
      setWorkflowPlatformFilters={setWorkflowPlatformFilters}
      bulkSelectedIds={bulkSelectedIds}
      bulkAllVisibleSelected={bulkAllVisibleSelected}
      toggleBulkSelectAll={toggleBulkSelectAll}
      bulkActions={
        <StealthWorkflowsDirectoryBulkActions
          hasSelection={bulkSelectedIds.size > 0}
          canDelete={canDeleteWorkflow}
          onCopy={handleBulkCopy}
          onDelete={handleBulkDelete}
          onNew={addWorkflow}
        />
      }
      activeWorkflowId={activeWorkflow}
      defaultWorkflows={DEFAULT_WORKFLOWS}
      toggleWorkflowBulkSelect={toggleWorkflowBulkSelect}
      selectScriptWorkflow={selectScriptWorkflow}
      copyWorkflowId={copyWorkflowId}
      onContextMenu={onContextMenu}
      workflowTablePageSize={workflowTablePageSize}
      onWorkflowTablePageSizeChange={setWorkflowTablePageSize}
    />
  );
});
