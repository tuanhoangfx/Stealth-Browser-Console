import {
  applyStandardDirectoryColumnHints,
  asDirectoryTableColumnPresetManagerProp,
  countHiddenDirectoryTableColumns,
  createDirectoryColumnMetaHelpers,
  createDirectoryFreezePrefs,
  createDirectoryTableColumnPrefs,
  createDirectoryTableColumnPresetManager,
  HUB_ACTIVITY_AGE_HINT_LINES,
  HUB_DIRECTORY_NOTE_COL_WIDTH,
  prefIconMapFromHubDirectoryColumnMeta,
  withDirectoryColumnIcons,
  withDirectoryColumnStickers,
  withSortPriorityHintLines,
  type DirectoryTableColumnItem,
  type HubDirectoryColumnHintLine,
} from "@tool-workspace/hub-ui";

export const STEALTH_ANDROID_COLUMN_KEYS = [
  "createdAt",
  "updated",
  "profile",
  "group",
  "autoSync",
  "status",
  "deviceModel",
  "gpu",
  "androidId",
  "imei",
  "cookies",
  "snapshot",
  "integrity",
  "note",
] as const;

export type StealthAndroidColumnKey = (typeof STEALTH_ANDROID_COLUMN_KEYS)[number];

const { col, toHubDirectoryColumnMeta: rawToHubDirectoryColumnMeta } = createDirectoryColumnMetaHelpers();

function toHubDirectoryColumnMeta(meta: Record<string, ReturnType<typeof col>>) {
  const mapped = rawToHubDirectoryColumnMeta(meta);
  for (const key of Object.keys(mapped)) {
    mapped[key] = { ...mapped[key]!, enableFit: mapped[key]!.enableFit ?? false };
  }
  return mapped;
}

const ANDROID_COLUMN_HINT_DESCRIPTIONS: Record<StealthAndroidColumnKey, string> = {
  createdAt: "When this Android antidetect profile was first created in the catalog.",
  updated: "Last Android profile activity, cookie sync, or snapshot update — relative under 24h.",
  profile: "Android profile ID (#0001–#0099) paired 1:1 with the PC browser profile.",
  group: "Hardware manufacturer brand (Google, Samsung, Xiaomi, OnePlus).",
  autoSync: "Automatically pushes updated PC cookies to Mobile Vault when the PC browser closes.",
  status: "Mount or switch connected Android phone hardware identity to this profile.",
  deviceModel: "Spoofed Android hardware model name.",
  gpu: "Spoofed WebGL / OpenGL ES hardware GPU renderer.",
  androidId: "Deterministic 16-hex Android_ID (hover to inspect GSF_ID, GAID, Serial, and Fingerprint).",
  imei: "Deterministic 15-digit mobile equipment identifier (IMEI).",
  cookies: "Number of synced session cookies available for this Android profile.",
  snapshot: "Encrypted app data snapshot (.tar.gz) status in Mobile Vault.",
  integrity: "Play Integrity attestation and Wireless ADB connection status.",
  note: "Synced services and custom operator note.",
};

const ANDROID_COLUMN_HINT_LINES: Partial<Record<StealthAndroidColumnKey, HubDirectoryColumnHintLine[]>> = {
  createdAt: HUB_ACTIVITY_AGE_HINT_LINES,
  updated: HUB_ACTIVITY_AGE_HINT_LINES,
  profile: withSortPriorityHintLines([
    { emoji: "📡", label: "Format", detail: "4-digit profile code (#0001–#0099) paired 1:1 with PC Stealth Browser." },
    { emoji: "🔍", label: "Hover", detail: "Inspect full device model, Android_ID, and IMEI." },
  ]),
  group: withSortPriorityHintLines([
    { emoji: "📱", label: "Google", detail: "Pixel hardware series." },
    { emoji: "📱", label: "Samsung", detail: "Galaxy S / Ultra hardware series." },
    { emoji: "📱", label: "Xiaomi / OnePlus", detail: "Flagship Android hardware profiles." },
  ]),
  autoSync: withSortPriorityHintLines([
    { emoji: "🟢", label: "ON", detail: "Closing the paired PC browser automatically pushes fresh cookies to Mobile Vault." },
    { emoji: "⚪", label: "OFF", detail: "Manual Push / Pull only." },
  ]),
  status: withSortPriorityHintLines([
    { emoji: "🟢", label: "Mounted", detail: "Active identity currently mounted on connected Android phone." },
    { emoji: "▶️", label: "Mount", detail: "Click to switch connected Android phone hardware identity to this profile." },
  ]),
  deviceModel: withSortPriorityHintLines([
    { emoji: "📱", label: "Model", detail: "Single hardware model name (e.g., Pixel 8 Pro, SM-S928B)." },
  ]),
  gpu: withSortPriorityHintLines([
    { emoji: "🎮", label: "GPU", detail: "Single WebGL / OpenGL ES GPU renderer string (e.g., Mali-G715, Adreno 750)." },
  ]),
  androidId: withSortPriorityHintLines([
    { emoji: "🆔", label: "Android_ID", detail: "16-character hexadecimal Android_ID." },
    { emoji: "🔍", label: "Hover", detail: "Inspect GSF_ID, GAID, Serial Number, and Build Fingerprint." },
  ]),
  imei: withSortPriorityHintLines([
    { emoji: "📟", label: "IMEI", detail: "15-digit Luhn-valid mobile equipment identifier." },
  ]),
  cookies: withSortPriorityHintLines([
    { emoji: "🍪", label: "N synced", detail: "Number of session cookies ready in Mobile Vault." },
    { emoji: "⚪", label: "0", detail: "No cookies synced yet; use Push Cookies in toolbar." },
  ]),
  snapshot: withSortPriorityHintLines([
    { emoji: "💾", label: "ON", detail: "Encrypted .tar.gz app data snapshot stored in Mobile Vault." },
    { emoji: "⚪", label: "OFF", detail: "No app data snapshot captured yet." },
  ]),
  integrity: withSortPriorityHintLines([
    { emoji: "🛡️", label: "ADB · STRONG", detail: "Connected phone online with Play Integrity STRONG attestation." },
    { emoji: "✅", label: "STRONG", detail: "Profile verified for Play Integrity STRONG in standby." },
  ]),
  note: withSortPriorityHintLines([
    { emoji: "✍️", label: "Services & Note", detail: "Synced web services (Google, Facebook, TikTok) and custom operator notes." },
  ]),
};

export const STEALTH_ANDROID_COLUMN_META = withDirectoryColumnStickers(
  applyStandardDirectoryColumnHints(
    {
      createdAt: col("Created", "hub-users-col--activity", "created", "col.directory.created", "6.25rem"),
      updated: col("Update", "hub-users-col--created", "updated", "col.directory.lastActive", "6.25rem"),
      profile: col("Profile", "hub-users-col--name", "browser", "col.directory.browser", "6.5rem", {
        columnKind: "compact",
        headerAlign: "center",
        enableFit: false,
      }),
      group: col("Brand", "hub-users-col--role", "role", "col.directory.groups", "6.5rem"),
      autoSync: col("Auto-Sync", "hub-users-col--metric-d", "tools", "col.directory.status", "7.25rem"),
      status: col("Phone", "hub-users-col--tools", "tools", "col.directory.status", "6.75rem"),
      deviceModel: col("Model", "hub-users-col--email", "name", "col.directory.username", "8.75rem"),
      gpu: col("GPU", "hub-users-col--display-name", "name", "col.directory.username", "8.75rem"),
      androidId: col("Android ID", "hub-users-col--metric-c", "id", "col.directory.username", "8.25rem"),
      imei: col("IMEI", "hub-users-col--metric-e", "id", "col.directory.username", "8.25rem"),
      cookies: col("Cookies", "hub-users-col--metric-a", "tools", "col.directory.status", "7rem"),
      snapshot: col("Snapshot", "hub-users-col--metric-b", "tools", "col.directory.status", "6.75rem"),
      integrity: col("Integrity", "hub-users-col--metric-f", "tools", "col.directory.status", "8.5rem"),
      note: col(
        "Services & Note",
        "hub-users-col--id",
        "notes",
        "col.directory.posts",
        HUB_DIRECTORY_NOTE_COL_WIDTH,
      ),
    },
    ANDROID_COLUMN_HINT_DESCRIPTIONS,
    ANDROID_COLUMN_HINT_LINES,
  ),
  {
    createdAt: "📅",
    updated: "🔄",
    profile: "📡",
    group: "📁",
    autoSync: "⚡",
    status: "▶️",
    deviceModel: "📱",
    gpu: "🎮",
    androidId: "🆔",
    imei: "📟",
    cookies: "🍪",
    snapshot: "💾",
    integrity: "🛡️",
    note: "✍️",
  },
);

export { toHubDirectoryColumnMeta };

const ANDROID_COLUMN_PREF_ICONS = prefIconMapFromHubDirectoryColumnMeta(
  toHubDirectoryColumnMeta(STEALTH_ANDROID_COLUMN_META),
);

export const ANDROID_DIRECTORY_GOLDEN_ORDER = [...STEALTH_ANDROID_COLUMN_KEYS] as const;

export const ANDROID_DIRECTORY_COLUMN_ITEMS: DirectoryTableColumnItem<StealthAndroidColumnKey>[] =
  withDirectoryColumnIcons(
    [
      { key: "createdAt", label: "Created" },
      { key: "updated", label: "Update" },
      { key: "profile", label: "Profile", required: true },
      { key: "group", label: "Brand" },
      { key: "autoSync", label: "Auto-Sync" },
      { key: "status", label: "Phone" },
      { key: "deviceModel", label: "Model" },
      { key: "gpu", label: "GPU" },
      { key: "androidId", label: "Android ID" },
      { key: "imei", label: "IMEI" },
      { key: "cookies", label: "Cookies" },
      { key: "snapshot", label: "Snapshot" },
      { key: "integrity", label: "Integrity" },
      { key: "note", label: "Services & Note" },
    ],
    ANDROID_COLUMN_PREF_ICONS,
  );

export const DEFAULT_ANDROID_DIRECTORY_COLUMNS = new Set<StealthAndroidColumnKey>([
  "createdAt",
  "updated",
  "profile",
  "group",
  "autoSync",
  "status",
  "deviceModel",
  "gpu",
  "androidId",
  "imei",
  "cookies",
  "snapshot",
  "integrity",
  "note",
]);

export const ANDROID_DIRECTORY_COLUMNS_CHANGE = "stealth-android-directory-columns-change";

export const androidDirectoryColumnPrefs = createDirectoryTableColumnPrefs({
  storageKey: "p0003_android_directory_columns",
  items: ANDROID_DIRECTORY_COLUMN_ITEMS,
  defaultKeys: DEFAULT_ANDROID_DIRECTORY_COLUMNS,
  changeEvent: ANDROID_DIRECTORY_COLUMNS_CHANGE,
});

export const androidDirectoryColumnPresetManager = createDirectoryTableColumnPresetManager({
  prefs: androidDirectoryColumnPrefs,
  presetsStorageKey: "p0003_android_directory_column_presets",
  itemKeys: ANDROID_DIRECTORY_GOLDEN_ORDER,
  defaultVisible: DEFAULT_ANDROID_DIRECTORY_COLUMNS,
});

export const androidDirectoryColumnPresetsProp = asDirectoryTableColumnPresetManagerProp(
  androidDirectoryColumnPresetManager,
);

/** Pin 3 leading columns (`Created`, `Update`, `Profile` + checkbox) when horizontally scrolling the Android directory table. */
export const androidDirectoryFreezePrefs = createDirectoryFreezePrefs({
  storageKey: "directory-freeze:p0003-android:v1",
  changeEvent: "directory-freeze-p0003-android-change",
  defaultCount: 3,
});

const ANDROID_CREATED_COLUMN_PROMOTED_KEY = "p0003_android_created_column_promoted_v1";

function readAndroidCreatedColumnPromotedFlag(): boolean {
  try {
    return globalThis.localStorage?.getItem(ANDROID_CREATED_COLUMN_PROMOTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeAndroidCreatedColumnPromotedFlag() {
  try {
    globalThis.localStorage?.setItem(ANDROID_CREATED_COLUMN_PROMOTED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function readAndroidDirectoryColumns(): StealthAndroidColumnKey[] {
  const visible = androidDirectoryColumnPrefs.read();
  if (!visible.has("createdAt") && !readAndroidCreatedColumnPromotedFlag()) {
    visible.add("createdAt");
    androidDirectoryColumnPrefs.write(visible);
    writeAndroidCreatedColumnPromotedFlag();
  }
  return ANDROID_DIRECTORY_GOLDEN_ORDER.filter((key) => visible.has(key));
}

export function countHiddenAndroidDirectoryColumns(): number {
  return countHiddenDirectoryTableColumns(ANDROID_DIRECTORY_COLUMN_ITEMS, androidDirectoryColumnPrefs.read());
}

export function resetAndroidDirectoryColumns() {
  androidDirectoryColumnPrefs.reset();
  androidDirectoryFreezePrefs.reset();
}
