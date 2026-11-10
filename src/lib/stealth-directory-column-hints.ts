import {
  colHint,
  HUB_ACTIVITY_AGE_HINT_LINES,
  hubDirectoryRunToggleHintLines,
  type HubDirectoryColumnHintContent,
  type HubDirectoryColumnHintLine,
} from "@tool-workspace/hub-ui";
import type {
  StealthBackupColumnKey,
  StealthProfileColumnKey,
  StealthWorkflowPanelColumnKey,
  StealthWorkflowStoreColumnKey,
} from "./directory-column-keys";
import {
  PROFILE_PROXY_FILTER_OPTIONS,
  PROFILE_STATUS_FILTER_OPTIONS,
} from "../features/profiles/profile-filters";
import { Cable, Cookie } from "lucide-react";
import { STEALTH_PROFILE_COLUMN_STICKER } from "./stealth-column-stickers";

export const STEALTH_PROFILE_RUN_HINT_LINES: HubDirectoryColumnHintLine[] = hubDirectoryRunToggleHintLines({
  startLabel: "Run",
  start: "Profile is closed — open browser with startup URL",
  stop: "Profile is running — close browser session",
  pendingLabel: "Opening",
  pending: "Launch in progress — action disabled until ready",
});

export const STEALTH_EXTENSION_ON_OFF_HINT_LINES: HubDirectoryColumnHintLine[] = [
  { emoji: "✅", label: "On", detail: "Extension active for this profile (respects global + bulk overrides)" },
  { emoji: "⭕", label: "Off", detail: "Extension disabled — per-profile or global off" },
];

export const STEALTH_PROFILE_STATUS_FILTER_HINT_LINES: HubDirectoryColumnHintLine[] =
  PROFILE_STATUS_FILTER_OPTIONS.map((opt) => ({
    emoji: opt.emoji,
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

export const STEALTH_PROFILE_PROXY_FILTER_HINT_LINES: HubDirectoryColumnHintLine[] =
  PROFILE_PROXY_FILTER_OPTIONS.map((opt) => ({
    emoji: opt.emoji,
    label: opt.label,
    detail:
      opt.value === "local"
        ? "Direct host connection (no saved proxy)"
        : opt.value === "vpn"
          ? "Multi-Country VPN tunnel (vpn://CC)"
          : opt.value === "auto_vpn"
            ? "Running session with auto-resolved country tunnel"
            : opt.value === "custom"
              ? "Custom HTTP/SOCKS5 proxy URL"
              : "Static IP pinned — proxy does not reset to Local IP on close",
  }));

export const STEALTH_RUN_HISTORY_STATUS_HINT_LINES: HubDirectoryColumnHintLine[] = [
  { emoji: "✅", label: "Success", detail: "Workflow or browser session finished without error" },
  { emoji: "❌", label: "Failed", detail: "Run ended with error — check Log for details" },
  { emoji: "⏳", label: "Running", detail: "Workflow or browser launch still in progress" },
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
  activityLog: "Live in-memory step log & recent 5-step activity history (zero-lag RAM cache).",
  updated: "Last profile browser launch — relative under 24h.",
  createdAt: "When this profile row was first created in the catalog.",
  startupUrl: "URL loaded when Run is clicked — normalized on blur in forms.",
  proxy: "Outbound proxy string for this profile (optional).",
  note: "Internal free-text note — editable in Profile detail Note rail.",
  e0001: "Cookie Bridge (E0001) — per-profile override of the global extension toggle.",
  e0002: "Browser Operator (E0002) — CDP bridge pinned for every profile, same toolbar pin as E0001.",
  surfshark: "Surfshark VPN extension — per-profile override of the global toggle.",
};

const PROFILE_COLUMN_HINT_LINES: Partial<Record<StealthProfileColumnKey, HubDirectoryColumnHintLine[]>> = {
  status: STEALTH_PROFILE_RUN_HINT_LINES,
  updated: HUB_ACTIVITY_AGE_HINT_LINES,
  createdAt: HUB_ACTIVITY_AGE_HINT_LINES,
  e0001: STEALTH_EXTENSION_ON_OFF_HINT_LINES,
  e0002: STEALTH_EXTENSION_ON_OFF_HINT_LINES,
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
  activityLog: "Latest script step summary, target URL, and execution status.",
};

const WORKFLOW_COLUMN_HINT_LINES: Partial<Record<StealthWorkflowPanelColumnKey, HubDirectoryColumnHintLine[]>> = {
  created: HUB_ACTIVITY_AGE_HINT_LINES,
  updated: HUB_ACTIVITY_AGE_HINT_LINES,
  lastRun: HUB_ACTIVITY_AGE_HINT_LINES,
};

const WORKFLOW_STORE_COLUMN_HINT_DESCRIPTIONS: Record<StealthWorkflowStoreColumnKey, string> = {
  created: "When the workflow package was first added to the store catalog.",
  updated: "Last publish or manifest update time.",
  platform: "Target platform brand for the store listing.",
  name: "Published workflow title in the remote catalog.",
  version: "Semantic version of the store package.",
  group: "Store category or folder group.",
  status: "Install state — Local, Installed, or Available in catalog.",
  source: "Remote catalog origin — Supabase or Drive manifest.",
  activityLog: "Package install state, catalog source, and description summary.",
};

const WORKFLOW_STORE_COLUMN_HINT_LINES: Partial<Record<StealthWorkflowStoreColumnKey, HubDirectoryColumnHintLine[]>> = {
  created: HUB_ACTIVITY_AGE_HINT_LINES,
  updated: HUB_ACTIVITY_AGE_HINT_LINES,
  status: STEALTH_WORKFLOW_STORE_STATUS_HINT_LINES,
  source: STEALTH_WORKFLOW_STORE_SOURCE_HINT_LINES,
};

const BACKUP_COLUMN_HINT_DESCRIPTIONS: Record<StealthBackupColumnKey, string> = {
  createdAt: "When this browser profile was originally created (synced with Profiles directory).",
  updated: "Most recent Native Session Backup v2 snapshot timestamp.",
  profile: "Browser profile code included in the backup catalog.",
  group: "Profile group for backup filters and bulk actions.",
  status: "Manual backup controls — trigger an instant v2 Snapshot or restore from Latest / Previous slot.",
  backupSlots: "Total independent backup copies stored for this profile (up to 2 rotating v2 slots: Latest + Previous).",
  dataSize: "Total disk space used by all backups of this profile and average size per backup copy.",
  cookies: "Objective SQLite cookie row count, distinct domains, and verified active auth tokens (Google, Outlook, FB, TikTok).",
  historyState: "Objective SQLite browsing history URL count, total visit count, and History DB footprint.",
  folder: "Backup & profile directory presence on disk.",
  activityLog: "Latest backup snapshot summary, compression ratio, and active auth state.",
};

const BACKUP_COLUMN_HINT_LINES: Partial<Record<StealthBackupColumnKey, HubDirectoryColumnHintLine[]>> = {
  createdAt: HUB_ACTIVITY_AGE_HINT_LINES,
  updated: HUB_ACTIVITY_AGE_HINT_LINES,
};

export type StealthFormFieldKey =
  | "name"
  | "group"
  | "status"
  | "startupUrl"
  | "proxyPreset"
  | "proxy"
  | "staticIp"
  | "ipStatus"
  | "e0001"
  | "e0002"
  | "surfshark"
  | "cookieGuard"
  | "sessionCookies"
  | "sessionBackup"
  | "sessionActions"
  | "mobileVault"
  | "devicePreset"
  | "advancedDevice"
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
  status: "Run",
  startupUrl: "Startup URL",
  proxyPreset: "Proxy preset",
  proxy: "Proxy",
  staticIp: "Static IP",
  ipStatus: "IP",
  e0001: "E0001",
  e0002: "E0002",
  surfshark: "Surfshark",
  cookieGuard: "Cookie Guard",
  sessionCookies: "Cookies",
  sessionBackup: "Backup",
  sessionActions: "Actions",
  mobileVault: "Mobile Vault",
  devicePreset: "Device preset",
  advancedDevice: "Advanced",
  platform: "Platform",
  colorScheme: "Color scheme",
  timezone: "Timezone",
  locale: "Locale",
  windowMode: "Window mode",
  viewport: "Viewport",
  fingerprintSeed: "Fingerprint",
  humanize: "Mode",
  headless: "Headless",
  userAgent: "User-Agent",
  defaultStartupUrl: "Default startup URL",
};

const FORM_FIELD_HINT_DESCRIPTIONS: Record<StealthFormFieldKey, string> = {
  name: "Unique profile label — shown in directory and used as Console log source.",
  group: "Assign profile to a folder for filters and bulk operations.",
  status: PROFILE_COLUMN_HINT_DESCRIPTIONS.status,
  startupUrl: "First URL loaded when Run opens this profile.",
  proxyPreset: "Quick-fill proxy from saved presets — edits custom proxy string.",
  proxy: "Full proxy URL — overrides preset when edited manually.",
  staticIp: "Pin this proxy permanently to the profile so it does not reset to Local IP on close.",
  ipStatus: "Live outbound exit IP address and connectivity status (🟢 Live / 🔴 Die). Click the pulse icon to probe or refresh.",
  e0001: PROFILE_COLUMN_HINT_DESCRIPTIONS.e0001,
  e0002: PROFILE_COLUMN_HINT_DESCRIPTIONS.e0002,
  surfshark: PROFILE_COLUMN_HINT_DESCRIPTIONS.surfshark,
  cookieGuard: "On-disk SQLite Cookies, DPAPI Local State, SPA LocalStorage backup (.last-good.bak), and P0020 status reconciliation.",
  sessionCookies: "Live SQLite Cookies on disk and detected authenticated sessions (Google, Outlook, Facebook, TikTok).",
  sessionBackup: "Last-Good SQLite backup (.last-good.bak), SPA LocalStorage backup, and Ecosystem Vault cookies.",
  sessionActions: "Restore session backup, save a fresh healthy snapshot, or sync login status with P0020 Data Box.",
  mobileVault: "Hardware identity (Android Root/LSPosed & iOS Crane), USB/Wi-Fi ADB tunnel, screen mirror, and mobile session snapshots.",
  devicePreset: "Apply a bundled device fingerprint (OS, viewport, locale).",
  advancedDevice: "Expand or collapse custom OS, timezone, locale, viewport, fingerprint seed, and User-Agent overrides.",
  platform: "Spoofed operating system for navigator and UA hints.",
  colorScheme: "Preferred color scheme passed to the browser context.",
  timezone: "IANA timezone for Date and Intl APIs in the session.",
  locale: "BCP-47 locale for language and region hints.",
  windowMode: "Window visibility — normal, maximized, or preset viewport.",
  viewport: "Width × height when window mode uses preset viewport.",
  fingerprintSeed: "Numeric seed for deterministic canvas/WebGL noise.",
  humanize: "Runtime launch mode — Standard (Window + Humanize), Agent / Headless (Silent + Humanize), Fast Headless, or Raw Window. Agent tasks always run Headless automatically.",
  headless: "Run without visible window — easier for sites to detect.",
  userAgent: "Override default User-Agent string for this profile.",
  defaultStartupUrl: "Global default URL for new profiles and Run actions.",
};

export type StealthDisplayPrefScope = "profiles" | "workflow" | "workflow-store";

export type StealthDisplayPrefKey =
  | "total"
  | "running"
  | "headless"
  | "failed"
  | "ready"
  | "selected"
  | "steps"
  | "with_steps"
  | "create_today"
  | "create_week"
  | "update_today"
  | "ran_today"
  | "idle"
  | "empty"
  | "installed"
  | "available"
  | "local"
  | "group"
  | "status"
  | "proxy"
  | "platform"
  | "source"
  | "cpu"
  | "ram";

const DISPLAY_PREF_LABELS: Record<StealthDisplayPrefKey, string> = {
  total: "Profiles",
  running: "Running",
  headless: "Headless",
  failed: "Failed",
  ready: "Ready",
  selected: "Selected",
  steps: "Steps",
  with_steps: "Ready Scripts",
  create_today: "Create Today",
  create_week: "Create This Week",
  update_today: "Update Today",
  ran_today: "Ran today",
  idle: "Idle",
  empty: "Empty",
  installed: "Installed",
  available: "Available",
  local: "Local",
  group: "Group",
  status: "Status",
  proxy: "Proxy",
  platform: "Platform",
  source: "Source",
  cpu: "CPU",
  ram: "RAM",
};

const DISPLAY_PREF_DESCRIPTIONS: Partial<Record<`${StealthDisplayPrefScope}:${StealthDisplayPrefKey}`, string>> = {
  "profiles:total": "Total profiles in catalog — all statuses.",
  "profiles:create_today": "Profiles first created on the local calendar day.",
  "profiles:create_week": "Profiles created during the current calendar week.",
  "profiles:update_today": "Profiles updated or launched on the local calendar day.",
  "profiles:running": "Profiles with an active user browser session.",
  "profiles:headless": "Profiles running an isolated Agent Headless session (👻).",
  "profiles:failed": "Profiles whose last open or workflow ended in error.",
  "profiles:ready": "Profiles with queued Agent tasks waiting for the user Headed browser window to close (⏳).",
  "profiles:selected": "Profile rows selected for bulk actions.",
  "profiles:steps": "Step count for the active workflow on this profile.",
  "profiles:group": "Filter directory by profile folder group.",
  "profiles:status": "Filter by browser session state — Ready, Opening, Running, Failed.",
  "profiles:proxy": "Filter by proxy mode — Local IP, Country VPN, Auto VPN, Custom Proxy, or Static IP.",
  "profiles:platform": "Filter profiles by spoofed platform brand.",
  "profiles:cpu": "This device — processor load across all cores.",
  "profiles:ram": "This device — memory in use versus installed RAM.",
  "workflow:total": "All scripts in the local workflow registry.",
  "workflow:running": "Workflows with an active run in progress.",
  "workflow:failed": "Workflows whose last run ended in error.",
  "workflow:ready": "Workflows idle and ready to run.",
  "workflow:selected": "Workflow rows selected for bulk actions.",
  "workflow:steps": "Total steps across the active workflow editor.",
  "workflow:with_steps": "Scripts configured with one or more executable steps.",
  "workflow:create_today": "Scripts first saved on the local calendar day.",
  "workflow:create_week": "Scripts created during the past 7 days.",
  "workflow:update_today": "Scripts edited on the local calendar day.",
  "workflow:ran_today": "Scripts whose last run was today.",
  "workflow:idle": "Scripts that have never been run.",
  "workflow:empty": "Scripts with zero steps.",
  "workflow:group": "Filter workflows by folder group.",
  "workflow:status": "Filter by workflow run state — Ready, Running, Failed.",
  "workflow:platform": "Filter workflows by target platform brand.",
  "workflow:cpu": "This device — processor load across all cores.",
  "workflow:ram": "This device — memory in use versus installed RAM.",
  "workflow-store:total": "All packages in the remote Store catalog.",
  "workflow-store:create_today": "Store packages first published today.",
  "workflow-store:create_week": "Store packages published during the past 7 days.",
  "workflow-store:update_today": "Store packages updated today.",
  "workflow-store:local": "Authored or edited locally — not a remote store install.",
  "workflow-store:installed": "Catalog packages installed in this console.",
  "workflow-store:available": "Catalog packages not yet installed locally.",
  "workflow-store:selected": "Store rows selected for bulk install.",
  "workflow-store:group": "Filter store listings by folder group.",
  "workflow-store:platform": "Filter store listings by target platform brand.",
  "workflow-store:source": "Filter store listings by catalog origin.",
  "workflow-store:cpu": "This device — processor load across all cores.",
  "workflow-store:ram": "This device — memory in use versus installed RAM.",
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
  activityLog: "Log",
  updated: "Update",
  createdAt: "Created",
  startupUrl: "Startup URL",
  proxy: "Proxy",
  note: "Note",
  e0001: "E0001",
  e0002: "E0002",
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
      : key === "e0002"
        ? { titleGlyph: { icon: Cable, toneClass: "text-violet-300" } }
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
  if (key === "status" || key === "e0001" || key === "e0002" || key === "surfshark") {
    return stealthProfileColumnHintContent(key, FORM_FIELD_LABELS[key]);
  }
  const title = FORM_FIELD_LABELS[key];
  const lines =
    key === "staticIp"
      ? [
          { emoji: "✅", label: "On", detail: "Proxy is pinned permanently and will not reset to Local IP on close" },
          { emoji: "⭕", label: "Off", detail: "Temporary task proxy resets to Local IP automatically when browser closes" },
        ]
      : undefined;
  return colHint(title, FORM_FIELD_HINT_DESCRIPTIONS[key], lines);
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
    key === "status" && scope === "profiles"
      ? STEALTH_PROFILE_STATUS_FILTER_HINT_LINES
      : key === "proxy" && scope === "profiles"
        ? STEALTH_PROFILE_PROXY_FILTER_HINT_LINES
        : undefined;
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
