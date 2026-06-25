import type { HubUsersStatusTone } from "../shell/HubUsersStatusLabel";
import { formatHubTimestampDateOnly } from "./format-hub-timestamp-compact";

export type HubActivityAgeTone = "fresh" | "recent" | "stale";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Parse ISO string or epoch ms to activity timestamp. */
export function parseHubActivityMs(at: string | number | null | undefined): number | null {
  if (at == null) return null;
  if (typeof at === "number") {
    return Number.isFinite(at) && at > 0 ? at : null;
  }
  if (!at.trim()) return null;
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

/** Fresh ≤1h · Recent ≤24h · Stale >24h — sync/load/profile activity SSOT. */
export function hubActivityAgeTone(ms: number, now = Date.now()): HubActivityAgeTone {
  const age = Math.max(0, now - ms);
  if (age <= HOUR_MS) return "fresh";
  if (age <= DAY_MS) return "recent";
  return "stale";
}

export function hubActivityAgeHubTone(tone: HubActivityAgeTone): HubUsersStatusTone {
  if (tone === "fresh") return "active";
  if (tone === "recent") return "idle";
  return "offline";
}

/** Stale (>24h) — compact `dd/mm/yy`. */
export function formatHubActivityStaleLabel(ms: number): string {
  return formatHubTimestampDateOnly(new Date(ms).toISOString());
}

/** Relative label within the last 24 hours. */
export function formatHubActivityRelativeAge(ms: number, now = Date.now()): string {
  const ageMs = Math.max(0, now - ms);
  const ageSec = Math.floor(ageMs / 1000);
  if (ageSec < 60) return "just now";
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m ago`;
  const ageHr = Math.floor(ageMin / 60);
  return `${ageHr}h ago`;
}

export function formatHubActivityTime(
  at: string | number | null | undefined,
  now = Date.now(),
): {
  label: string;
  tone: HubActivityAgeTone;
  hubTone: HubUsersStatusTone;
} | null {
  const ms = parseHubActivityMs(at);
  if (ms == null) return null;
  const tone = hubActivityAgeTone(ms, now);
  const label =
    tone === "stale" ? formatHubActivityStaleLabel(ms) : formatHubActivityRelativeAge(ms, now);
  return { label, tone, hubTone: hubActivityAgeHubTone(tone) };
}

/** @deprecated Use {@link formatHubActivityRelativeAge}. */
export const formatLastOpenedRelativeAge = formatHubActivityRelativeAge;

/** @deprecated Use {@link formatHubActivityStaleLabel}. */
export const formatLastOpenedStaleDate = formatHubActivityStaleLabel;

/** @deprecated Use {@link hubActivityAgeTone}. */
export const lastOpenedAgeTone = hubActivityAgeTone;

/** @deprecated Use {@link hubActivityAgeHubTone}. */
export const lastOpenedHubTone = hubActivityAgeHubTone;
