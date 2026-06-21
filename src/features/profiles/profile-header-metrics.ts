import { CheckCircle2, Database, Play } from "lucide-react";
import type { TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { PROFILES_DISPLAY_PREFS } from "../../lib/display-prefs-registry";
import type { ProfileKpiNumbers } from "./profile-kpi-items";

export type ProfileHeaderStatKey = "total" | "ready" | "running";

const STAT_DEFS: Record<
  ProfileHeaderStatKey,
  { icon: typeof Database; label: string; toneClass: string; pick: (k: ProfileKpiNumbers) => number }
> = {
  total: { icon: Database, label: "Profiles", toneClass: "text-emerald-300", pick: (k) => k.total },
  ready: { icon: CheckCircle2, label: "Ready", toneClass: "text-emerald-300", pick: (k) => k.ready },
  running: { icon: Play, label: "Running", toneClass: "text-emerald-400", pick: (k) => k.running },
};

/** Header center stats — filtered by Display → Header stats (P0004 Users parity). */
export function buildProfileHeaderStats(visibleKeys: Set<string>, counts: ProfileKpiNumbers): TabHeaderStatItem[] {
  return PROFILES_DISPLAY_PREFS.headerStats
    .filter((item) => visibleKeys.has(item.key))
    .map((item) => {
      const def = STAT_DEFS[item.key as ProfileHeaderStatKey];
      if (!def) return null;
      return {
        key: item.key,
        icon: def.icon,
        label: item.label,
        value: def.pick(counts),
        toneClass: def.toneClass,
      };
    })
    .filter((item): item is TabHeaderStatItem => item !== null);
}
