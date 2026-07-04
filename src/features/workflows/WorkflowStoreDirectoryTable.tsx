/** Workflow Store directory table — P0004 UserDirectoryTable / StealthWorkflowDirectoryTable parity. */
import { memo, useMemo } from "react";
import {
  HubDirectoryTableShell,
  HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS,
  buildDirectoryColgroupForShell,
  buildDirectoryColumns,
  hubDirectoryTableClass,
  useDirectoryTableSort,
} from "@tool-workspace/hub-ui";
import {
  STEALTH_WORKFLOW_STORE_COLUMN_KEYS,
  STEALTH_WORKFLOW_STORE_COLUMN_META,
  toHubDirectoryColumnMeta,
} from "../../lib/directory-column-meta";
import { renderWorkflowStoreDirectoryBodyCell } from "./workflow-store-directory-cells";
import { workflowStoreUpdatedMs } from "./workflow-store-meta";
import type { WorkflowStoreEntry } from "./workflow-store-types";

export type WorkflowStoreSortKey = "platform" | "name" | "version" | "group" | "status" | "source" | "updated";

function sortableStoreValue(entry: WorkflowStoreEntry, key: WorkflowStoreSortKey, localIds: Set<string>) {
  switch (key) {
    case "platform":
      return entry.platform;
    case "name":
      return entry.name;
    case "version":
      return entry.version;
    case "group":
      return entry.group;
    case "status":
      return localIds.has(entry.id) ? "0-local" : entry.id;
    case "source":
      return entry.source;
    case "updated":
      return String(workflowStoreUpdatedMs(entry) ?? 0).padStart(14, "0");
    default:
      return "";
  }
}

export type WorkflowStoreDirectoryTableProps = {
  items: WorkflowStoreEntry[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll?: () => void;
  allVisibleSelected?: boolean;
  onInstall: (entry: WorkflowStoreEntry) => void;
  localIds: Set<string>;
  installedIds: Set<string>;
  pageSize: number;
  resetKey: string;
  emptyMessage?: string;
  installingId: string | null;
};

export const WorkflowStoreDirectoryTable = memo(function WorkflowStoreDirectoryTable({
  items,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allVisibleSelected = false,
  onInstall,
  localIds,
  installedIds,
  pageSize,
  resetKey,
  emptyMessage = "No workflows match the current filters.",
  installingId,
}: WorkflowStoreDirectoryTableProps) {
  const sortableValue = useMemo(
    () => (entry: WorkflowStoreEntry, key: WorkflowStoreSortKey) =>
      sortableStoreValue(entry, key, localIds),
    [localIds],
  );

  const { sortKey, sortDir, onSort, sorted } = useDirectoryTableSort(
    items,
    "name" as WorkflowStoreSortKey,
    sortableValue,
    "asc",
  );

  const columns = useMemo(
    () =>
      buildDirectoryColumns(
        [...STEALTH_WORKFLOW_STORE_COLUMN_KEYS],
        toHubDirectoryColumnMeta(STEALTH_WORKFLOW_STORE_COLUMN_META),
      ),
    [],
  );

  const colgroup = useMemo(() => buildDirectoryColgroupForShell(columns, { showSelect: true }), [columns]);

  return (
    <HubDirectoryTableShell
      items={sorted}
      ariaLabel="Workflow Store directory"
      tableClassName={`${hubDirectoryTableClass("6")} hub-directory-frame-table stealth-workflow-store-table`}
      wrapClassName={HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS}
      flushWrap
      colgroup={colgroup}
      columns={columns}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      getRowKey={(entry) => entry.id}
      onRowClick={(entry) => onToggleSelect(entry.id)}
      onRowDoubleClick={(entry) => onInstall(entry)}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
      allVisibleSelected={allVisibleSelected}
      selectAllLabel="Select all on this page"
      emptyMessage={emptyMessage}
      pageSize={pageSize}
      resetKey={`${resetKey}|${sortKey}|${sortDir}`}
      getRowClassName={(entry) => (installingId === entry.id ? " is-busy" : "")}
      renderRowCells={(entry) => (
        <>
          {columns.map((col) =>
            renderWorkflowStoreDirectoryBodyCell(col, entry, { localIds, installedIds }),
          )}
        </>
      )}
    />
  );
});
