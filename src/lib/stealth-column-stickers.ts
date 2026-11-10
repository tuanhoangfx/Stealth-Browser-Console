import type { PrefIconMap } from "@tool-workspace/hub-ui";
import type {
  StealthBackupColumnKey,
  StealthProfileColumnKey,
  StealthWorkflowPanelColumnKey,
  StealthWorkflowStoreColumnKey,
} from "./directory-column-keys";

/** P0003 sheet-parity stickers — directory table headers (emoji over Lucide).
 *  e0001 / e0002 / surfshark use real icons via `withExtensionColumnHeaderIcons` — no emoji stickers. */
export const STEALTH_PROFILE_COLUMN_STICKER = {
  profile: "📡",
  group: "📁",
  status: "▶️",
  activityLog: "📋",
  updated: "🔄",
  createdAt: "📅",
  startupUrl: "🔗",
  proxy: "🛡️",
  note: "✍️",
} as const satisfies Record<Exclude<StealthProfileColumnKey, "e0001" | "e0002" | "surfshark">, string>;

export const STEALTH_WORKFLOW_COLUMN_STICKER = {
  platform: "🌐",
  name: "📜",
  id: "🆔",
  steps: "📋",
  created: "📅",
  updated: "🔄",
  lastRun: "▶️",
  activityLog: "📋",
} as const satisfies Record<StealthWorkflowPanelColumnKey, string>;

export const STEALTH_WORKFLOW_STORE_COLUMN_STICKER = {
  created: "📅",
  updated: "🔄",
  platform: "🌐",
  name: "📜",
  version: "🏷️",
  group: "📁",
  status: "🚦",
  source: "📦",
  activityLog: "📋",
} as const satisfies Record<StealthWorkflowStoreColumnKey, string>;

export const STEALTH_BACKUP_COLUMN_STICKER = {
  createdAt: "📅",
  updated: "🔄",
  profile: "📡",
  group: "📁",
  status: "⚡",
  backupSlots: "🛡️",
  dataSize: "💾",
  cookies: "🍪",
  historyState: "📚",
  folder: "📂",
  activityLog: "📋",
} as const satisfies Record<StealthBackupColumnKey, string>;

export const STEALTH_PROFILE_KPI_STICKER = {
  total: "📡",
  create_today: "📅",
  create_week: "🗓️",
  update_today: "🔄",
  running: "▶️",
  headless: "👻",
  ready: "⏳",
  failed: "⚠️",
} as const;

export const STEALTH_PROFILE_FILTER_STICKER = {
  group: STEALTH_PROFILE_COLUMN_STICKER.group,
  status: STEALTH_PROFILE_COLUMN_STICKER.status,
  proxy: STEALTH_PROFILE_COLUMN_STICKER.proxy,
} as const;

export const STEALTH_PROFILE_HEADER_STAT_STICKER = {
  cpu: "⚡",
  ram: "💾",
} as const;

export const STEALTH_WORKFLOW_KPI_STICKER = {
  total: "📜",
  create_today: "📅",
  create_week: "🗓️",
  update_today: "🕒",
  ran_today: "▶️",
  with_steps: "⚡",
  idle: "💤",
  empty: "📭",
} as const;

export const STEALTH_WORKFLOW_STORE_KPI_STICKER = {
  total: "🛒",
  create_today: "📅",
  create_week: "🗓️",
  update_today: "🕒",
  local: "📝",
  installed: "✅",
  available: "📦",
  selected: "☑️",
} as const;

export const STEALTH_WORKFLOW_FILTER_STICKER = {
  group: "📁",
  platform: "🌐",
} as const;

export const STEALTH_WORKFLOW_HEADER_STAT_STICKER = {
  cpu: "⚡",
  ram: "💾",
} as const;

export const STEALTH_WORKFLOW_STORE_FILTER_STICKER = {
  group: "📁",
  platform: "🌐",
  source: "📦",
} as const;

export const STEALTH_EXTENSIONS_KPI_STICKER = {
  cached: "🧩",
  create_today: "📅",
  create_week: "🗓️",
  update_today: "🔄",
  store: "🛒",
  local: "🛠️",
  staged: "✅",
  pinned: "📌",
} as const;

export const STEALTH_EXTENSIONS_HEADER_STAT_STICKER = {
  cpu: "⚡",
  ram: "💾",
} as const;

export const STEALTH_EXTENSIONS_FILTER_STICKER = {
  kind: "🧩",
} as const;

export function stealthFilterSticker(
  key: string,
  scope: "profiles" | "workflow" | "workflow-store" | "system-extensions",
): string | undefined {
  if (scope === "profiles") return STEALTH_PROFILE_FILTER_STICKER[key as keyof typeof STEALTH_PROFILE_FILTER_STICKER];
  if (scope === "workflow") return STEALTH_WORKFLOW_FILTER_STICKER[key as keyof typeof STEALTH_WORKFLOW_FILTER_STICKER];
  if (scope === "system-extensions") {
    return STEALTH_EXTENSIONS_FILTER_STICKER[key as keyof typeof STEALTH_EXTENSIONS_FILTER_STICKER];
  }
  return STEALTH_WORKFLOW_STORE_FILTER_STICKER[key as keyof typeof STEALTH_WORKFLOW_STORE_FILTER_STICKER];
}

export function stealthPrefIconMap(stickers: Record<string, string>): PrefIconMap {
  return Object.fromEntries(Object.entries(stickers).map(([key, emoji]) => [key, { emoji }]));
}
