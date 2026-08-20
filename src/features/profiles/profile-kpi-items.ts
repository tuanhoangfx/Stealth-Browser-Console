import { AlertTriangle, CheckCircle2, Database, Play } from "lucide-react";
import type { KpiTileData } from "@tool-workspace/hub-ui";
import { STEALTH_PROFILE_KPI_STICKER } from "../../lib/stealth-column-stickers";
import type { ProfileRow, ProfileCatalogStats } from "../../types";

export type ProfileKpiNumbers = {
  total: number;
  ready: number;
  running: number;
  failed: number;
};

const PROFILE_KPI_TILES: Array<{
  key: keyof typeof STEALTH_PROFILE_KPI_STICKER;
  label: string;
  tone: NonNullable<KpiTileData["tone"]>;
  pick: (k: ProfileKpiNumbers) => number;
}> = [
  { key: "total", label: "Profiles", tone: "indigo", pick: (k) => k.total },
  { key: "running", label: "Running", tone: "emerald", pick: (k) => k.running },
  { key: "failed", label: "Failed", tone: "rose", pick: (k) => k.failed },
  { key: "ready", label: "Ready", tone: "emerald", pick: (k) => k.ready },
];

export function buildProfileKpiNumbersFromStats(stats: ProfileCatalogStats): ProfileKpiNumbers {
  return {
    total: stats.total,
    ready: stats.closed,
    running: stats.running,
    failed: stats.failed,
  };
}

export function buildProfileKpiNumbers(profiles: ProfileRow[]): ProfileKpiNumbers {
  return {
    total: profiles.length,
    ready: profiles.filter((p) => p.status === "closed").length,
    running: profiles.filter((p) => p.status === "running").length,
    failed: profiles.filter((p) => p.status === "failed").length,
  };
}

/** KPI strip tiles — prefKey matches Display panel + URL `kpi` param (P0004 Users parity). */
export function buildProfileKpiItems(kpis: ProfileKpiNumbers): KpiTileData[] {
  return PROFILE_KPI_TILES.map((row) => ({
    prefKey: row.key,
    label: row.label,
    value: row.pick(kpis),
    emojiGlyph: STEALTH_PROFILE_KPI_STICKER[row.key],
    tone: row.tone,
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
