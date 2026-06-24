/** Profiles tab — workflow rail: unified directory pane (filter + table). */
import { memo, useMemo, useCallback } from "react";
import { HubSplitDirectoryPane } from "@tool-workspace/hub-ui";
import { WORKFLOW_RAIL_PAGE_SIZE } from "../../app/constants";
import type { WorkflowConfig } from "./workflow-types";
import { StealthWorkflowDirectoryTable } from "./StealthWorkflowDirectoryTable";
import { WorkflowFilterPane } from "./WorkflowFilterPane";
import { useWorkflowDirectoryFilters } from "./useWorkflowDirectoryFilters";

export type WorkflowRailPanelProps = {
  workflowConfigs: WorkflowConfig[];
  filteredWorkflows: WorkflowConfig[];
  workflowSearch: string;
  setWorkflowSearch: (value: string) => void;
  workflowGroupFilters: string[];
  setWorkflowGroupFilters: (values: string[]) => void;
  workflowPlatformFilters: string[];
  setWorkflowPlatformFilters: (values: string[]) => void;
  selectedWorkflowIds: string[];
  setSelectedWorkflowIds: (ids: string[] | ((current: string[]) => string[])) => void;
  activeWorkflowId: string;
  onSelectWorkflow: (id: string) => void;
  onOpenWorkflowEditor?: (id: string) => void;
  defaultWorkflows: WorkflowConfig[];
};

export const WorkflowRailPanel = memo(function WorkflowRailPanel({
  workflowConfigs,
  filteredWorkflows,
  workflowSearch,
  setWorkflowSearch,
  workflowGroupFilters,
  setWorkflowGroupFilters,
  workflowPlatformFilters,
  setWorkflowPlatformFilters,
  selectedWorkflowIds,
  setSelectedWorkflowIds,
  activeWorkflowId,
  onSelectWorkflow,
  onOpenWorkflowEditor,
  defaultWorkflows,
}: WorkflowRailPanelProps) {
  const { filters, filterValues, listResetKey, handleFilterValuesChange } = useWorkflowDirectoryFilters({
    workflowConfigs,
    workflowSearch,
    workflowGroupFilters,
    setWorkflowGroupFilters,
    workflowPlatformFilters,
    setWorkflowPlatformFilters,
  });
  const selectedIds = useMemo(() => new Set(selectedWorkflowIds), [selectedWorkflowIds]);

  const toggleWorkflowSelect = useCallback(
    (id: string) => {
      setSelectedWorkflowIds((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
      );
    },
    [setSelectedWorkflowIds],
  );

  const handleSelectWorkflow = useCallback(
    (id: string) => {
      onSelectWorkflow(id);
    },
    [onSelectWorkflow],
  );

  return (
    <HubSplitDirectoryPane
      className="stealth-workflow-directory-frame hub-directory-frame shrink-0"
      variant="rail"
      fixedRows={WORKFLOW_RAIL_PAGE_SIZE}
      filterBar={
        <WorkflowFilterPane
          variant="rail"
          filters={filters}
          filterValues={filterValues}
          onFilterValuesChange={handleFilterValuesChange}
          workflowSearch={workflowSearch}
          setWorkflowSearch={setWorkflowSearch}
          filteredCount={filteredWorkflows.length}
          totalCount={workflowConfigs.length}
        />
      }
    >
      <StealthWorkflowDirectoryTable
        items={filteredWorkflows}
        activeWorkflowId={activeWorkflowId}
        defaultWorkflows={defaultWorkflows}
        selectedIds={selectedIds}
        onToggleSelect={toggleWorkflowSelect}
        onSelect={handleSelectWorkflow}
        onOpenEditor={onOpenWorkflowEditor}
        pageSize={WORKFLOW_RAIL_PAGE_SIZE}
        resetKey={listResetKey}
        variant="rail"
        emptyMessage="No workflows match the current filters."
      />
    </HubSplitDirectoryPane>
  );
});
