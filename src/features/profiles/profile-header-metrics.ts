import type { TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { STEALTH_PROFILE_KPI_STICKER } from "../../lib/stealth-column-stickers";
import type { ProfileKpiNumbers } from "./profile-kpi-items";

export type ProfileHeaderStatKey = "total" | "ready" | "running" | "failed";

const STAT_DEFS: Record<
  ProfileHeaderStatKey,
  { emojiGlyph: string; label: string; toneClass: string; pick: (k: ProfileKpiNumbers) => number }
> = {
  total: { emojiGlyph: STEALTH_PROFILE_KPI_STICKER.total, label: "Profiles", toneClass: "text-emerald-300", pick: (k) => k.total },
  ready: { emojiGlyph: STEALTH_PROFILE_KPI_STICKER.ready, label: "Ready", toneClass: "text-emerald-300", pick: (k) => k.ready },
  running: { emojiGlyph: STEALTH_PROFILE_KPI_STICKER.running, label: "Running", toneClass: "text-emerald-400", pick: (k) => k.running },
  failed: { emojiGlyph: STEALTH_PROFILE_KPI_STICKER.failed, label: "Failed", toneClass: "text-rose-300", pick: (k) => k.failed },
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
      emojiGlyph: def.emojiGlyph,
      label: def.label,
      value: def.pick(counts),
      toneClass: def.toneClass,
    });
  }
  return items;
}
