import { patchHubListPrefs, subscribeHubListPrefs } from "./hub-url-prefs";

/** Golden workspace period keys — same as HubPeriodSelect. */
export type WorkspacePeriodKey =
  | "all"
  | "today"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "customMonth"
  | "customRange"
  | "last30Days";

export type WorkspacePeriodScope = "notes" | "todo" | "twofa" | "cookie";

export type WorkspacePeriodPrefs = {
  range: WorkspacePeriodKey;
  customMonth: string;
  customStartDate: string;
  customEndDate: string;
};

export const WORKSPACE_PERIOD_LABELS: Record<WorkspacePeriodKey, string> = {
  all: "All",
  today: "Today",
  thisWeek: "This Week",
  lastWeek: "Last Week",
  last30Days: "Last 30 Days",
  thisMonth: "This Month",
  customMonth: "By Month",
  customRange: "Date Range",
};

const VALID_KEYS = new Set<string>(Object.keys(WORKSPACE_PERIOD_LABELS));

/** Per-tab URL keys — each screen keeps its own period when switching tabs. */
const SCOPE_URL_KEYS: Record<
  WorkspacePeriodScope,
  { range: string; month: string; from: string; to: string }
> = {
  notes: { range: "nrange", month: "nperiodMonth", from: "nperiodFrom", to: "nperiodTo" },
  todo: { range: "trange", month: "tperiodMonth", from: "tperiodFrom", to: "tperiodTo" },
  twofa: { range: "frange", month: "fperiodMonth", from: "fperiodFrom", to: "fperiodTo" },
  cookie: { range: "crange", month: "cperiodMonth", from: "cperiodFrom", to: "cperiodTo" },
};

/** Legacy global URL keys (pre per-tab migration). */
const LEGACY_URL_KEYS = { range: "range", month: "periodMonth", from: "periodFrom", to: "periodTo" };

/** Legacy hub URL `range` values → workspace keys. */
const LEGACY_RANGE_MAP: Record<string, WorkspacePeriodKey> = {
  yesterday: "today",
  "7d": "thisWeek",
  "30d": "last30Days",
  "90d": "last30Days",
  "1y": "all",
};

export function normalizeWorkspacePeriodKey(
  raw: string | null | undefined,
  defaultKey: WorkspacePeriodKey,
): WorkspacePeriodKey {
  if (!raw) return defaultKey;
  if (VALID_KEYS.has(raw)) return raw as WorkspacePeriodKey;
  return LEGACY_RANGE_MAP[raw] ?? defaultKey;
}

function todayIsoDate() {
  return new Date().toISOString().split("T")[0]!;
}

function defaultPrefs(defaultRange: WorkspacePeriodKey): WorkspacePeriodPrefs {
  const today = todayIsoDate();
  return {
    range: defaultRange,
    customMonth: new Date().toISOString().slice(0, 7),
    customStartDate: today,
    customEndDate: today,
  };
}

function readRawRange(sp: URLSearchParams, scope: WorkspacePeriodScope, defaultKey: WorkspacePeriodKey) {
  const keys = SCOPE_URL_KEYS[scope];
  const scoped = sp.get(keys.range);
  if (scoped) return normalizeWorkspacePeriodKey(scoped, defaultKey);
  if (scope === "notes" || scope === "todo") {
    const legacy = sp.get(LEGACY_URL_KEYS.range);
    if (legacy) return normalizeWorkspacePeriodKey(legacy, defaultKey);
  }
  return defaultKey;
}

function readRawField(sp: URLSearchParams, scope: WorkspacePeriodScope, field: "month" | "from" | "to") {
  const keys = SCOPE_URL_KEYS[scope];
  const legacyKey = LEGACY_URL_KEYS[field];
  const scopedKey = field === "month" ? keys.month : field === "from" ? keys.from : keys.to;
  return sp.get(scopedKey) ?? (scope === "notes" || scope === "todo" ? sp.get(legacyKey) : null);
}

export function readWorkspacePeriod(
  scope: WorkspacePeriodScope,
  defaultRange: WorkspacePeriodKey = "last30Days",
): WorkspacePeriodPrefs {
  if (typeof window === "undefined") return defaultPrefs(defaultRange);
  const sp = new URLSearchParams(window.location.search);
  const today = todayIsoDate();
  return {
    range: readRawRange(sp, scope, defaultRange),
    customMonth: readRawField(sp, scope, "month") ?? new Date().toISOString().slice(0, 7),
    customStartDate: readRawField(sp, scope, "from") ?? today,
    customEndDate: readRawField(sp, scope, "to") ?? today,
  };
}

export function patchWorkspacePeriod(
  scope: WorkspacePeriodScope,
  patch: Partial<WorkspacePeriodPrefs>,
  defaultRange: WorkspacePeriodKey = "last30Days",
) {
  const current = readWorkspacePeriod(scope, defaultRange);
  const next = { ...current, ...patch };
  const keys = SCOPE_URL_KEYS[scope];
  const urlPatch: Record<string, string | null> = {
    [keys.range]: next.range === defaultRange ? null : next.range,
    [keys.month]: next.range === "customMonth" ? next.customMonth : null,
    [keys.from]: next.range === "customRange" ? next.customStartDate : null,
    [keys.to]: next.range === "customRange" ? next.customEndDate : null,
  };
  if (scope === "notes" || scope === "todo") {
    urlPatch[LEGACY_URL_KEYS.range] = null;
    urlPatch[LEGACY_URL_KEYS.month] = null;
    urlPatch[LEGACY_URL_KEYS.from] = null;
    urlPatch[LEGACY_URL_KEYS.to] = null;
  }
  patchHubListPrefs(urlPatch);
}

type HubPeriodOption = { value: WorkspacePeriodKey; label: string };

export function workspacePeriodOptions(): HubPeriodOption[] {
  return (Object.keys(WORKSPACE_PERIOD_LABELS) as WorkspacePeriodKey[])
    .filter((k) => k !== "lastWeek")
    .map((value) => ({ value, label: WORKSPACE_PERIOD_LABELS[value] }));
}

/** Filter rows by created/updated ISO timestamp. */
export function matchesWorkspacePeriod(
  isoDate: string | undefined,
  period: WorkspacePeriodPrefs | WorkspacePeriodKey,
): boolean {
  const prefs = typeof period === "string" ? { ...defaultPrefs(period), range: period } : period;

  if (prefs.range === "all") return true;
  if (!isoDate?.trim()) return false;

  const taskDate = new Date(isoDate);
  if (Number.isNaN(taskDate.getTime())) return false;

  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  switch (prefs.range) {
    case "today":
      startDate = todayStart;
      endDate = todayEnd;
      break;
    case "thisWeek": {
      startDate = new Date(todayStart);
      startDate.setDate(todayStart.getDate() - todayStart.getDay());
      endDate = todayEnd;
      break;
    }
    case "lastWeek": {
      startDate = new Date(todayStart);
      startDate.setDate(todayStart.getDate() - todayStart.getDay() - 7);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case "thisMonth":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = todayEnd;
      break;
    case "last30Days":
      startDate = new Date(todayStart);
      startDate.setDate(todayStart.getDate() - 30);
      endDate = todayEnd;
      break;
    case "customMonth": {
      if (!prefs.customMonth) return true;
      const [year, month] = prefs.customMonth.split("-").map(Number);
      startDate = new Date(year, month - 1, 1);
      endDate = new Date(year, month, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case "customRange": {
      if (!prefs.customStartDate) return true;
      startDate = new Date(prefs.customStartDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = prefs.customEndDate ? new Date(prefs.customEndDate) : new Date(prefs.customStartDate);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    default:
      return true;
  }

  return taskDate >= startDate && taskDate <= endDate;
}

export { subscribeHubListPrefs };
