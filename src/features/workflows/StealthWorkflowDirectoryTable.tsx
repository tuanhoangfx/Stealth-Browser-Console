/** Golden workflow directory table — WorkflowPickerRail (Profiles) + WorkflowDirectoryPanel (Scripts). */
import { useMemo, memo } from "react";
import {
  HubDirectoryTableShell,
  HUB_DIRECTORY_TABLE_INLINE_WRAP_CLASS,
  HUB_DIRECTORY_TABLE_PANE_CHROME_SPLIT_CLASS,
  buildDirectoryColgroupForShell,
  buildDirectoryColumns,
  hubDirectoryTableClass,
  useDirectoryTableSort,
} from "@tool-workspace/hub-ui";
import {
  STEALTH_WORKFLOW_PANEL_COLUMN_KEYS,
  STEALTH_WORKFLOW_PANEL_COLUMN_META,
  STEALTH_WORKFLOW_RAIL_COLUMN_KEYS,
  STEALTH_WORKFLOW_RAIL_COLUMN_META,
  toHubDirectoryColumnMeta,
} from "../../lib/directory-column-meta";
import { STEALTH_DIRECTORY_TABLE_WRAP_PANE_SCROLL_CLASS } from "../tables/stealth-directory-table";
import { workflowDisplayId, workflowDisplayPlatform } from "./workflow-display";
import { workflowCreatedMs, workflowStepCount, workflowUpdatedMs } from "./workflow-meta";
import { renderStealthWorkflowDirectoryBodyCell } from "./stealth-workflow-directory-cells";
import type { WorkflowConfig } from "./workflow-types";

export type StealthWorkflowSortKey = "id" | "name" | "platform" | "steps" | "created" | "updated";

function sortableWorkflowValue(workflow: WorkflowConfig, key: StealthWorkflowSortKey, defaultWorkflows: WorkflowConfig[]) {
  switch (key) {
    case "id":
      return workflowDisplayId(workflow.id, defaultWorkflows);
    case "name":
      return workflow.name;
    case "platform":
      return workflowDisplayPlatform(workflow);
    case "steps":
      return String(workflowStepCount(workflow)).padStart(4, "0");
    case "created":
      return String(workflowCreatedMs(workflow) ?? 0).padStart(14, "0");
    case "updated":
      return String(workflowUpdatedMs(workflow) ?? 0).padStart(14, "0");
    default:
      return "";
  }
}

export type StealthWorkflowDirectoryTableProps = {
  items: WorkflowConfig[];
  activeWorkflowId: string;
  defaultWorkflows: WorkflowConfig[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll?: () => void;
  allVisibleSelected?: boolean;
  onSelect: (workflowId: string) => void;
  onOpenEditor?: (workflowId: string) => void;
  onCopyId?: (workflowId: string) => void;
  onContextMenu?: (workflow: WorkflowConfig, event: import("react").MouseEvent) => void;
  pageSize: number;
  resetKey: string;
  emptyMessage?: string;
  /** WorkflowPickerRail (Profiles) vs WorkflowDirectoryPanel (Scripts). */
  variant?: "rail" | "panel";
};

export const StealthWorkflowDirectoryTable = memo(function StealthWorkflowDirectoryTable({
  items,
  activeWorkflowId,
  defaultWorkflows,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  allVisibleSelected = false,
  onSelect,
  onOpenEditor,
  onCopyId,
  onContextMenu,
  pageSize,
  resetKey,
  emptyMessage = "No workflows match the current filters.",
  variant = "panel",
}: StealthWorkflowDirectoryTableProps) {
  const isRail = variant === "rail";
  const columnKeys = isRail ? STEALTH_WORKFLOW_RAIL_COLUMN_KEYS : STEALTH_WORKFLOW_PANEL_COLUMN_KEYS;
  const columnMeta = isRail ? STEALTH_WORKFLOW_RAIL_COLUMN_META : STEALTH_WORKFLOW_PANEL_COLUMN_META;

  const sortableValue = useMemo(
    () => (workflow: WorkflowConfig, key: StealthWorkflowSortKey) =>
      sortableWorkflowValue(workflow, key, defaultWorkflows),
    [defaultWorkflows],
  );

  const { sortKey, sortDir, onSort, sorted } = useDirectoryTableSort(
    items,
    "name" as StealthWorkflowSortKey,
    sortableValue,
    "asc",
  );

  const columns = useMemo(
    () => buildDirectoryColumns([...columnKeys], toHubDirectoryColumnMeta(columnMeta)),
    [columnKeys, columnMeta],
  );

  const colgroup = useMemo(() => buildDirectoryColgroupForShell(columns, { showSelect: true }), [columns]);

  const wrapClassName = isRail
    ? `${HUB_DIRECTORY_TABLE_INLINE_WRAP_CLASS} ${HUB_DIRECTORY_TABLE_PANE_CHROME_SPLIT_CLASS}`
    : STEALTH_DIRECTORY_TABLE_WRAP_PANE_SCROLL_CLASS;

  return (
    <HubDirectoryTableShell
      items={sorted}
      ariaLabel={isRail ? "Workflow picker rail" : "Workflow directory"}
      tableClassName={
        isRail
          ? `${hubDirectoryTableClass("4")} hub-directory-frame-table stealth-workflow-rail-table`
          : `${hubDirectoryTableClass("6")} hub-directory-frame-table stealth-workflow-panel-table`
      }
      wrapClassName={wrapClassName}
      flushWrap
      colgroup={colgroup}
      columns={columns}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      getRowKey={(workflow) => workflow.id}
      onRowClick={(workflow) => onSelect(workflow.id)}
      onRowDoubleClick={onOpenEditor ? (workflow) => onOpenEditor(workflow.id) : undefined}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      onToggleSelectAll={onToggleSelectAll}
      allVisibleSelected={allVisibleSelected}
      selectAllLabel="Select all on this page"
      emptyMessage={emptyMessage}
      pageSize={pageSize}
      resetKey={`${resetKey}|${sortKey}|${sortDir}`}
      getRowClassName={(workflow) =>
        !isRail && workflow.id === activeWorkflowId ? " is-detail" : ""
      }
      renderRowCells={(workflow) => (
        <>
          {columns.map((col) =>
            renderStealthWorkflowDirectoryBodyCell(col, workflow, {
              defaultWorkflows,
              onCopyId,
              onContextMenu,
            }),
          )}
        </>
      )}
    />
  );
});
