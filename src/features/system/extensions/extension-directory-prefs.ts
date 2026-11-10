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
  STEALTH_EXTENSIONS_COLUMN_KEYS,
  STEALTH_EXTENSIONS_COLUMN_META,
  toHubDirectoryColumnMeta,
} from "../../../lib/directory-column-meta";

const EXTENSION_COLUMN_PREF_ICONS = prefIconMapFromHubDirectoryColumnMeta(
  toHubDirectoryColumnMeta(STEALTH_EXTENSIONS_COLUMN_META),
);

export type ExtensionDirectoryColumnKey = (typeof STEALTH_EXTENSIONS_COLUMN_KEYS)[number];

export const EXTENSION_DIRECTORY_GOLDEN_ORDER = [...STEALTH_EXTENSIONS_COLUMN_KEYS] as const;

export const EXTENSION_DIRECTORY_COLUMN_ITEMS: DirectoryTableColumnItem<ExtensionDirectoryColumnKey>[] =
  withDirectoryColumnIcons(
    [
      { key: "createdAt", label: "Created" },
      { key: "updated", label: "Update" },
      { key: "extension", label: "Extension", required: true },
      { key: "kind", label: "Kind" },
      { key: "version", label: "Version" },
      { key: "storeId", label: "Store ID" },
      { key: "path", label: "Path" },
      { key: "activityLog", label: "Log" },
    ],
    EXTENSION_COLUMN_PREF_ICONS,
  );

export const DEFAULT_EXTENSION_DIRECTORY_COLUMNS = new Set<ExtensionDirectoryColumnKey>([
  "createdAt",
  "updated",
  "extension",
  "kind",
  "version",
  "storeId",
  "activityLog",
]);

export const EXTENSION_DIRECTORY_COLUMNS_CHANGE = "stealth-extension-directory-columns-change";

export const extensionDirectoryColumnPrefs = createDirectoryTableColumnPrefs({
  storageKey: "p0003_extension_directory_columns_v3",
  items: EXTENSION_DIRECTORY_COLUMN_ITEMS,
  defaultKeys: DEFAULT_EXTENSION_DIRECTORY_COLUMNS,
  changeEvent: EXTENSION_DIRECTORY_COLUMNS_CHANGE,
});

export const extensionDirectoryColumnPresetManager = createDirectoryTableColumnPresetManager({
  prefs: extensionDirectoryColumnPrefs,
  presetsStorageKey: "p0003_extension_directory_column_presets",
  itemKeys: EXTENSION_DIRECTORY_GOLDEN_ORDER,
  defaultVisible: DEFAULT_EXTENSION_DIRECTORY_COLUMNS,
});

export const extensionDirectoryColumnPresetsProp = asDirectoryTableColumnPresetManagerProp(
  extensionDirectoryColumnPresetManager,
);

export function readExtensionDirectoryColumns(): ExtensionDirectoryColumnKey[] {
  return EXTENSION_DIRECTORY_GOLDEN_ORDER.filter((key) => extensionDirectoryColumnPrefs.read().has(key));
}

export function countHiddenExtensionDirectoryColumns(): number {
  return countHiddenDirectoryTableColumns(
    EXTENSION_DIRECTORY_COLUMN_ITEMS,
    extensionDirectoryColumnPrefs.read(),
  );
}

export function resetExtensionDirectoryColumns() {
  extensionDirectoryColumnPrefs.reset();
}
