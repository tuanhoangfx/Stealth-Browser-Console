import {
  CheckCircle2,
  Loader2,
  Play,
  Square,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  colHint,
  HUB_ACTIVITY_AGE_HINT_LINES,
  type HubDirectoryColumnHintContent,
  type HubDirectoryColumnHintLine,
} from "@tool-workspace/hub-ui";
import type {
  StealthBackupColumnKey,
  StealthProfileColumnKey,
  StealthWorkflowPanelColumnKey,
  StealthWorkflowStoreColumnKey,
} from "./directory-column-keys";
import { PROFILE_STATUS_FILTER_OPTIONS } from "../features/profiles/profile-filters";
import { Cookie } from "lucide-react";
import { STEALTH_PROFILE_COLUMN_STICKER } from "./stealth-column-stickers";

const hintLine = (
  icon: LucideIcon,
  toneClass: string,
  label: string,
  detail: string,
): HubDirectoryColumnHintLine => ({ icon, toneClass, label, detail });

export const STEALTH_PROFILE_RUN_HINT_LINES: HubDirectoryColumnHintLine[] = [
  hintLine(Play, "text-emerald-400", "Run", "Profile is closed — open browser with startup URL"),
  hintLine(Square, "text-rose-400", "Stop", "Profile is running — close browser session"),
  hintLine(Loader2, "text-amber-300", "Opening", "Launch in progress — action disabled until ready"),
];

export const STEALTH_EXTENSION_ON_OFF_HINT_LINES: HubDirectoryColumnHintLine[] = [
  { emoji: "✅", label: "On", detail: "Extension active for this profile (respects global + bulk overrides)" },
  { emoji: "⭕", label: "Off", detail: "Extension disabled — per-profile or global off" },
];

export const STEALTH_PROFILE_STATUS_FILTER_HINT_LINES: HubDirectoryColumnHintLine[] =
  PROFILE_STATUS_FILTER_OPTIONS.map((opt) => ({
    emoji:
      opt.value === "closed"
        ? "✅"
        : opt.value === "opening"
          ? "🔄"
          : opt.value === "running"
            ? "▶️"
            : "⚠️",
    label: opt.label,
    detail:
      opt.value === "closed"
        ? "Browser closed — ready to Run"
        : opt.value === "opening"
          ? "Browser launch in progress"
          : opt.value === "running"
            ? "Browser session active"
            : "Last open or workflow failed",
  }));

export const STEALTH_RUN_HISTORY_STATUS_HINT_LINES: HubDirectoryColumnHintLine[] = [
  hintLine(CheckCircle2, "text-emerald-400/90", "Success", "Workflow finished without error"),
  hintLine(XCircle, "text-red-400/90", "Failed", "Run ended with error — check Console for details"),
  hintLine(Loader2, "text-amber-300/90", "Running", "Workflow still in progress"),
];

export const STEALTH_WORKFLOW_STORE_STATUS_HINT_LINES: HubDirectoryColumnHintLine[] = [
  { statusDot: "active", label: "Installed", detail: "Workflow package installed in this console" },
  { statusDot: "online", label: "Local", detail: "Authored or edited locally — not from remote store" },
  { statusDot: "idle", label: "Available", detail: "Listed in store — not installed yet" },
];

export const STEALTH_WORKFLOW_STORE_SOURCE_HINT_LINES: HubDirectoryColumnHintLine[] = [
  { emoji: "🗄️", label: "Supabase", detail: "Hosted workflow catalog from Supabase storage" },
  { emoji: "📁", label: "Drive", detail: "Static manifest from Google Drive or local JSON" },
];

const PROFILE_COLUMN_HINT_DESCRIPTIONS: Record<StealthProfileColumnKey, string> = {
  profile: "Browser profile display name — primary row identifier and Console log source.",
  group: "Folder group for filters, bulk actions, and directory organization.",
  status: "Launch or stop this profile's browser session from the directory row.",
  updated: "Last profile browser launch — relative under 24h.",
  createdAt: "When this profile row was first created in the catalog.",
  startupUrl: "URL loaded when Run is clicked — normalized on blur in forms.",
  proxy: "Outbound proxy string for this profile (optional).",
  note: "Internal free-text note — editable in Profile detail Note rail.",
  e0001: "Cookie Bridge (E0001) — per-profile override of the global extension toggle.",
  surfshark: "Surfshark VPN extension — per-profile override of the global toggle.",
};

const PROFILE_COLUMN_HINT_LINES: Partial<Record<StealthProfileColumnKey, HubDirectoryColumnHintLine[]>> = {
  status: STEALTH_PROFILE_RUN_HINT_LINES,
  updated: HUB_ACTIVITY_AGE_HINT_LINES,
  createdAt: HUB_ACTIVITY_AGE_HINT_LINES,
  e0001: STEALTH_EXTENSION_ON_OFF_HINT_LINES,
  surfshark: STEALTH_EXTENSION_ON_OFF_HINT_LINES,
};

const WORKFLOW_COLUMN_HINT_DESCRIPTIONS: Record<StealthWorkflowPanelColumnKey, string> = {
  platform: "Target site or app brand for this workflow script.",
  name: "Workflow display name from the local registry.",
  id: "Stable workflow identifier — used in Run History and Console.",
  steps: "Number of configured steps in the script.",
  created: "When the workflow was first added to the registry.",
  updated: "Last edit to workflow definition or metadata.",
  lastRun: "Most recent execution timestamp for this workflow.",
};

const WORKFLOW_COLUMN_HINT_LINES: Partial<Record<StealthWorkflowPanelColumnKey, HubDirectoryColumnHintLine[]>> = {
  created: HUB_ACTIVITY_AGE_HINT_LINES,
  updated: HUB_ACTIVITY_AGE_HINT_LINES,
  lastRun: HUB_ACTIVITY_AGE_HINT_LINES,
};

const WORKFLOW_STORE_COLUMN_HINT_DESCRIPTIONS: Record<StealthWorkflowStoreColumnKey, string> = {
  platform: "Target platform brand for the store listing.",
  name: "Published workflow title in the remote catalog.",
  version: "Semantic version of the store package.",
  group: "Store category or folder group.",
  status: "Install state — Local, Installed, or Available in catalog.",
  source: "Remote catalog origin — Supabase or Drive manifest.",
  updated: "Last publish or manifest update time.",
};

const WORKFLOW_STORE_COLUMN_HINT_LINES: Partial<Record<StealthWorkflowStoreColumnKey, HubDirectoryColumnHintLine[]>> = {
  status: STEALTH_WORKFLOW_STORE_STATUS_HINT_LINES,
  source: STEALTH_WORKFLOW_STORE_SOURCE_HINT_LINES,
  updated: HUB_ACTIVITY_AGE_HINT_LINES,
};

const BACKUP_COLUMN_HINT_DESCRIPTIONS: Record<StealthBackupColumnKey, string> = {
  profile: "Browser profile included in backup catalog.",
  group: "Profile group for backup filters.",
  updated: "Last successful backup timestamp for this profile.",
  dataSize: "On-disk profile data size after last backup.",
  folder: "Backup folder presence — whether data exists on disk.",
};

const BACKUP_COLUMN_HINT_LINES: Partial<Record<StealthBackupColumnKey, HubDirectoryColumnHintLine[]>> = {
  updated: HUB_ACTIVITY_AGE_HINT_LINES,
};

export type StealthFormFieldKey =
  | "name"
  | "group"
  | "startupUrl"
  | "proxyPreset"
  | "proxy"
  | "devicePreset"
  | "platform"
  | "colorScheme"
  | "timezone"
  | "locale"
  | "windowMode"
  | "viewport"
  | "fingerprintSeed"
  | "humanize"
  | "headless"
  | "userAgent"
  | "defaultStartupUrl";

const FORM_FIELD_LABELS: Record<StealthFormFieldKey, string> = {
  name: "Name",
  group: "Group",
  startupUrl: "Startup URL",
  proxyPreset: "Proxy preset",
  proxy: "Proxy (optional)",
  devicePreset: "Device preset",
  platform: "Operating system",
  colorScheme: "Color scheme",
  timezone: "Timezone",
  locale: "Locale",
  windowMode: "Window mode",
  viewport: "Viewport",
  fingerprintSeed: "Fingerprint seed",
  humanize: "Humanize",
  headless: "Headless",
  userAgent: "User-Agent",
  defaultStartupUrl: "Default startup URL",
};

const FORM_FIELD_HINT_DESCRIPTIONS: Record<StealthFormFieldKey, string> = {
  name: "Unique profile label — shown in directory and used as Console log source.",
  group: "Assign profile to a folder for filters and bulk operations.",
  startupUrl: "First URL loaded when Run opens this profile.",
  proxyPreset: "Quick-fill proxy from saved presets — edits custom proxy string.",
  proxy: "Full proxy URL — overrides preset when edited manually.",
  devicePreset: "Apply a bundled device fingerprint (OS, viewport, locale).",
  platform: "Spoofed operating system for navigator and UA hints.",
  colorScheme: "Preferred color scheme passed to the browser context.",
  timezone: "IANA timezone for Date and Intl APIs in the session.",
  locale: "BCP-47 locale for language and region hints.",
  windowMode: "Window visibility — normal, maximized, or preset viewport.",
  viewport: "Width × height when window mode uses preset viewport.",
  fingerprintSeed: "Numeric seed for deterministic canvas/WebGL noise.",
  humanize: "Add human-like delays and pointer noise to automation.",
  headless: "Run without visible window — easier for sites to detect.",
  userAgent: "Override default User-Agent string for this profile.",
  defaultStartupUrl: "Global default URL for new profiles and Run actions.",
};

export type StealthDisplayPrefScope = "profiles" | "workflow";

export type StealthDisplayPrefKey =
  | "total"
  | "running"
  | "failed"
  | "ready"
  | "selected"
  | "steps"
  | "group"
  | "status"
  | "platform";

const DISPLAY_PREF_LABELS: Record<StealthDisplayPrefKey, string> = {
  total: "Profiles",
  running: "Running",
  failed: "Failed",
  ready: "Ready",
  selected: "Selected",
  steps: "Steps",
  group: "Group",
  status: "Status",
  platform: "Platform",
};

const DISPLAY_PREF_DESCRIPTIONS: Record<`${StealthDisplayPrefScope}:${StealthDisplayPrefKey}`, string> = {
  "profiles:total": "Total profiles in catalog — all statuses.",
  "profiles:running": "Profiles with an active browser session.",
  "profiles:failed": "Profiles whose last open or workflow ended in error.",
  "profiles:ready": "Profiles closed and ready to Run.",
  "profiles:selected": "Profile rows selected for bulk actions.",
  "profiles:steps": "Step count for the active workflow on this profile.",
  "profiles:group": "Filter directory by profile folder group.",
  "profiles:status": "Filter by browser session state — Ready, Opening, Running, Failed.",
  "profiles:platform": "Filter profiles by spoofed platform brand.",
  "workflow:total": "Workflows visible in the current Scripts list.",
  "workflow:running": "Workflows with an active run in progress.",
  "workflow:failed": "Workflows whose last run ended in error.",
  "workflow:ready": "Workflows idle and ready to run.",
  "workflow:selected": "Workflow rows selected for bulk actions.",
  "workflow:steps": "Total steps across the active workflow editor.",
  "workflow:group": "Filter workflows by folder group.",
  "workflow:status": "Filter by workflow run state — Ready, Running, Failed.",
  "workflow:platform": "Filter workflows by target platform brand.",
};

function columnHintContent<T extends string>(
  key: T,
  title: string,
  descriptions: Partial<Record<T, string>>,
  lineDetails: Partial<Record<T, HubDirectoryColumnHintLine[]>>,
  extra?: Partial<HubDirectoryColumnHintContent>,
): HubDirectoryColumnHintContent {
  const description = descriptions[key] ?? `${title} shown in this directory table.`;
  const hint = colHint(title, description, lineDetails[key]);
  return extra ? { ...hint, ...extra } : hint;
}

const PROFILE_COLUMN_LABELS: Record<StealthProfileColumnKey, string> = {
  profile: "Profile",
  group: "Group",
  status: "Run",
  updated: "Update",
  createdAt: "Created",
  startupUrl: "Startup URL",
  proxy: "Proxy",
  note: "Note",
  e0001: "E0001",
  surfshark: "Surfshark",
};

export function stealthProfileColumnHintContent(
  key: StealthProfileColumnKey,
  title?: string,
): HubDirectoryColumnHintContent {
  const resolvedTitle = title ?? PROFILE_COLUMN_LABELS[key];
  return columnHintContent(key, resolvedTitle, PROFILE_COLUMN_HINT_DESCRIPTIONS, PROFILE_COLUMN_HINT_LINES, {
    ...(key === "profile"
      ? { titleGlyph: { emoji: STEALTH_PROFILE_COLUMN_STICKER.profile } }
      : key === "e0001"
      ? { titleGlyph: { icon: Cookie, toneClass: "text-orange-300" } }
      : key === "surfshark"
        ? { titleGlyph: { brandIcon: "surfshark" } }
        : {}),
  });
}

export function stealthWorkflowColumnHintContent(
  key: StealthWorkflowPanelColumnKey,
  title?: string,
): HubDirectoryColumnHintContent {
  const resolvedTitle = title ?? key;
  return columnHintContent(key, resolvedTitle, WORKFLOW_COLUMN_HINT_DESCRIPTIONS, WORKFLOW_COLUMN_HINT_LINES);
}

export function stealthWorkflowStoreColumnHintContent(
  key: StealthWorkflowStoreColumnKey,
  title?: string,
): HubDirectoryColumnHintContent {
  const resolvedTitle = title ?? key;
  return columnHintContent(
    key,
    resolvedTitle,
    WORKFLOW_STORE_COLUMN_HINT_DESCRIPTIONS,
    WORKFLOW_STORE_COLUMN_HINT_LINES,
  );
}

export function stealthBackupColumnHintContent(
  key: StealthBackupColumnKey,
  title?: string,
): HubDirectoryColumnHintContent {
  const resolvedTitle = title ?? key;
  return columnHintContent(key, resolvedTitle, BACKUP_COLUMN_HINT_DESCRIPTIONS, BACKUP_COLUMN_HINT_LINES);
}

/** Profile / device form labels — same popover SSOT as directory headers. */
export function stealthFormFieldHintContent(key: StealthFormFieldKey): HubDirectoryColumnHintContent {
  const title = FORM_FIELD_LABELS[key];
  return colHint(title, FORM_FIELD_HINT_DESCRIPTIONS[key]);
}

export function stealthDisplayPrefHintContent(
  key: StealthDisplayPrefKey,
  scope: StealthDisplayPrefScope,
  title?: string,
): HubDirectoryColumnHintContent {
  const label = title ?? DISPLAY_PREF_LABELS[key];
  const description =
    DISPLAY_PREF_DESCRIPTIONS[`${scope}:${key}`] ?? `${label} — display panel toggle.`;
  const lines =
    key === "status" && scope === "profiles" ? STEALTH_PROFILE_STATUS_FILTER_HINT_LINES : undefined;
  return colHint(label, description, lines);
}

export const STEALTH_RUN_HISTORY_HINT_CONTENT: HubDirectoryColumnHintContent = {
  ...colHint(
    "History",
    "Chronological workflow runs — click a row to replay logs in Console.",
    STEALTH_RUN_HISTORY_STATUS_HINT_LINES,
  ),
  optionsLabel: "Status",
};

/** Descriptions + lines for `applyStandardDirectoryColumnHints` in directory-column-meta. */
export const STEALTH_PROFILE_DIRECTORY_HINT_DESCRIPTIONS = PROFILE_COLUMN_HINT_DESCRIPTIONS;
export const STEALTH_PROFILE_DIRECTORY_HINT_LINES = PROFILE_COLUMN_HINT_LINES;
export const STEALTH_WORKFLOW_DIRECTORY_HINT_DESCRIPTIONS = WORKFLOW_COLUMN_HINT_DESCRIPTIONS;
export const STEALTH_WORKFLOW_DIRECTORY_HINT_LINES = WORKFLOW_COLUMN_HINT_LINES;
export const STEALTH_WORKFLOW_STORE_DIRECTORY_HINT_DESCRIPTIONS = WORKFLOW_STORE_COLUMN_HINT_DESCRIPTIONS;
export const STEALTH_WORKFLOW_STORE_DIRECTORY_HINT_LINES = WORKFLOW_STORE_COLUMN_HINT_LINES;
export const STEALTH_BACKUP_DIRECTORY_HINT_DESCRIPTIONS = BACKUP_COLUMN_HINT_DESCRIPTIONS;
export const STEALTH_BACKUP_DIRECTORY_HINT_LINES = BACKUP_COLUMN_HINT_LINES;
