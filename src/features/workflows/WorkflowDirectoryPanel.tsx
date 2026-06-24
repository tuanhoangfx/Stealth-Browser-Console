/** Scripts tab left pane — table-only-directory, no-form-directory, no-read-only-table; filter in WorkflowFilterPane. */
import { memo, type ReactNode } from "react";
import { HubDirectoryBulkActionBar, HubDirectoryToolbarSelection, HubSplitDirectoryPane } from "@tool-workspace/hub-ui";
import type { WorkflowConfig } from "./workflow-types";
import { StealthWorkflowDirectoryTable } from "./StealthWorkflowDirectoryTable";
import { WorkflowFilterPane } from "./WorkflowFilterPane";
import { useWorkflowDirectoryFilters } from "./useWorkflowDirectoryFilters";

export type WorkflowDirectoryPanelProps = {
  workflowConfigs: WorkflowConfig[];
  filteredWorkflows: WorkflowConfig[];
  workflowSearch: string;
  setWorkflowSearch: (value: string) => void;
  workflowGroupFilters: string[];
  setWorkflowGroupFilters: (values: string[]) => void;
  workflowPlatformFilters: string[];
  setWorkflowPlatformFilters: (values: string[]) => void;
  bulkSelectedIds: Set<string>;
  bulkAllVisibleSelected: boolean;
  toggleBulkSelectAll: () => void;
  bulkActions: ReactNode;
  activeWorkflowId: string;
  defaultWorkflows: WorkflowConfig[];
  toggleWorkflowBulkSelect: (id: string) => void;
  selectScriptWorkflow: (workflowId: string) => void;
  copyWorkflowId: (workflowId: string) => void;
  onContextMenu?: (workflow: WorkflowConfig, event: import("react").MouseEvent) => void;
  workflowTablePageSize: number;
  onWorkflowTablePageSizeChange?: (size: number) => void;
};

export const WorkflowDirectoryPanel = memo(function WorkflowDirectoryPanel({
  workflowConfigs,
  filteredWorkflows,
  workflowSearch,
  setWorkflowSearch,
  workflowGroupFilters,
  setWorkflowGroupFilters,
  workflowPlatformFilters,
  setWorkflowPlatformFilters,
  bulkSelectedIds,
  bulkAllVisibleSelected,
  toggleBulkSelectAll,
  bulkActions,
  activeWorkflowId,
  defaultWorkflows,
  toggleWorkflowBulkSelect,
  selectScriptWorkflow,
  copyWorkflowId,
  onContextMenu,
  workflowTablePageSize,
  onWorkflowTablePageSizeChange,
}: WorkflowDirectoryPanelProps) {
  const { filters, filterValues, listResetKey, handleFilterValuesChange } = useWorkflowDirectoryFilters({
    workflowConfigs,
    workflowSearch,
    workflowGroupFilters,
    setWorkflowGroupFilters,
    workflowPlatformFilters,
    setWorkflowPlatformFilters,
  });

  return (
    <HubSplitDirectoryPane
      className="stealth-workflow-directory-frame hub-directory-frame"
      variant="panel"
      filterBar={
        <WorkflowFilterPane
          variant="panel"
          filters={filters}
          filterValues={filterValues}
          onFilterValuesChange={handleFilterValuesChange}
          workflowSearch={workflowSearch}
          setWorkflowSearch={setWorkflowSearch}
          filteredCount={filteredWorkflows.length}
          totalCount={workflowConfigs.length}
          tablePageSize={workflowTablePageSize}
          onTablePageSizeChange={onWorkflowTablePageSizeChange}
          row2Actions={
            <HubDirectoryBulkActionBar>
              {bulkActions}
              <HubDirectoryToolbarSelection
                visibleCount={filteredWorkflows.length}
                selectedCount={bulkSelectedIds.size}
                noun="workflows"
              />
            </HubDirectoryBulkActionBar>
          }
        />
      }
    >
      <StealthWorkflowDirectoryTable
        items={filteredWorkflows}
        activeWorkflowId={activeWorkflowId}
        defaultWorkflows={defaultWorkflows}
        selectedIds={bulkSelectedIds}
        onToggleSelect={toggleWorkflowBulkSelect}
        onToggleSelectAll={toggleBulkSelectAll}
        allVisibleSelected={bulkAllVisibleSelected}
        onSelect={selectScriptWorkflow}
        onCopyId={copyWorkflowId}
        onContextMenu={onContextMenu}
        pageSize={workflowTablePageSize}
        resetKey={listResetKey}
        variant="panel"
        emptyMessage="No workflows match the current filters."
      />
    </HubSplitDirectoryPane>
  );
});
