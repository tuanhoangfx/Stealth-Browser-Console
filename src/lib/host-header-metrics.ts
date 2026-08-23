import type { TabHeaderStatItem } from "@tool-workspace/hub-ui";
import type { HostMetrics } from "../types";
import { PROFILES_DISPLAY_PREFS } from "./display-prefs-registry";
import { STEALTH_PROFILE_HEADER_STAT_STICKER } from "./stealth-column-stickers";
import { stealthDisplayPrefHintContent } from "./stealth-directory-column-hints";

export type HostHeaderStatKey = "cpu" | "ram";

/** Hub header 3-column rail — same breakpoint as `app-tab-header.css`. */
export const HOST_HEADER_WIDE_MQ = "(min-width: 1101px)";

const HOST_HEADER_KEYS: HostHeaderStatKey[] = ["cpu", "ram"];

/** Stale Display prefs still list Running/Failed/Ready/Profiles — treat as unset. */
export function resolveHostHeaderVisibleKeys(
  stored: Set<string> | null,
  defaults: Set<string>,
): Set<string> {
  if (stored === null) return defaults;
  const known = HOST_HEADER_KEYS.filter((key) => stored.has(key));
  return known.length > 0 ? new Set(known) : defaults;
}

export function formatGib(bytes: number, snapInteger = false): string {
  const gib = bytes / 1024 ** 3;
  if (snapInteger) {
    const nearest = Math.round(gib);
    if (Math.abs(gib - nearest) < 0.15) return String(nearest);
  }
  if (gib >= 10) {
    const one = gib.toFixed(1);
    return one.endsWith(".0") ? one.slice(0, -2) : one;
  }
  return gib.toFixed(1);
}

export function formatHostCpuValue(metrics: HostMetrics | null): string {
  if (!metrics?.cpuReady) return "—";
  return `${Math.round(metrics.cpuPercent)}%`;
}

export function formatHostRamPercent(metrics: HostMetrics | null): string {
  if (!metrics || metrics.ramTotalBytes <= 0) return "—";
  return `${Math.round(metrics.ramPercent)}%`;
}

/** Wide: `18.2 / 32 GB · 57%`. Narrow: `18 GB · 57%`. */
export function formatHostRamValue(metrics: HostMetrics | null, wide = true): string {
  if (!metrics || metrics.ramTotalBytes <= 0) return "—";
  const pct = formatHostRamPercent(metrics);
  if (wide) {
    return `${formatGib(metrics.ramUsedBytes)} / ${formatGib(metrics.ramTotalBytes, true)} GB · ${pct}`;
  }
  return `${Math.round(metrics.ramUsedBytes / 1024 ** 3)} GB · ${pct}`;
}

export function hostLoadTone(percent: number | null | undefined): string {
  if (percent == null || !Number.isFinite(percent)) return "text-slate-400";
  if (percent >= 90) return "text-rose-300";
  if (percent >= 70) return "text-amber-300";
  return "text-emerald-300";
}

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
