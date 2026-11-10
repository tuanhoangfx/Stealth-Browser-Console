import { CheckCircle2, Database, Play } from "lucide-react";
import type { HubDirectoryColumnHintContent, KpiTileData } from "@tool-workspace/hub-ui";
import { STEALTH_PROFILE_KPI_STICKER } from "../../lib/stealth-column-stickers";
import type { ProfileRow, ProfileCatalogStats } from "../../types";

export type ProfileKpiNumbers = {
  total: number;
  createToday?: number;
  createWeek?: number;
  updateToday?: number;
  ready: number;
  running: number;
  headless?: number;
  failed: number;
};

/** K1 Lock — Group active Headless sessions by Daemon / Process Pool for KPI tooltip. */
export function buildHeadlessKpiHintK1(
  catalogStats: ProfileCatalogStats | null | undefined,
  headlessCount: number,
): HubDirectoryColumnHintContent {
  const headlessReasons = catalogStats?.headlessReasons ?? {};
  const groups = new Map<string, { items: string[]; codes: string[] }>();
  const sortedEntries = Object.entries(headlessReasons)
    .filter(([key]) => /^\d{4}$/.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [key, rawDesc] of sortedEntries) {
    const desc = String(rawDesc || "").trim();
    const elapsedMatch = desc.match(/\s*·\s*Elapsed:\s*([^·]+)$/i);
    const elapsed = elapsedMatch ? elapsedMatch[1]!.trim() : "";
    const daemonName =
      desc.replace(/\s*·\s*Elapsed:\s*[^·]+$/i, "").trim() || "AI Agent Headless Session";
    const entry = groups.get(daemonName) ?? { items: [], codes: [] };
    entry.items.push(elapsed ? `#${key} (${elapsed})` : `#${key}`);
    entry.codes.push(key);
    groups.set(daemonName, entry);
  }
  if (groups.size > 0) {
    const lines = [...groups.entries()].map(([daemon, entry]) => {
      const shown = entry.items.slice(0, 12).join(", ");
      const more = entry.items.length > 12 ? ` (+${entry.items.length - 12} more)` : "";
      return {
        emoji: "🤖",
        label: `${daemon} (${entry.items.length})`,
        detail: `${shown}${more}`,
        actionKey: entry.codes.join(" "),
        actionLabel: `Filter directory to ${daemon} (${entry.codes.length} profiles)`,
      };
    });
    return {
      title: `Active Headless Sessions (${headlessCount} Running)`,
      titleGlyph: { emoji: "👻" },
      description: `${groups.size} active Daemon / Process pool(s) currently running headless browsers. Click a daemon row below to filter directory to its profiles.`,
      optionsLabel: "Active Daemons / Process Pools (Click to filter)",
      lines,
    };
  }
  return {
    title: `Active Headless Sessions (${headlessCount} Running)`,
    titleGlyph: { emoji: "👻" },
    description:
      headlessCount > 0
        ? `${headlessCount} headless browser session(s) active in background. Click tile to filter directory.`
        : "0 active headless sessions right now. When AI Daemons run headless profiles, this popover groups them by Daemon/PID and lists every active #Profile.",
    optionsLabel: "Headless Pool Breakdown",
    lines: [
      {
        emoji: "🤖",
        label: "Daemon / Process Pool Grouping",
        detail: "Groups active profiles by Daemon / Caller PID (G1 Family, P0020 Healer, Social Hub, Smoke Pool 9xxx).",
      },
      {
        emoji: "🔍",
        label: "1-Click Daemon Filter",
        detail: "Click any active Daemon row in this popover (or the KPI tile itself) to filter the directory.",
      },
    ],
  };
}

/** K1 Lock — Group Waiting / Deferred profiles by Daemon / Blocking Reason for KPI tooltip. */
export function buildWaitingKpiHintK1(
  catalogStats: ProfileCatalogStats | null | undefined,
  waitingCount: number,
): HubDirectoryColumnHintContent {
  const waitingCodes = catalogStats?.waitingCodes ?? [];
  const waitingReasons = catalogStats?.waitingReasons ?? {};
  const groups = new Map<string, { items: string[]; codes: string[] }>();
  const codesToScan =
    waitingCodes.length > 0
      ? waitingCodes.filter((c) => /^\d{4}$/.test(c))
      : Object.keys(waitingReasons)
          .filter((k) => /^\d{4}$/.test(k))
          .sort((a, b) => a.localeCompare(b));

  for (const code of codesToScan) {
    const reason = String(waitingReasons[code] || "AI Agent Headless Queue").trim();
    const entry = groups.get(reason) ?? { items: [], codes: [] };
    entry.items.push(`#${code}`);
    entry.codes.push(code);
    groups.set(reason, entry);
  }

  if (groups.size > 0) {
    const lines = [...groups.entries()].map(([reason, entry]) => {
      const shown = entry.items.slice(0, 12).join(", ");
      const more = entry.items.length > 12 ? ` (+${entry.items.length - 12} more)` : "";
      return {
        emoji: /user window|headed/i.test(reason) ? "🔒" : "⏳",
        label: `${reason} (${entry.items.length})`,
        detail: `${shown}${more}`,
        actionKey: entry.codes.join(" "),
        actionLabel: `Filter directory to ${reason} (${entry.codes.length} profiles)`,
      };
    });
    return {
      title: `Deferred & Queued Tasks (${waitingCount} Waiting)`,
      titleGlyph: { emoji: "⏳" },
      description: `${groups.size} queue group(s) holding ${waitingCount} profile(s) under Zero-Hijack Guard. Click a queue row below to filter directory to its profiles.`,
      optionsLabel: "Waiting Queue by Daemon / Reason (Click to filter)",
      lines,
    };
  }

  return {
    title: `Deferred & Queued Tasks (${waitingCount} Waiting)`,
    titleGlyph: { emoji: "⏳" },
    description:
      waitingCount > 0
        ? `${waitingCount} profile(s) queued by AI Daemons. Click tile to filter directory.`
        : "0 profiles waiting in queue. Profiles appear here when an AI Daemon defers execution while a User window is open or when pacing headless slots.",
    optionsLabel: "Queue Guard Reasons",
    lines: [
      {
        emoji: "🔒",
        label: "Waiting for User Window to Close",
        detail: "Deferred under Zero-Hijack Guard while user is working in Chrome; auto-drains 5s after close.",
      },
      {
        emoji: "⏳",
        label: "Caller Cap Queue",
        detail: "Paced at 350ms launch stagger (max 3 concurrent headless sessions per caller).",
      },
    ],
  };
}

const PROFILE_KPI_TILES: Array<{
  key: keyof typeof STEALTH_PROFILE_KPI_STICKER;
  label: string;
  tone: NonNullable<KpiTileData["tone"]>;
  pick: (k: ProfileKpiNumbers) => number;
}> = [
  { key: "total", label: "Profiles", tone: "indigo", pick: (k) => k.total },
  { key: "create_today", label: "Create Today", tone: "sky", pick: (k) => k.createToday ?? 0 },
  { key: "create_week", label: "Create This Week", tone: "indigo", pick: (k) => k.createWeek ?? 0 },
  { key: "update_today", label: "Update Today", tone: "amber", pick: (k) => k.updateToday ?? 0 },
  { key: "running", label: "Running", tone: "emerald", pick: (k) => k.running },
  { key: "headless", label: "Headless", tone: "sky", pick: (k) => k.headless ?? 0 },
  { key: "ready", label: "Waiting", tone: "amber", pick: (k) => k.ready },
  { key: "failed", label: "Failed", tone: "rose", pick: (k) => k.failed },
];

export function buildProfileKpiNumbersFromStats(
  stats: ProfileCatalogStats,
  runningHeadlessCount = 0,
): ProfileKpiNumbers {
  const headedRunning = Math.max(0, stats.running - runningHeadlessCount);
  return {
    total: stats.total,
    createToday: stats.createdToday ?? 0,
    createWeek: stats.createdWeek ?? 0,
    updateToday: stats.updatedToday ?? 0,
    ready: stats.deferred ?? 0,
    running: headedRunning,
    headless: runningHeadlessCount,
    failed: stats.failed,
  };
}

export function buildProfileKpiNumbers(
  profiles: ProfileRow[],
  runningHeadlessCount = 0,
  waitingHeadlessCount = 0,
): ProfileKpiNumbers {
  const now = new Date();
  const startOfDayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfWeekDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  startOfWeekDate.setDate(startOfWeekDate.getDate() - ((startOfWeekDate.getDay() + 6) % 7));
  const startOfWeekIso = startOfWeekDate.toISOString();
  const totalRunning = profiles.filter((p) => p.status === "running").length;
  return {
    total: profiles.length,
    createToday: profiles.filter((p) => p.createdAt >= startOfDayIso).length,
    createWeek: profiles.filter((p) => p.createdAt >= startOfWeekIso).length,
    updateToday: profiles.filter((p) => p.updatedAt >= startOfDayIso).length,
    ready: Math.max(0, waitingHeadlessCount),
    running: Math.max(0, totalRunning - runningHeadlessCount),
    headless: runningHeadlessCount,
    failed: profiles.filter((p) => p.status === "failed").length,
  };
}

/** KPI strip tiles — prefKey matches Display panel + URL `kpi` param (P0004 Users parity). */
export function buildProfileKpiItems(
  kpis: ProfileKpiNumbers,
  catalogStats?: ProfileCatalogStats | null,
): KpiTileData[] {
  const headlessCount = kpis.headless ?? 0;
  const waitingCount = kpis.ready ?? 0;
  return PROFILE_KPI_TILES.map((row) => ({
    prefKey: row.key,
    label: row.label,
    value: row.pick(kpis),
    emojiGlyph: STEALTH_PROFILE_KPI_STICKER[row.key],
    tone: row.tone,
    labelHint:
      row.key === "headless"
        ? buildHeadlessKpiHintK1(catalogStats, headlessCount)
        : row.key === "ready"
          ? buildWaitingKpiHintK1(catalogStats, waitingCount)
          : undefined,
  }));
}

/** @deprecated Use buildProfileHeaderStats + display prefs instead. */
export function buildProfileHeaderCenterStats(counts: ProfileKpiNumbers) {
  return [
    {
      key: "profiles-total",
      icon: Database,
      label: "profiles",
      value: counts.total,
      toneClass: "text-emerald-300",
    },
    {
      key: "profiles-ready",
      icon: CheckCircle2,
      label: "ready",
      value: counts.ready,
      toneClass: "text-emerald-300",
    },
    {
      key: "profiles-running",
      icon: Play,
      label: "running",
      value: counts.running,
      toneClass: "text-emerald-400",
    },
  ];
}
