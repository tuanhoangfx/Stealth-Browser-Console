/** Workflow Store — Hub directory frame (P0004 Hub Tools parity: table/card + time range). */
import { memo, useEffect, useState, type ReactNode } from "react";
import {
  HubDirectoryBulkActionBar,
  HubDirectoryToolbarSelection,
  HubPaginatedCardGrid,
  HubSplitDirectoryPane,
  type HubViewMode,
  type TimeRange,
} from "@tool-workspace/hub-ui";
import type { WorkflowStoreEntry } from "./workflow-store-types";
import { WorkflowStoreCard } from "./WorkflowStoreCard";
import { WorkflowStoreDirectoryTable } from "./WorkflowStoreDirectoryTable";
import { WorkflowStoreFilterPane } from "./WorkflowStoreFilterPane";
import { useWorkflowStoreDirectoryFilters } from "./useWorkflowStoreDirectoryFilters";
import {
  readWorkflowStoreDirectoryColumns,
  workflowStoreDirectoryColumnPrefs,
} from "./workflow-store-directory-prefs";

export type WorkflowStoreDirectoryPanelProps = {
  entries: WorkflowStoreEntry[];
  filteredEntries: WorkflowStoreEntry[];
  search: string;
  setSearch: (value: string) => void;
  groupFilters: string[];
  setGroupFilters: (values: string[]) => void;
  platformFilters: string[];
  setPlatformFilters: (values: string[]) => void;
  sourceFilters: string[];
  setSourceFilters: (values: string[]) => void;
  bulkSelectedIds: Set<string>;
  bulkAllVisibleSelected: boolean;
  toggleBulkSelectAll: () => void;
  toggleBulkSelect: (id: string) => void;
  bulkActions: ReactNode;
  localIds: Set<string>;
  installedIds: Set<string>;
  onInstall: (entry: WorkflowStoreEntry) => void;
  tablePageSize: number;
  onTablePageSizeChange?: (size: number) => void;
  installingId: string | null;
  loading: boolean;
  errors: ReactNode;
  viewMode: HubViewMode;
  onViewModeChange: (mode: HubViewMode) => void;
  timeRange: TimeRange;
};

export const WorkflowStoreDirectoryPanel = memo(function WorkflowStoreDirectoryPanel({
  entries,
  filteredEntries,
  search,
  setSearch,
  groupFilters,
  setGroupFilters,
  platformFilters,
  setPlatformFilters,
  sourceFilters,
  setSourceFilters,
  bulkSelectedIds,
  bulkAllVisibleSelected,
  toggleBulkSelectAll,
  toggleBulkSelect,
  bulkActions,
  localIds,
  installedIds,
  onInstall,
  tablePageSize,
  onTablePageSizeChange,
  installingId,
  loading,
  errors,
  viewMode,
  onViewModeChange,
  timeRange,
}: WorkflowStoreDirectoryPanelProps) {
  const { filters, filterValues, listResetKey, handleFilterValuesChange } = useWorkflowStoreDirectoryFilters({
    entries,
    search,
    groupFilters,
    setGroupFilters,
    platformFilters,
    setPlatformFilters,
    sourceFilters,
    setSourceFilters,
    timeRange,
    viewMode,
  });

  const [visibleColumnKeys, setVisibleColumnKeys] = useState(readWorkflowStoreDirectoryColumns);

  useEffect(() => {
    const sync = () => setVisibleColumnKeys(readWorkflowStoreDirectoryColumns());
    window.addEventListener(workflowStoreDirectoryColumnPrefs.changeEvent, sync);
    return () => window.removeEventListener(workflowStoreDirectoryColumnPrefs.changeEvent, sync);
  }, []);

  const emptyMessage =
    loading && entries.length === 0
      ? "Loading catalog…"
      : "No workflows match the current filters.";

  return (
    <div className="stealth-workflow-store-directory flex min-h-0 flex-1 flex-col overflow-hidden">
      {errors}
      <HubSplitDirectoryPane
        className="stealth-workflow-store-directory-frame hub-directory-frame flex min-h-0 flex-1 flex-col"
        variant="panel"
        filterBar={
          <WorkflowStoreFilterPane
            filters={filters}
            filterValues={filterValues}
            onFilterValuesChange={handleFilterValuesChange}
            search={search}
            setSearch={setSearch}
            filteredCount={filteredEntries.length}
            totalCount={entries.length}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            timeRange={timeRange}
            loading={loading}
            searchTrailing={
              <HubDirectoryToolbarSelection
                visibleCount={filteredEntries.length}
                selectedCount={bulkSelectedIds.size}
                noun="workflows"
              />
            }
            row2Actions={
              <HubDirectoryBulkActionBar
                selectAll={
                  viewMode === "card"
                    ? {
                        visibleCount: filteredEntries.length,
                        selectedCount: bulkSelectedIds.size,
                        allVisibleSelected: bulkAllVisibleSelected,
                        onToggleSelectAll: toggleBulkSelectAll,
                        noun: "workflows",
                      }
                    : null
                }
              >
                {bulkActions}
              </HubDirectoryBulkActionBar>
            }
          />
        }
      >
        {filteredEntries.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">{emptyMessage}</p>
        ) : viewMode === "card" ? (
          <HubPaginatedCardGrid items={filteredEntries} resetKey={listResetKey} ariaLabel="Store card pages">
            {(pageEntries) =>
              pageEntries.map((entry) => (
                <WorkflowStoreCard
                  key={entry.id}
                  entry={entry}
                  selected={bulkSelectedIds.has(entry.id)}
                  localIds={localIds}
                  installedIds={installedIds}
                  busy={installingId === entry.id}
                  visibleColumnKeys={visibleColumnKeys}
                  onToggleSelect={toggleBulkSelect}
                  onInstall={onInstall}
                />
              ))
            }
          </HubPaginatedCardGrid>
        ) : (
          <WorkflowStoreDirectoryTable
            items={filteredEntries}
            selectedIds={bulkSelectedIds}
            onToggleSelect={toggleBulkSelect}
            onToggleSelectAll={toggleBulkSelectAll}
            allVisibleSelected={bulkAllVisibleSelected}
            onInstall={onInstall}
            localIds={localIds}
            installedIds={installedIds}
            pageSize={tablePageSize}
            resetKey={listResetKey}
            installingId={installingId}
            emptyMessage={emptyMessage}
          />
        )}
      </HubSplitDirectoryPane>
    </div>
  );
});
