import {
  countHiddenDirectoryTableColumns,
  createDirectoryTableColumnPrefs,
  type DirectoryTableColumnItem,
} from "@tool-workspace/hub-ui";
import { STEALTH_PROFILE_COLUMN_KEYS } from "../../lib/directory-column-meta";

export type ProfileDirectoryColumnKey = (typeof STEALTH_PROFILE_COLUMN_KEYS)[number];

export const PROFILE_DIRECTORY_GOLDEN_ORDER = [...STEALTH_PROFILE_COLUMN_KEYS] as const;

export const PROFILE_DIRECTORY_COLUMN_ITEMS: DirectoryTableColumnItem<ProfileDirectoryColumnKey>[] = [
  { key: "profile", label: "Profile", required: true },
  { key: "group", label: "Group" },
  { key: "status", label: "Status" },
  { key: "lastOpened", label: "Last opened" },
  { key: "startupUrl", label: "Startup URL" },
  { key: "proxy", label: "Proxy" },
  { key: "note", label: "Note" },
];

/** Note hidden by default — 6 visible data columns + checkbox. */
export const DEFAULT_PROFILE_DIRECTORY_COLUMNS = new Set<ProfileDirectoryColumnKey>([
  "profile",
  "group",
  "status",
  "lastOpened",
  "startupUrl",
  "proxy",
]);

export const PROFILE_DIRECTORY_COLUMNS_CHANGE = "stealth-profile-directory-columns-change";

export const profileDirectoryColumnPrefs = createDirectoryTableColumnPrefs({
  storageKey: "p0003_profile_directory_columns",
  items: PROFILE_DIRECTORY_COLUMN_ITEMS,
  defaultKeys: DEFAULT_PROFILE_DIRECTORY_COLUMNS,
  changeEvent: PROFILE_DIRECTORY_COLUMNS_CHANGE,
});

/** Visible columns in golden table order. */
export function readProfileDirectoryColumns(): ProfileDirectoryColumnKey[] {
  const visible = profileDirectoryColumnPrefs.read();
  return PROFILE_DIRECTORY_GOLDEN_ORDER.filter((key) => visible.has(key));
}

export function writeProfileDirectoryColumns(cols: readonly string[]) {
  profileDirectoryColumnPrefs.write(new Set(cols as ProfileDirectoryColumnKey[]));
}

export function countHiddenProfileDirectoryColumns(): number {
  return countHiddenDirectoryTableColumns(PROFILE_DIRECTORY_COLUMN_ITEMS, profileDirectoryColumnPrefs.read());
}

export function resetProfileDirectoryColumns() {
  profileDirectoryColumnPrefs.reset();
}
