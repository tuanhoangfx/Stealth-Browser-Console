import type { DirectoryColumnHeaderMeta } from "@tool-workspace/hub-ui";
import {
  applyStandardDirectoryColumnHints,
  createDirectoryColumnMetaHelpers,
  HUB_DIRECTORY_NOTE_COL_WIDTH,
  resolveSemanticIcon,
  withDirectoryColumnStickers,
  type SemanticIconLookupKey,
} from "@tool-workspace/hub-ui";
import { Cable, Cookie } from "lucide-react";
import { DEFAULT_EXTENSION_ICONS } from "./default-extension-icons";
import {
  STEALTH_BACKUP_DIRECTORY_HINT_DESCRIPTIONS,
  STEALTH_BACKUP_DIRECTORY_HINT_LINES,
  STEALTH_PROFILE_DIRECTORY_HINT_DESCRIPTIONS,
  STEALTH_PROFILE_DIRECTORY_HINT_LINES,
  STEALTH_WORKFLOW_DIRECTORY_HINT_DESCRIPTIONS,
  STEALTH_WORKFLOW_DIRECTORY_HINT_LINES,
  STEALTH_WORKFLOW_STORE_DIRECTORY_HINT_DESCRIPTIONS,
  STEALTH_WORKFLOW_STORE_DIRECTORY_HINT_LINES,
} from "./stealth-directory-column-hints";
import {
  STEALTH_BACKUP_COLUMN_KEYS,
  STEALTH_PROFILE_COLUMN_KEYS,
  STEALTH_WORKFLOW_PANEL_COLUMN_KEYS,
  STEALTH_WORKFLOW_RAIL_COLUMN_KEYS,
  STEALTH_WORKFLOW_STORE_COLUMN_KEYS,
  type StealthBackupColumnKey,
  type StealthProfileColumnKey,
  type StealthWorkflowPanelColumnKey,
  type StealthWorkflowRailColumnKey,
  STEALTH_EXTENSIONS_COLUMN_KEYS,
  type StealthExtensionsColumnKey,
} from "./directory-column-keys";
import {
  STEALTH_BACKUP_COLUMN_STICKER,
  STEALTH_PROFILE_COLUMN_STICKER,
  STEALTH_WORKFLOW_COLUMN_STICKER,
  STEALTH_WORKFLOW_STORE_COLUMN_STICKER,
} from "./stealth-column-stickers";

export {
  STEALTH_PROFILE_COLUMN_KEYS,
  STEALTH_WORKFLOW_PANEL_COLUMN_KEYS,
  STEALTH_WORKFLOW_RAIL_COLUMN_KEYS,
  STEALTH_WORKFLOW_STORE_COLUMN_KEYS,
  STEALTH_BACKUP_COLUMN_KEYS,
  STEALTH_EXTENSIONS_COLUMN_KEYS,
  type StealthProfileColumnKey,
  type StealthWorkflowPanelColumnKey,
  type StealthWorkflowRailColumnKey,
  type StealthWorkflowColumnKey,
  type StealthWorkflowStoreColumnKey,
  type StealthBackupColumnKey,
  type StealthExtensionsColumnKey,
} from "./directory-column-keys";

const { col, toHubDirectoryColumnMeta: rawToHubDirectoryColumnMeta } = createDirectoryColumnMetaHelpers();

function toHubDirectoryColumnMeta(meta: Record<string, DirectoryColumnHeaderMeta>) {
  const mapped = rawToHubDirectoryColumnMeta(meta);
  for (const key of Object.keys(mapped)) {
    mapped[key] = { ...mapped[key]!, enableFit: mapped[key]!.enableFit ?? false };
  }
  return mapped;
}

/** Extension columns — real extension / brand icons (not sheet emoji stickers). */
function withExtensionColumnHeaderIcons<M extends Record<string, DirectoryColumnHeaderMeta>>(
  meta: M,
): M {
  return {
    ...meta,
    e0001: {
      ...meta.e0001,
      headerEmoji: undefined,
      headerBrandIcon: undefined,
      headerImageSrc: DEFAULT_EXTENSION_ICONS.e0001,
      headerIcon: Cookie,
      headerIconClassName: "text-orange-300",
    },
    e0002: {
      ...meta.e0002,
      headerEmoji: undefined,
      headerBrandIcon: undefined,
      headerImageSrc: DEFAULT_EXTENSION_ICONS.e0002,
      headerIcon: Cable,
      headerIconClassName: "text-violet-300",
    },
    surfshark: {
      ...meta.surfshark,
      headerEmoji: undefined,
      headerBrandIcon: undefined,
      headerImageSrc: DEFAULT_EXTENSION_ICONS.surfshark,
    },
  };
}

export { toHubDirectoryColumnMeta };
export type { DirectoryColumnHeaderMeta } from "@tool-workspace/hub-ui";

/** Stealth profile directory — hub-users-table--directory-6 */
export const STEALTH_PROFILE_COLUMN_META = withExtensionColumnHeaderIcons(
  withDirectoryColumnStickers(
    applyStandardDirectoryColumnHints(
    {
    profile: col("Profile", "hub-users-col--name", "browser", "col.directory.browser", "6.5rem", {
      columnKind: "compact",
      headerAlign: "center",
      enableFit: false,
    }),
    group: col("Group", "hub-users-col--role", "role", "col.directory.groups", "5.5rem"),
    status: col("Run", "hub-users-col--tools", "tools", "col.directory.status", "5.5rem"),
    activityLog: col("Log", "hub-users-col--id", "notes", "col.directory.posts", "14rem"),
    updated: col("Update", "hub-users-col--created", "updated", "col.directory.lastActive", "5.75rem"),
    createdAt: col("Created", "hub-users-col--activity", "created", "col.directory.created", "6.25rem"),
    startupUrl: col("Startup URL", "hub-users-col--email", "email", "col.directory.username", "8.5rem", {
      enableFit: false,
    }),
    proxy: col("Proxy", "hub-users-col--metric-c", "name", "col.directory.username", "12rem"),
    note: col("Note", "hub-users-col--metric-e", "notes", "col.directory.posts", HUB_DIRECTORY_NOTE_COL_WIDTH),
    e0001: col("E0001", "hub-users-col--metric-a", "tools", "col.directory.status", "4.75rem"),
    e0002: col("E0002", "hub-users-col--metric-d", "tools", "col.directory.status", "4.75rem"),
    surfshark: col("Surfshark", "hub-users-col--metric-b", "tools", "col.directory.status", "5.75rem"),
    },
    STEALTH_PROFILE_DIRECTORY_HINT_DESCRIPTIONS,
    STEALTH_PROFILE_DIRECTORY_HINT_LINES,
    ),
    STEALTH_PROFILE_COLUMN_STICKER,
  ),
);

/** WorkflowDirectoryPanel (Scripts left pane) — hub-users-table--directory-6 */
export const STEALTH_WORKFLOW_PANEL_COLUMN_META = withDirectoryColumnStickers(
  applyStandardDirectoryColumnHints(
  {
  platform: col("Platform", "hub-users-col--email", "email", "col.directory.category", "10rem"),
  name: col("Name", "hub-users-col--name", "name", "col.directory.account", "16rem"),
  id: col("ID", "hub-users-col--id", "id", "col.directory.pageId", "10rem"),
  steps: col("Steps", "hub-users-col--tools", "tools", "col.directory.posts", "3.75rem"),
  created: col("Created", "hub-users-col--created", "created", "col.directory.created", "7.5rem"),
  updated: col("Update", "hub-users-col--activity", "updated", "col.directory.lastActive", "7.5rem"),
  lastRun: col("Last Run", "hub-users-col--metric-b", "activity", "col.directory.lastActive", "6.5rem"),
  activityLog: col("Log", "hub-users-col--metric-e", "notes", "col.directory.posts", "14rem"),
  },
  STEALTH_WORKFLOW_DIRECTORY_HINT_DESCRIPTIONS,
  STEALTH_WORKFLOW_DIRECTORY_HINT_LINES,
  ),
  STEALTH_WORKFLOW_COLUMN_STICKER,
);

/** WorkflowPickerRail — same SSOT; default visible: Platform · Name · ID · Steps. */
export const STEALTH_WORKFLOW_RAIL_COLUMN_META = STEALTH_WORKFLOW_PANEL_COLUMN_META;

/** Workflow Store directory — hub-users-table--directory-6 (P0004 golden parity). */
export const STEALTH_WORKFLOW_STORE_COLUMN_META = withDirectoryColumnStickers(
  applyStandardDirectoryColumnHints(
  {
  created: col("Created", "hub-users-col--created", "created", "col.directory.created", "7.5rem"),
  updated: col("Update", "hub-users-col--activity", "updated", "col.directory.lastActive", "7.5rem"),
  platform: col("Platform", "hub-users-col--email", "email", "col.directory.category", "10rem"),
  name: col("Name", "hub-users-col--name", "name", "col.directory.account", "16rem"),
  version: col("Version", "hub-users-col--id", "id", "col.directory.pageId", "5rem"),
  group: col("Group", "hub-users-col--role", "role", "col.directory.groups", "7rem"),
  status: col("Status", "hub-users-col--tools", "tools", "col.directory.status", "5.5rem"),
  source: col("Source", "hub-users-col--metric-a", "tools", "col.directory.status", "5rem"),
  activityLog: col("Log", "hub-users-col--metric-e", "notes", "col.directory.posts", "14rem"),
  },
  STEALTH_WORKFLOW_STORE_DIRECTORY_HINT_DESCRIPTIONS,
  STEALTH_WORKFLOW_STORE_DIRECTORY_HINT_LINES,
  ),
  STEALTH_WORKFLOW_STORE_COLUMN_STICKER,
);

export function profileStatusSemanticKey(status: string): SemanticIconLookupKey {
  switch (status) {
    case "closed":
      return "profile.status.ready";
    case "opening":
      return "profile.status.opening";
    case "running":
      return "profile.status.running";
    case "failed":
      return "profile.status.failed";
    default:
      return "profile.status.ready";
  }
}

export function profileProxySemanticKey(isLocal: boolean): SemanticIconLookupKey {
  return isLocal ? "profile.proxy.local" : "profile.proxy.remote";
}

export function resolveProfileCellIcon(key: SemanticIconLookupKey) {
  const { icon, className } = resolveSemanticIcon(key);
  return { icon, className };
}

/** System → Backup directory — hub-users-table--directory-6 (status/progress → rail console). */
export const STEALTH_BACKUP_COLUMN_META = withDirectoryColumnStickers(
  applyStandardDirectoryColumnHints(
  {
  createdAt: col("Created", "hub-users-col--activity", "created", "col.directory.created", "6.5rem"),
  updated: col("Update", "hub-users-col--created", "updated", "col.directory.lastActive", "6.5rem"),
  profile: col("Profile", "hub-users-col--name", "browser", "col.directory.browser", "6.5rem", {
    columnKind: "compact",
    headerAlign: "center",
    enableFit: false,
  }),
  group: col("Group", "hub-users-col--role", "role", "col.directory.groups", "5.75rem"),
  status: col("Backup", "hub-users-col--tools", "tools", "col.directory.status", "9.5rem"),
  backupSlots: col("Slots", "hub-users-col--id", "tools", "col.directory.status", "8rem"),
  dataSize: col("Data", "hub-users-col--metric-a", "name", "col.directory.posts", "9.75rem"),
  cookies: col("Cookies", "hub-users-col--email", "name", "col.directory.account", "9.5rem"),
  historyState: col("History", "hub-users-col--metric-b", "name", "col.directory.posts", "8.5rem"),
  folder: col("Folder", "hub-users-col--metric-d", "tools", "col.directory.status", "5.75rem"),
  activityLog: col("Log", "hub-users-col--metric-e", "notes", "col.directory.posts", "14rem"),
  },
  STEALTH_BACKUP_DIRECTORY_HINT_DESCRIPTIONS,
  STEALTH_BACKUP_DIRECTORY_HINT_LINES,
  ),
  STEALTH_BACKUP_COLUMN_STICKER,
);

export const STEALTH_EXTENSIONS_COLUMN_META = withDirectoryColumnStickers(
  applyStandardDirectoryColumnHints(
    {
      createdAt: col("Created", "hub-users-col--created", "created", "col.directory.created", "7.5rem"),
      updated: col("Update", "hub-users-col--activity", "updated", "col.directory.lastActive", "7.5rem"),
      extension: col("Extension", "hub-users-col--name", "name", "col.directory.account", "16rem"),
      kind: col("Kind", "hub-users-col--role", "role", "col.directory.groups", "4.5rem"),
      version: col("Version", "hub-users-col--id", "id", "col.directory.pageId", "5rem"),
      storeId: col("Store ID", "hub-users-col--email", "email", "col.directory.username", "12rem"),
      path: col("Path", "hub-users-col--metric-c", "name", "col.directory.posts", "14rem"),
      activityLog: col("Log", "hub-users-col--metric-e", "notes", "col.directory.posts", "14rem"),
    },
    {
      createdAt: "When this extension folder was first created or installed on disk.",
      updated: "When this cache folder was last written on disk — not the Chrome Web Store release date.",
      extension: "Extension name from manifest.",
      kind: "Chrome Web Store cache or local operator.",
      version: "Manifest version string.",
      storeId: "Chrome Web Store ID or local key.",
      path: "Unpacked extension folder on disk.",
      activityLog: "Latest stage, auto-pin, and live hot-reload status for this extension.",
    },
    {},
  ),
  { createdAt: "📅", updated: "🔄", activityLog: "📋" },
);
