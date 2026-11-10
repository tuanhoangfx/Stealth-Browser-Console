import {
  formatGib,
  formatHostCpuValue,
  formatHostRamPercent,
  formatHostRamValue,
  HOST_HEADER_WIDE_MQ,
  hostLoadTone,
  resolveHostHeaderVisibleKeys,
  type HostHeaderStatKey,
  type TabHeaderStatItem,
} from "@tool-workspace/hub-ui";
import type { HostMetrics } from "../types";
import { PROFILES_DISPLAY_PREFS } from "./display-prefs-registry";
import { STEALTH_PROFILE_HEADER_STAT_STICKER } from "./stealth-column-stickers";
import { stealthDisplayPrefHintContent } from "./stealth-directory-column-hints";

export {
  formatGib,
  formatHostCpuValue,
  formatHostRamPercent,
  formatHostRamValue,
  HOST_HEADER_WIDE_MQ,
  hostLoadTone,
  resolveHostHeaderVisibleKeys,
  type HostHeaderStatKey,
};

/** Hub header — device CPU / RAM (KPI tiles keep domain counts). */
export function buildHostHeaderStats(
  visibleKeys: Set<string>,
  metrics: HostMetrics | null,
  options: { wide?: boolean } = {},
): TabHeaderStatItem[] {
  const wide = options.wide !== false;
  const items: TabHeaderStatItem[] = [];
  for (const item of PROFILES_DISPLAY_PREFS.headerStats) {
    if (!visibleKeys.has(item.key)) continue;
    if (item.key === "cpu") {
      items.push({
        key: "cpu",
        emojiGlyph: STEALTH_PROFILE_HEADER_STAT_STICKER.cpu,
        label: item.label,
        value: formatHostCpuValue(metrics),
        toneClass: hostLoadTone(metrics?.cpuReady ? metrics.cpuPercent : null),
        labelHint: stealthDisplayPrefHintContent("cpu", "profiles", item.label),
      });
      continue;
    }
    if (item.key === "ram") {
      const ramHint = metrics
        ? `${Math.round(metrics.ramPercent)}% used — ${formatGib(metrics.ramUsedBytes)} of ${formatGib(metrics.ramTotalBytes, true)} GB installed.`
        : stealthDisplayPrefHintContent("ram", "profiles", item.label).description;
      items.push({
        key: "ram",
        emojiGlyph: STEALTH_PROFILE_HEADER_STAT_STICKER.ram,
        label: item.label,
        value: formatHostRamValue(metrics, wide),
        toneClass: hostLoadTone(metrics?.ramPercent),
        className: "stealth-host-ram-stat",
        labelHint: {
          ...stealthDisplayPrefHintContent("ram", "profiles", item.label),
          description: ramHint ?? "This device — memory in use versus installed RAM.",
        },
      });
    }
  }
  return items;
}
