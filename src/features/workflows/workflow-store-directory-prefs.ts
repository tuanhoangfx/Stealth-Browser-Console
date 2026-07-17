import {
  asDirectoryTableColumnPresetManagerProp,
  countHiddenDirectoryTableColumns,
  createDirectoryTableColumnPrefs,
  createDirectoryTableColumnPresetManager,
  prefIconMapFromHubDirectoryColumnMeta,
  withDirectoryColumnIcons,
  withDirectoryColumnLabelHints,
  type DirectoryTableColumnItem,
} from "@tool-workspace/hub-ui";
import {
  STEALTH_WORKFLOW_STORE_COLUMN_KEYS,
  STEALTH_WORKFLOW_STORE_COLUMN_META,
  toHubDirectoryColumnMeta,
  type StealthWorkflowStoreColumnKey,
} from "../../lib/directory-column-meta";
import { stealthWorkflowStoreColumnHintContent } from "../../lib/stealth-directory-column-hints";

const WORKFLOW_STORE_COLUMN_PREF_ICONS = prefIconMapFromHubDirectoryColumnMeta(
  toHubDirectoryColumnMeta(STEALTH_WORKFLOW_STORE_COLUMN_META),
);

export type WorkflowStoreDirectoryColumnKey = StealthWorkflowStoreColumnKey;

export const WORKFLOW_STORE_DIRECTORY_GOLDEN_ORDER = [...STEALTH_WORKFLOW_STORE_COLUMN_KEYS] as const;

export const WORKFLOW_STORE_DIRECTORY_COLUMN_ITEMS: DirectoryTableColumnItem<WorkflowStoreDirectoryColumnKey>[] =
  withDirectoryColumnLabelHints(
    withDirectoryColumnIcons(
      [
        { key: "platform", label: "Platform" },
        { key: "name", label: "Name", required: true },
        { key: "version", label: "Version" },
        { key: "group", label: "Group" },
        { key: "status", label: "Status" },
        { key: "source", label: "Source" },
        { key: "updated", label: "Update" },
      ],
      WORKFLOW_STORE_COLUMN_PREF_ICONS,
    ),
    stealthWorkflowStoreColumnHintContent,
  );

export const DEFAULT_WORKFLOW_STORE_DIRECTORY_COLUMNS = new Set<WorkflowStoreDirectoryColumnKey>([
  "platform",
  "name",
  "version",
  "group",
  "status",
  "source",
  "updated",
]);

export const WORKFLOW_STORE_DIRECTORY_COLUMNS_CHANGE = "stealth-workflow-store-directory-columns-change";

export const workflowStoreDirectoryColumnPrefs = createDirectoryTableColumnPrefs({
  storageKey: "p0003_workflow_store_directory_columns",
  items: WORKFLOW_STORE_DIRECTORY_COLUMN_ITEMS,
  defaultKeys: DEFAULT_WORKFLOW_STORE_DIRECTORY_COLUMNS,
  changeEvent: WORKFLOW_STORE_DIRECTORY_COLUMNS_CHANGE,
});

export const workflowStoreDirectoryColumnPresetManager = createDirectoryTableColumnPresetManager({
  prefs: workflowStoreDirectoryColumnPrefs,
  presetsStorageKey: "p0003_workflow_store_directory_column_presets",
  itemKeys: WORKFLOW_STORE_DIRECTORY_GOLDEN_ORDER,
  defaultVisible: DEFAULT_WORKFLOW_STORE_DIRECTORY_COLUMNS,
});

export const workflowStoreDirectoryColumnPresetsProp = asDirectoryTableColumnPresetManagerProp(
  workflowStoreDirectoryColumnPresetManager,
);

export function readWorkflowStoreDirectoryColumns(): WorkflowStoreDirectoryColumnKey[] {
  const visible = workflowStoreDirectoryColumnPrefs.read();
  return WORKFLOW_STORE_DIRECTORY_GOLDEN_ORDER.filter((key) => visible.has(key));
}

export function countHiddenWorkflowStoreDirectoryColumns(): number {
  return countHiddenDirectoryTableColumns(
    WORKFLOW_STORE_DIRECTORY_COLUMN_ITEMS,
    workflowStoreDirectoryColumnPrefs.read(),
  );
}

export function resetWorkflowStoreDirectoryColumns() {
  workflowStoreDirectoryColumnPrefs.reset();
}
