import type { DirectoryColumnHeaderMeta } from "@tool-workspace/hub-ui";
import {
  applyStandardDirectoryColumnHints,
  createDirectoryColumnMetaHelpers,
  resolveSemanticIcon,
  withDirectoryColumnStickers,
  type SemanticIconLookupKey,
} from "@tool-workspace/hub-ui";
import { Cookie } from "lucide-react";
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

const { col, toHubDirectoryColumnMeta } = createDirectoryColumnMetaHelpers();

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
      headerIcon: Cookie,
      headerIconClassName: "text-orange-300",
    },
    surfshark: {
      ...meta.surfshark,
      headerEmoji: undefined,
      headerBrandIcon: "surfshark",
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
    profile: col("Profile", "hub-users-col--name", "name", "col.directory.browser", "20%"),
    group: col("Group", "hub-users-col--role", "role", "col.directory.groups", "4.5rem"),
    status: col("Run", "hub-users-col--tools", "tools", "col.directory.status", "4.5rem"),
    updated: col("Update", "hub-users-col--created", "created", "col.directory.lastActive", "5.5rem"),
    createdAt: col("Created", "hub-users-col--activity", "activity", "col.directory.created", "5.5rem"),
    startupUrl: col("Startup URL", "hub-users-col--email", "email", "col.directory.username", "18%"),
    proxy: col("Proxy", "hub-users-col--metric-c", "name", "col.directory.username", "12%"),
    note: col("Note", "hub-users-col--id", "id", "col.directory.posts", "12%"),
    e0001: col("E0001", "hub-users-col--metric-a", "tools", "col.directory.status", "3.25rem"),
    surfshark: col("Surfshark", "hub-users-col--metric-b", "tools", "col.directory.status", "3.75rem"),
    },
    STEALTH_PROFILE_DIRECTORY_HINT_DESCRIPTIONS,
    STEALTH_PROFILE_DIRECTORY_HINT_LINES,
    ),
    STEALTH_PROFILE_COLUMN_STICKER,
  ),
);

/** WorkflowDirectoryPanel (Scripts left pane) — 6 cols, hub-users-table--directory-6 */
export const STEALTH_WORKFLOW_PANEL_COLUMN_META = withDirectoryColumnStickers(
  applyStandardDirectoryColumnHints(
  {
  platform: col("Platform", "hub-users-col--email", "email", "col.directory.category", "20%"),
  name: col("Name", "hub-users-col--name", "name", "col.directory.account", "30%"),
  id: col("ID", "hub-users-col--id", "id", "col.directory.pageId", "16%"),
  steps: col("Steps", "hub-users-col--tools", "tools", "col.directory.posts", "3.75rem"),
  created: col("Created", "hub-users-col--created", "created", "col.directory.created", "6.5rem"),
  updated: col("Update", "hub-users-col--activity", "updated", "col.directory.lastActive", "6.5rem"),
  lastRun: col("Last Run", "hub-users-col--metric-b", "activity", "col.directory.lastActive", "6.5rem"),
  },
  STEALTH_WORKFLOW_DIRECTORY_HINT_DESCRIPTIONS,
  STEALTH_WORKFLOW_DIRECTORY_HINT_LINES,
  ),
  STEALTH_WORKFLOW_COLUMN_STICKER,
);

/** WorkflowPickerRail — same 6-col SSOT; default visible: Platform · Name · ID · Steps. */
export const STEALTH_WORKFLOW_RAIL_COLUMN_META = STEALTH_WORKFLOW_PANEL_COLUMN_META;

/** Workflow Store directory — hub-users-table--directory-6 (P0004 golden parity). */
export const STEALTH_WORKFLOW_STORE_COLUMN_META = withDirectoryColumnStickers(
  applyStandardDirectoryColumnHints(
  {
  platform: col("Platform", "hub-users-col--email", "email", "col.directory.category", "16%"),
  name: col("Name", "hub-users-col--name", "name", "col.directory.account", "26%"),
  version: col("Version", "hub-users-col--id", "id", "col.directory.pageId", "5rem"),
  group: col("Group", "hub-users-col--role", "role", "col.directory.groups", "7rem"),
  status: col("Status", "hub-users-col--tools", "tools", "col.directory.status", "5.5rem"),
  source: col("Source", "hub-users-col--metric-a", "tools", "col.directory.status", "5rem"),
  updated: col("Update", "hub-users-col--activity", "updated", "col.directory.lastActive", "7rem"),
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
  profile: col("Profile", "hub-users-col--name", "name", "col.directory.browser", "24%"),
  group: col("Group", "hub-users-col--role", "role", "col.directory.groups", "5.5rem"),
  updated: col("Update", "hub-users-col--created", "created", "col.directory.lastActive", "6.5rem"),
  dataSize: col("Data size", "hub-users-col--metric-a", "name", "col.directory.posts", "6rem"),
  folder: col("Folder", "hub-users-col--tools", "tools", "col.directory.status", "4.5rem"),
  },
  STEALTH_BACKUP_DIRECTORY_HINT_DESCRIPTIONS,
  STEALTH_BACKUP_DIRECTORY_HINT_LINES,
  ),
  STEALTH_BACKUP_COLUMN_STICKER,
);

export const STEALTH_EXTENSIONS_COLUMN_META = withDirectoryColumnStickers(
  applyStandardDirectoryColumnHints(
    {
      extension: col("Extension", "hub-users-col--name", "name", "col.directory.account", "26%"),
      kind: col("Kind", "hub-users-col--role", "role", "col.directory.groups", "4.5rem"),
      version: col("Version", "hub-users-col--id", "id", "col.directory.pageId", "5rem"),
      storeId: col("Store ID", "hub-users-col--email", "email", "col.directory.username", "14%"),
      updated: col("Update", "hub-users-col--activity", "updated", "col.directory.lastActive", "6.5rem"),
      path: col("Path", "hub-users-col--metric-c", "name", "col.directory.posts", "18%"),
    },
    {
      extension: "Extension name from manifest.",
      kind: "Store cache or local unpacked folder.",
      version: "Manifest version string.",
      storeId: "Chrome Web Store ID or local key.",
      updated: "Last manifest or cache update time.",
      path: "Unpacked extension folder on disk.",
    },
    {},
  ),
  { updated: "🕒" },
);
