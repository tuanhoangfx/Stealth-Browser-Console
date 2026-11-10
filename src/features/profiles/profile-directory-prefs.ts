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
        { key: "createdAt", label: "Created" },
        { key: "updated", label: "Update" },
        { key: "profile", label: "Profile", required: true },
        { key: "group", label: "Group" },
        { key: "e0001", label: "Cookie Bridge" },
        { key: "e0002", label: "Browser Operator" },
        { key: "surfshark", label: "Surfshark" },
        { key: "status", label: "Running" },
        { key: "activityLog", label: "Log" },
        { key: "startupUrl", label: "Startup URL" },
        { key: "proxy", label: "Proxy" },
        { key: "note", label: "Note" },
      ],
      PROFILE_COLUMN_PREF_ICONS,
    ),
    stealthProfileColumnHintContent,
  );

/** Default visible data columns + checkbox (includes Created, Update, Log, and Note). */
export const DEFAULT_PROFILE_DIRECTORY_COLUMNS = new Set<ProfileDirectoryColumnKey>([
  "createdAt",
  "updated",
  "profile",
  "group",
  "e0001",
  "e0002",
  "surfshark",
  "status",
  "activityLog",
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
  // One-shot promote E0002 beside E0001. After promote, Display may hide it again.
  if (!visible.has("e0002") && !readOperatorColumnPromotedFlag()) {
    visible.add("e0002");
    profileDirectoryColumnPrefs.write(visible);
    writeOperatorColumnPromotedFlag();
  }
  // One-shot promote Created beside Update at the leading edge.
  if (!visible.has("createdAt") && !readCreatedColumnPromotedFlag()) {
    visible.add("createdAt");
    profileDirectoryColumnPrefs.write(visible);
    writeCreatedColumnPromotedFlag();
  }
  // One-shot promote Log beside Run.
  if (!visible.has("activityLog") && !readActivityLogColumnPromotedFlag()) {
    visible.add("activityLog");
    profileDirectoryColumnPrefs.write(visible);
    writeActivityLogColumnPromotedFlag();
  }
  return PROFILE_DIRECTORY_GOLDEN_ORDER.filter((key) => visible.has(key));
}

const NOTE_COLUMN_PROMOTED_KEY = "p0003_profile_note_column_promoted_v1";
const OPERATOR_COLUMN_PROMOTED_KEY = "p0003_profile_e0002_column_promoted_v1";
const CREATED_COLUMN_PROMOTED_KEY = "p0003_profile_created_column_promoted_v1";
const ACTIVITY_LOG_COLUMN_PROMOTED_KEY = "p0003_profile_activity_log_column_promoted_v1";

function readActivityLogColumnPromotedFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem(ACTIVITY_LOG_COLUMN_PROMOTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeActivityLogColumnPromotedFlag() {
  try {
    globalThis.localStorage?.setItem(ACTIVITY_LOG_COLUMN_PROMOTED_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

function readCreatedColumnPromotedFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem(CREATED_COLUMN_PROMOTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCreatedColumnPromotedFlag() {
  try {
    globalThis.localStorage?.setItem(CREATED_COLUMN_PROMOTED_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

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

function readOperatorColumnPromotedFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem(OPERATOR_COLUMN_PROMOTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOperatorColumnPromotedFlag() {
  try {
    globalThis.localStorage?.setItem(OPERATOR_COLUMN_PROMOTED_KEY, "1");
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
