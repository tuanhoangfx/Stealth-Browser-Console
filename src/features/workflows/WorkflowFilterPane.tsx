/** Workflow directory frame — search, filters, optional pager toolbar + bulk actions. */
import { memo, type ReactNode } from "react";
import { Bot } from "lucide-react";
import { DirectorySearchToolbar, HubSplitDirectoryFilterBar } from "@tool-workspace/hub-ui";
import { StealthDisplayBandToolbar } from "../../components/StealthDisplayBandToolbar";
import type { FilterDef, FilterValues } from "@tool-workspace/hub-ui";

export type WorkflowFilterPaneVariant = "rail" | "panel";

export type WorkflowFilterPaneProps = {
  variant: WorkflowFilterPaneVariant;
  filters: FilterDef[];
  filterValues: FilterValues;
  onFilterValuesChange: (values: FilterValues) => void;
  workflowSearch: string;
  setWorkflowSearch: (value: string) => void;
  filteredCount: number;
  totalCount: number;
  /** Panel variant — pager rows SSOT from useWorkflows. */
  tablePageSize?: number;
  onTablePageSizeChange?: (size: number) => void;
  row2Actions?: ReactNode;
  row2Trailing?: ReactNode;
  searchTrailing?: ReactNode;
};

export const WorkflowFilterPane = memo(function WorkflowFilterPane({
  variant,
  filters,
  filterValues,
  onFilterValuesChange,
  workflowSearch,
  setWorkflowSearch,
  filteredCount,
  totalCount,
  tablePageSize,
  onTablePageSizeChange,
  row2Actions,
  row2Trailing,
  searchTrailing,
}: WorkflowFilterPaneProps) {
  const isPanel = variant === "panel";

  return (
    <HubSplitDirectoryFilterBar
      shortcutScope={isPanel ? "workflows" : "workflow-rail"}
      placeholder="Search workflows…"
      filters={filters}
      query={workflowSearch}
      onQueryChange={setWorkflowSearch}
      values={filterValues}
      onValuesChange={onFilterValuesChange}
      toolbar={
        <DirectorySearchToolbar
          showViewToggle={false}
          showTimeRange={false}
          showRefresh={false}
          displayBand={<StealthDisplayBandToolbar screen="workflow" directoryVariant={variant} />}
          showTablePageSize={isPanel}
          tablePageSize={tablePageSize}
          onTablePageSizeChange={onTablePageSizeChange}
          showResultCount={false}
          countIcon={Bot}
          shown={filteredCount}
          total={totalCount}
          countLabel="workflows"
        />
      }
      row2Actions={row2Actions}
      row2Trailing={row2Trailing}
      searchTrailing={searchTrailing}
    />
  );
});
