import { memo, type ReactNode } from "react";
import { Store } from "lucide-react";
import {
  DirectorySearchToolbar,
  HubSplitDirectoryFilterBar,
  type FilterDef,
  type FilterValues,
  type HubViewMode,
  type TimeRange,
} from "@tool-workspace/hub-ui";
import { StealthDisplayBandToolbar } from "../../components/StealthDisplayBandToolbar";

export type WorkflowStoreFilterPaneProps = {
  filters: FilterDef[];
  filterValues: FilterValues;
  onFilterValuesChange: (values: FilterValues) => void;
  search: string;
  setSearch: (value: string) => void;
  filteredCount: number;
  totalCount: number;
  tablePageSize: number;
  onTablePageSizeChange?: (size: number) => void;
  row2Actions?: ReactNode;
  row2Trailing?: ReactNode;
  viewMode: HubViewMode;
  onViewModeChange: (mode: HubViewMode) => void;
  timeRange: TimeRange;
  loading?: boolean;
};

export const WorkflowStoreFilterPane = memo(function WorkflowStoreFilterPane({
  filters,
  filterValues,
  onFilterValuesChange,
  search,
  setSearch,
  filteredCount,
  totalCount,
  tablePageSize,
  onTablePageSizeChange,
  row2Actions,
  row2Trailing,
  viewMode,
  onViewModeChange,
  timeRange,
  loading = false,
}: WorkflowStoreFilterPaneProps) {
  const isTable = viewMode === "table";

  return (
    <HubSplitDirectoryFilterBar
      shortcutScope="workflow-store"
      placeholder="Search store workflows…"
      filters={filters}
      query={search}
      onQueryChange={setSearch}
      values={filterValues}
      onValuesChange={onFilterValuesChange}
      toolbar={
        <DirectorySearchToolbar
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          showViewToggle
          showTimeRange
          timeRange={timeRange}
          showRefresh={false}
          showTablePageSize={isTable}
          tablePageSize={tablePageSize}
          onTablePageSizeChange={onTablePageSizeChange}
          showResultCount={viewMode === "card"}
          countIcon={Store}
          shown={filteredCount}
          total={totalCount}
          countLabel="workflows"
          refreshing={loading}
          displayBand={<StealthDisplayBandToolbar screen="workflow" directoryVariant="panel" />}
        />
      }
      row2Actions={row2Actions}
      row2Trailing={row2Trailing}
    />
  );
});
