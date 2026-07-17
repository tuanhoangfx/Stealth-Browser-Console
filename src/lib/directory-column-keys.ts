/** Directory column keys — shared by meta + hint SSOT (avoids circular imports). */
export const STEALTH_PROFILE_COLUMN_KEYS = [
  "profile",
  "group",
  "status",
  "updated",
  "createdAt",
  "startupUrl",
  "proxy",
  "note",
  "e0001",
  "surfshark",
] as const;

export type StealthProfileColumnKey = (typeof STEALTH_PROFILE_COLUMN_KEYS)[number];

export const STEALTH_WORKFLOW_PANEL_COLUMN_KEYS = [
  "platform",
  "name",
  "id",
  "steps",
  "created",
  "updated",
  "lastRun",
] as const;

export type StealthWorkflowPanelColumnKey = (typeof STEALTH_WORKFLOW_PANEL_COLUMN_KEYS)[number];

export const STEALTH_WORKFLOW_RAIL_COLUMN_KEYS = STEALTH_WORKFLOW_PANEL_COLUMN_KEYS;
export type StealthWorkflowRailColumnKey = StealthWorkflowPanelColumnKey;
export type StealthWorkflowColumnKey = StealthWorkflowRailColumnKey | StealthWorkflowPanelColumnKey;

export const STEALTH_WORKFLOW_STORE_COLUMN_KEYS = [
  "platform",
  "name",
  "version",
  "group",
  "status",
  "source",
  "updated",
] as const;

export type StealthWorkflowStoreColumnKey = (typeof STEALTH_WORKFLOW_STORE_COLUMN_KEYS)[number];

export const STEALTH_BACKUP_COLUMN_KEYS = [
  "profile",
  "group",
  "updated",
  "dataSize",
  "folder",
] as const;

export type StealthBackupColumnKey = (typeof STEALTH_BACKUP_COLUMN_KEYS)[number];

export const STEALTH_EXTENSIONS_COLUMN_KEYS = [
  "extension",
  "kind",
  "version",
  "storeId",
  "updated",
  "path",
] as const;

export type StealthExtensionsColumnKey = (typeof STEALTH_EXTENSIONS_COLUMN_KEYS)[number];
