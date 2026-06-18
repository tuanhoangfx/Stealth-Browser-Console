import { CheckCircle2, CircleAlert, Database, RefreshCw } from "lucide-react";
import type { TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { PROFILES_DISPLAY_PREFS } from "../../lib/display-prefs-registry";
import type { ProfileKpiNumbers } from "./profile-kpi-items";

export type ProfileHeaderStatKey = "total" | "ready" | "running" | "failed";

const STAT_DEFS: Record<
  ProfileHeaderStatKey,
  { icon: typeof Database; label: string; toneClass: string; pick: (k: ProfileKpiNumbers) => number }
> = {
  total: { icon: Database, label: "profiles", toneClass: "text-emerald-300", pick: (k) => k.total },
  ready: { icon: CheckCircle2, label: "ready", toneClass: "text-emerald-300", pick: (k) => k.ready },
  running: { icon: RefreshCw, label: "running", toneClass: "text-cyan-300", pick: (k) => k.running },
  failed: { icon: CircleAlert, label: "failed", toneClass: "text-rose-300", pick: (k) => k.failed },
};

/** Header center stats — filtered by Display → Header stats (P0004 Users parity). */
export function buildProfileHeaderStats(visibleKeys: Set<string>, counts: ProfileKpiNumbers): TabHeaderStatItem[] {
  return PROFILES_DISPLAY_PREFS.headerStats
    .filter((item) => visibleKeys.has(item.key))
    .map((item) => {
      const def = STAT_DEFS[item.key as ProfileHeaderStatKey];
      return {
        key: item.key,
        icon: def.icon,
        label: def.label,
        value: def.pick(counts),
        toneClass: def.toneClass,
      };
    });
}
