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
  STEALTH_PROFILE_COLUMN_KEYS,
  STEALTH_PROFILE_COLUMN_META,
  toHubDirectoryColumnMeta,
} from "../../lib/directory-column-meta";
import { stealthProfileColumnHintContent } from "../../lib/stealth-directory-column-hints";

const PROFILE_COLUMN_PREF_ICONS = prefIconMapFromHubDirectoryColumnMeta(
  toHubDirectoryColumnMeta(STEALTH_PROFILE_COLUMN_META),
);

export type ProfileDirectoryColumnKey = (typeof STEALTH_PROFILE_COLUMN_KEYS)[number];

export const PROFILE_DIRECTORY_GOLDEN_ORDER = [...STEALTH_PROFILE_COLUMN_KEYS] as const;

export const PROFILE_DIRECTORY_COLUMN_ITEMS: DirectoryTableColumnItem<ProfileDirectoryColumnKey>[] =
  withDirectoryColumnLabelHints(
    withDirectoryColumnIcons(
      [
        { key: "profile", label: "Profile", required: true },
        { key: "group", label: "Group" },
        { key: "e0001", label: "Cookie Bridge" },
        { key: "surfshark", label: "Surfshark" },
        { key: "status", label: "Running" },
        { key: "updated", label: "Update" },
        { key: "createdAt", label: "Created" },
        { key: "startupUrl", label: "Startup URL" },
        { key: "proxy", label: "Proxy" },
        { key: "note", label: "Note" },
      ],
      PROFILE_COLUMN_PREF_ICONS,
    ),
    stealthProfileColumnHintContent,
  );

/** Default visible data columns + checkbox (includes Note). */
export const DEFAULT_PROFILE_DIRECTORY_COLUMNS = new Set<ProfileDirectoryColumnKey>([
  "profile",
  "group",
  "e0001",
  "surfshark",
  "status",
  "updated",
  "startupUrl",
  "proxy",
  "note",
]);

export const PROFILE_DIRECTORY_COLUMNS_CHANGE = "stealth-profile-directory-columns-change";

export const profileDirectoryColumnPrefs = createDirectoryTableColumnPrefs({
  storageKey: "p0003_profile_directory_columns",
  items: PROFILE_DIRECTORY_COLUMN_ITEMS,
  defaultKeys: DEFAULT_PROFILE_DIRECTORY_COLUMNS,
  changeEvent: PROFILE_DIRECTORY_COLUMNS_CHANGE,
});

export const profileDirectoryColumnPresetManager = createDirectoryTableColumnPresetManager({
  prefs: profileDirectoryColumnPrefs,
  presetsStorageKey: "p0003_profile_directory_column_presets",
  itemKeys: PROFILE_DIRECTORY_GOLDEN_ORDER,
  defaultVisible: DEFAULT_PROFILE_DIRECTORY_COLUMNS,
});

export const profileDirectoryColumnPresetsProp = asDirectoryTableColumnPresetManagerProp(
  profileDirectoryColumnPresetManager,
);

/** Visible columns in golden table order. */
export function readProfileDirectoryColumns(): ProfileDirectoryColumnKey[] {
  const visible = profileDirectoryColumnPrefs.read();
  const legacy = visible as Set<string>;
  if (legacy.has("action")) {
    legacy.delete("action");
    visible.add("status");
  }
  if (legacy.has("lastOpened")) {
    legacy.delete("lastOpened");
    visible.add("updated");
  }
  // One-shot promote Note for any prefs set that still hides it (custom Display included).
  // After promote, users may hide Note again via Display — we do not re-force.
  if (!visible.has("note") && !readNoteColumnPromotedFlag()) {
    visible.add("note");
    profileDirectoryColumnPrefs.write(visible);
    writeNoteColumnPromotedFlag();
  }
  return PROFILE_DIRECTORY_GOLDEN_ORDER.filter((key) => visible.has(key));
}

const NOTE_COLUMN_PROMOTED_KEY = "p0003_profile_note_column_promoted_v1";

function readNoteColumnPromotedFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem(NOTE_COLUMN_PROMOTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeNoteColumnPromotedFlag() {
  try {
    globalThis.localStorage?.setItem(NOTE_COLUMN_PROMOTED_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
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
