import {
  asDirectoryTableColumnPresetManagerProp,
  countHiddenDirectoryTableColumns,
  createDirectoryTableColumnPrefs,
  createDirectoryTableColumnPresetManager,
  prefIconMapFromHubDirectoryColumnMeta,
  withDirectoryColumnIcons,
  type DirectoryTableColumnItem,
} from "@tool-workspace/hub-ui";
import {
  STEALTH_BACKUP_COLUMN_KEYS,
  STEALTH_BACKUP_COLUMN_META,
  toHubDirectoryColumnMeta,
} from "../../../lib/directory-column-meta";

const BACKUP_COLUMN_PREF_ICONS = prefIconMapFromHubDirectoryColumnMeta(
  toHubDirectoryColumnMeta(STEALTH_BACKUP_COLUMN_META),
);

export type BackupDirectoryColumnKey = (typeof STEALTH_BACKUP_COLUMN_KEYS)[number];

export const BACKUP_DIRECTORY_GOLDEN_ORDER = [...STEALTH_BACKUP_COLUMN_KEYS] as const;

export const BACKUP_DIRECTORY_COLUMN_ITEMS: DirectoryTableColumnItem<BackupDirectoryColumnKey>[] =
  withDirectoryColumnIcons(
    [
      { key: "createdAt", label: "Created" },
      { key: "updated", label: "Update" },
      { key: "profile", label: "Profile", required: true },
      { key: "group", label: "Group" },
      { key: "status", label: "Backup" },
      { key: "backupSlots", label: "Slots" },
      { key: "dataSize", label: "Data" },
      { key: "cookies", label: "Cookies" },
      { key: "historyState", label: "History" },
      { key: "folder", label: "Folder" },
      { key: "activityLog", label: "Log" },
    ],
    BACKUP_COLUMN_PREF_ICONS,
  );

export const DEFAULT_BACKUP_DIRECTORY_COLUMNS = new Set<BackupDirectoryColumnKey>([
  "createdAt",
  "updated",
  "profile",
  "group",
  "status",
  "backupSlots",
  "dataSize",
  "cookies",
  "historyState",
  "folder",
  "activityLog",
]);

export const BACKUP_DIRECTORY_COLUMNS_CHANGE = "stealth-backup-directory-columns-change";

export const backupDirectoryColumnPrefs = createDirectoryTableColumnPrefs({
  storageKey: "p0003_backup_directory_columns_v4",
  items: BACKUP_DIRECTORY_COLUMN_ITEMS,
  defaultKeys: DEFAULT_BACKUP_DIRECTORY_COLUMNS,
  changeEvent: BACKUP_DIRECTORY_COLUMNS_CHANGE,
});

export const backupDirectoryColumnPresetManager = createDirectoryTableColumnPresetManager({
  prefs: backupDirectoryColumnPrefs,
  presetsStorageKey: "p0003_backup_directory_column_presets_v2",
  itemKeys: BACKUP_DIRECTORY_GOLDEN_ORDER,
  defaultVisible: DEFAULT_BACKUP_DIRECTORY_COLUMNS,
});

export const backupDirectoryColumnPresetsProp = asDirectoryTableColumnPresetManagerProp(
  backupDirectoryColumnPresetManager,
);

export function readBackupDirectoryColumns(): BackupDirectoryColumnKey[] {
  const visible = backupDirectoryColumnPrefs.read();
  const legacy = visible as Set<string>;
  if (legacy.has("lastBackup")) {
    legacy.delete("lastBackup");
    visible.add("updated");
  }
  return BACKUP_DIRECTORY_GOLDEN_ORDER.filter((key) => visible.has(key));
}

export function countHiddenBackupDirectoryColumns(): number {
  return countHiddenDirectoryTableColumns(BACKUP_DIRECTORY_COLUMN_ITEMS, backupDirectoryColumnPrefs.read());
}

export function resetBackupDirectoryColumns() {
  backupDirectoryColumnPrefs.reset();
}
