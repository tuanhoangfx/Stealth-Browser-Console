import {
  createDirectoryColumnMetaHelpers,
  resolveSemanticIcon,
  type SemanticIconLookupKey,
} from "@tool-workspace/hub-ui";

const { col, toHubDirectoryColumnMeta } = createDirectoryColumnMetaHelpers();

export { toHubDirectoryColumnMeta };
export type { DirectoryColumnHeaderMeta } from "@tool-workspace/hub-ui";

/** Stealth profile directory — hub-users-table--directory-6 */
export const STEALTH_PROFILE_COLUMN_META = {
  profile: col("Profile", "hub-users-col--name", "name", "col.directory.account", "22%"),
  group: col("Group", "hub-users-col--role", "role", "col.directory.groups", "4.5rem"),
  status: col("Run", "hub-users-col--tools", "tools", "col.directory.status", "4.5rem"),
  lastOpened: col("Last opened", "hub-users-col--created", "created", "col.directory.lastActive", "5.5rem"),
  createdAt: col("Created", "hub-users-col--activity", "activity", "col.directory.created", "5.5rem"),
  startupUrl: col("Startup URL", "hub-users-col--email", "email", "col.directory.username", "18%"),
  proxy: col("Proxy", "hub-users-col--metric-a", "name", "col.directory.username", "12%"),
  note: col("Note", "hub-users-col--id", "id", "col.directory.posts", "3.5rem"),
};

export const STEALTH_PROFILE_COLUMN_KEYS = [
  "profile",
  "group",
  "status",
  "lastOpened",
  "createdAt",
  "startupUrl",
  "proxy",
  "note",
] as const;

export type StealthProfileColumnKey = (typeof STEALTH_PROFILE_COLUMN_KEYS)[number];

/** WorkflowDirectoryPanel (Scripts left pane) — 6 cols, hub-users-table--directory-6 */
export const STEALTH_WORKFLOW_PANEL_COLUMN_META = {
  platform: col("Platform", "hub-users-col--email", "email", "col.directory.category", "20%"),
  name: col("Name", "hub-users-col--name", "name", "col.directory.account", "30%"),
  id: col("ID", "hub-users-col--id", "id", "col.directory.pageId", "16%"),
  steps: col("Steps", "hub-users-col--tools", "tools", "col.directory.posts", "3.75rem"),
  created: col("Created", "hub-users-col--created", "created", "col.directory.created", "7.5rem"),
  updated: col("Updated", "hub-users-col--activity", "activity", "col.directory.lastActive", "7.5rem"),
};

export const STEALTH_WORKFLOW_PANEL_COLUMN_KEYS = ["platform", "name", "id", "steps", "created", "updated"] as const;

/** WorkflowPickerRail — same 6-col SSOT; default visible: Platform · Name · ID · Steps. */
export const STEALTH_WORKFLOW_RAIL_COLUMN_META = STEALTH_WORKFLOW_PANEL_COLUMN_META;
export const STEALTH_WORKFLOW_RAIL_COLUMN_KEYS = STEALTH_WORKFLOW_PANEL_COLUMN_KEYS;

export type StealthWorkflowRailColumnKey = (typeof STEALTH_WORKFLOW_RAIL_COLUMN_KEYS)[number];
export type StealthWorkflowPanelColumnKey = (typeof STEALTH_WORKFLOW_PANEL_COLUMN_KEYS)[number];
export type StealthWorkflowColumnKey = StealthWorkflowRailColumnKey | StealthWorkflowPanelColumnKey;

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
