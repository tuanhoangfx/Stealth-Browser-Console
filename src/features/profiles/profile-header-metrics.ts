import { AlertTriangle, CheckCircle2, Database, Play } from "lucide-react";
import type { TabHeaderStatItem } from "@tool-workspace/hub-ui";
import type { ProfileKpiNumbers } from "./profile-kpi-items";

export type ProfileHeaderStatKey = "total" | "ready" | "running" | "failed";

const STAT_DEFS: Record<
  ProfileHeaderStatKey,
  { icon: typeof Database; label: string; toneClass: string; pick: (k: ProfileKpiNumbers) => number }
> = {
  total: { icon: Database, label: "Profiles", toneClass: "text-emerald-300", pick: (k) => k.total },
  ready: { icon: CheckCircle2, label: "Ready", toneClass: "text-emerald-300", pick: (k) => k.ready },
  running: { icon: Play, label: "Running", toneClass: "text-emerald-400", pick: (k) => k.running },
  failed: { icon: AlertTriangle, label: "Failed", toneClass: "text-rose-300", pick: (k) => k.failed },
};

const HEADER_COUNT_ORDER: ProfileHeaderStatKey[] = ["running", "failed", "ready", "total"];

/** Backup / System header counts — Profiles tab uses host CPU/RAM instead. */
export function buildProfileHeaderStats(visibleKeys: Set<string>, counts: ProfileKpiNumbers): TabHeaderStatItem[] {
  const items: TabHeaderStatItem[] = [];
  for (const key of HEADER_COUNT_ORDER) {
    if (!visibleKeys.has(key)) continue;
    const def = STAT_DEFS[key];
    if (!def) continue;
    items.push({
      key,
      icon: def.icon,
      label: def.label,
      value: def.pick(counts),
      toneClass: def.toneClass,
    });
  }
  return items;
}
