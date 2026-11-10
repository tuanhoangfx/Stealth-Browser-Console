/** Workflow Store directory table — P0004 UserDirectoryTable / StealthWorkflowDirectoryTable parity. */
import { memo, useEffect, useMemo, useState } from "react";
import {
  HubDirectoryTableShell,
  HUB_DIRECTORY_TABLE_PANE_WRAP_CLASS,
  buildDirectoryColgroupForShell,
  buildDirectoryColumns,
  hubDirectoryTableClass,
  useDirectoryTableSort,
} from "@tool-workspace/hub-ui";
import {
  STEALTH_WORKFLOW_STORE_COLUMN_META,
  toHubDirectoryColumnMeta,
} from "../../lib/directory-column-meta";
import { useStealthManualSortEnabled } from "../../lib/stealth-manual-sort-prefs";
import {
  readWorkflowStoreDirectoryColumns,
  workflowStoreDirectoryColumnPrefs,
} from "./workflow-store-directory-prefs";
import { renderWorkflowStoreDirectoryBodyCell } from "./workflow-store-directory-cells";
import { workflowStoreCreatedMs, workflowStoreUpdatedMs } from "./workflow-store-meta";
import type { WorkflowStoreEntry } from "./workflow-store-types";

export type WorkflowStoreSortKey =
  | "created"
  | "updated"
  | "platform"
  | "name"
  | "version"
  | "group"
  | "status"
  | "source"
  | "activityLog";

function sortableStoreValue(entry: WorkflowStoreEntry, key: WorkflowStoreSortKey, localIds: Set<string>) {
  switch (key) {
    case "created":
      return String(workflowStoreCreatedMs(entry) ?? 0).padStart(14, "0");
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
    case "activityLog":
      return `${entry.description || entry.name}`;
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
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(readWorkflowStoreDirectoryColumns);

  useEffect(() => {
    const sync = () => setVisibleColumnKeys(readWorkflowStoreDirectoryColumns());
    window.addEventListener(workflowStoreDirectoryColumnPrefs.changeEvent, sync);
    return () => window.removeEventListener(workflowStoreDirectoryColumnPrefs.changeEvent, sync);
  }, []);

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

  const manualSort = useStealthManualSortEnabled("p0003-workflow-store");

  const columns = useMemo(
    () =>
      buildDirectoryColumns(
        visibleColumnKeys as WorkflowStoreSortKey[],
        toHubDirectoryColumnMeta(STEALTH_WORKFLOW_STORE_COLUMN_META),
        { sortable: manualSort },
      ),
    [visibleColumnKeys, manualSort],
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
            renderWorkflowStoreDirectoryBodyCell(col, entry, {
              localIds,
              installedIds,
              installing: installingId === entry.id,
            }),
          )}
        </>
      )}
    />
  );
});
