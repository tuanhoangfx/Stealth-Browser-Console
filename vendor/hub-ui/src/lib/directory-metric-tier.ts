/** Semantic count tiers for directory metric badges (linked services, tool counts, …). */

/**
 * Design lock V1 Heat sequential (2026-07-14) — Mail SL / Service count / CRM Usage.
 * Bands: 0 · 1 · 2–5 · 6–9 · 10–20 · >20
 */
export type HubDirectoryMetricTier = "empty" | "one" | "few" | "mid" | "high" | "hot";

export const HUB_DIRECTORY_METRIC_TIER_THRESHOLDS = {
  one: 1,
  fewMax: 5,
  midMax: 9,
  highMax: 20,
} as const;

/** Short legend for column hints (Mail Sub / Usage). */
export const HUB_DIRECTORY_METRIC_HEAT_LEGEND =
  "Heat: 0 muted · 1 slate · 2–5 sky · 6–9 emerald · 10–20 amber · >20 rose";

export function resolveHubDirectoryMetricTier(count: number): HubDirectoryMetricTier {
  if (count <= 0) return "empty";
  if (count === HUB_DIRECTORY_METRIC_TIER_THRESHOLDS.one) return "one";
  if (count <= HUB_DIRECTORY_METRIC_TIER_THRESHOLDS.fewMax) return "few";
  if (count <= HUB_DIRECTORY_METRIC_TIER_THRESHOLDS.midMax) return "mid";
  if (count <= HUB_DIRECTORY_METRIC_TIER_THRESHOLDS.highMax) return "high";
  return "hot";
}

export function hubDirectoryMetricTierClass(tier: HubDirectoryMetricTier): string {
  return `hub-directory-metric-badge--${tier}`;
}
