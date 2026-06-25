import {
  countHiddenDirectoryTableColumns,
  createDirectoryTableColumnPrefs,
  withDirectoryColumnIcons,
  type DirectoryTableColumnItem,
} from "@tool-workspace/hub-ui";
import { STEALTH_WORKFLOW_PANEL_COLUMN_KEYS, type StealthWorkflowPanelColumnKey } from "../../lib/directory-column-meta";
import { WORKFLOW_COLUMN_PREF_ICONS } from "../../lib/profile-display-pref-icons";

export const WORKFLOW_DIRECTORY_GOLDEN_ORDER = [...STEALTH_WORKFLOW_PANEL_COLUMN_KEYS] as const;

/** Shared column defs — rail + Scripts tab (Display toggles identical). */
export const WORKFLOW_DIRECTORY_COLUMN_ITEMS: DirectoryTableColumnItem<StealthWorkflowPanelColumnKey>[] =
  withDirectoryColumnIcons(
    [
      { key: "platform", label: "Platform" },
      { key: "name", label: "Name", required: true },
      { key: "id", label: "ID" },
      { key: "steps", label: "Steps" },
      { key: "created", label: "Created" },
      { key: "updated", label: "Updated" },
    ],
    WORKFLOW_COLUMN_PREF_ICONS,
  );

/** Rail default — base 3 cols + Steps only (Created/Updated off). */
export const DEFAULT_WORKFLOW_RAIL_DIRECTORY_COLUMNS = new Set<StealthWorkflowPanelColumnKey>([
  "platform",
  "name",
  "id",
  "steps",
]);

/** Scripts tab default — all columns visible. */
export const DEFAULT_WORKFLOW_PANEL_DIRECTORY_COLUMNS = new Set<StealthWorkflowPanelColumnKey>([
  "platform",
  "name",
  "id",
  "steps",
  "created",
  "updated",
]);

export const WORKFLOW_RAIL_DIRECTORY_COLUMNS_CHANGE = "stealth-workflow-rail-directory-columns-change";
export const WORKFLOW_PANEL_DIRECTORY_COLUMNS_CHANGE = "stealth-workflow-panel-directory-columns-change";

export const workflowRailDirectoryColumnPrefs = createDirectoryTableColumnPrefs({
  storageKey: "p0003_workflow_rail_directory_columns",
  items: WORKFLOW_DIRECTORY_COLUMN_ITEMS,
  defaultKeys: DEFAULT_WORKFLOW_RAIL_DIRECTORY_COLUMNS,
  changeEvent: WORKFLOW_RAIL_DIRECTORY_COLUMNS_CHANGE,
});

export const workflowPanelDirectoryColumnPrefs = createDirectoryTableColumnPrefs({
  storageKey: "p0003_workflow_panel_directory_columns",
  items: WORKFLOW_DIRECTORY_COLUMN_ITEMS,
  defaultKeys: DEFAULT_WORKFLOW_PANEL_DIRECTORY_COLUMNS,
  changeEvent: WORKFLOW_PANEL_DIRECTORY_COLUMNS_CHANGE,
});

function orderWorkflowDirectoryColumns(visible: Set<StealthWorkflowPanelColumnKey>): StealthWorkflowPanelColumnKey[] {
  return WORKFLOW_DIRECTORY_GOLDEN_ORDER.filter((key) => visible.has(key));
}

/** Legacy rail prefs (3 cols only) → add Steps once. */
function migrateLegacyRailColumns(visible: Set<StealthWorkflowPanelColumnKey>): Set<StealthWorkflowPanelColumnKey> {
  if (
    visible.size === 3 &&
    visible.has("platform") &&
    visible.has("name") &&
    visible.has("id") &&
    !visible.has("steps")
  ) {
    return new Set([...visible, "steps"]);
  }
  return visible;
}

export function readWorkflowRailDirectoryColumns(): StealthWorkflowPanelColumnKey[] {
  const visible = migrateLegacyRailColumns(workflowRailDirectoryColumnPrefs.read());
  return orderWorkflowDirectoryColumns(visible);
}

export function readWorkflowPanelDirectoryColumns(): StealthWorkflowPanelColumnKey[] {
  return orderWorkflowDirectoryColumns(workflowPanelDirectoryColumnPrefs.read());
}

export function countHiddenWorkflowRailDirectoryColumns(): number {
  const visible = migrateLegacyRailColumns(workflowRailDirectoryColumnPrefs.read());
  return countHiddenDirectoryTableColumns(WORKFLOW_DIRECTORY_COLUMN_ITEMS, visible);
}

export function countHiddenWorkflowPanelDirectoryColumns(): number {
  return countHiddenDirectoryTableColumns(
    WORKFLOW_DIRECTORY_COLUMN_ITEMS,
    workflowPanelDirectoryColumnPrefs.read(),
  );
}

export function resetWorkflowRailDirectoryColumns() {
  workflowRailDirectoryColumnPrefs.reset();
}

export function resetWorkflowPanelDirectoryColumns() {
  workflowPanelDirectoryColumnPrefs.reset();
}

/** @deprecated Use WORKFLOW_DIRECTORY_COLUMN_ITEMS */
export const WORKFLOW_RAIL_DIRECTORY_COLUMN_ITEMS = WORKFLOW_DIRECTORY_COLUMN_ITEMS;
/** @deprecated Use WORKFLOW_DIRECTORY_COLUMN_ITEMS */
export const WORKFLOW_PANEL_DIRECTORY_COLUMN_ITEMS = WORKFLOW_DIRECTORY_COLUMN_ITEMS;
