import { CheckCircle2, CircleAlert, Database, RefreshCw } from "lucide-react";
import type { KpiTileData } from "@tool-workspace/hub-ui";
import type { ProfileRow, ProfileCatalogStats } from "../../types";

export type ProfileKpiNumbers = {
  total: number;
  ready: number;
  running: number;
  failed: number;
};

const PROFILE_KPI_TILES: Array<{
  key: string;
  label: string;
  tone: NonNullable<KpiTileData["tone"]>;
  icon: KpiTileData["icon"];
  pick: (k: ProfileKpiNumbers) => number;
  iconClassName?: string;
}> = [
  { key: "total", label: "Profiles (shown)", tone: "indigo", icon: Database, pick: (k) => k.total },
  { key: "running", label: "Running", tone: "cyan", icon: RefreshCw, pick: (k) => k.running },
  { key: "ready", label: "Ready", tone: "emerald", icon: CheckCircle2, pick: (k) => k.ready },
  { key: "failed", label: "Failed", tone: "rose", icon: CircleAlert, pick: (k) => k.failed },
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
    icon: row.icon,
    tone: row.tone,
    iconClassName: row.key === "running" && kpis.running > 0 ? "animate-spin" : undefined,
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
      icon: RefreshCw,
      label: "running",
      value: counts.running,
      toneClass: "text-cyan-300",
    },
    {
      key: "profiles-failed",
      icon: CircleAlert,
      label: "failed",
      value: counts.failed,
      toneClass: "text-rose-300",
    },
  ];
}
