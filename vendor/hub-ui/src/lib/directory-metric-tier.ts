/** Semantic count tiers for directory metric badges (linked services, tool counts, …). */

export type HubDirectoryMetricTier = "empty" | "low" | "normal" | "high";

/** Tier thresholds — Mail Accounts Service column. */
export const HUB_DIRECTORY_METRIC_TIER_THRESHOLDS = {
  lowMax: 3,
  normalMax: 9,
  highMin: 10,
} as const;

export function resolveHubDirectoryMetricTier(count: number): HubDirectoryMetricTier {
  if (count <= 0) return "empty";
  if (count <= HUB_DIRECTORY_METRIC_TIER_THRESHOLDS.lowMax) return "low";
  if (count <= HUB_DIRECTORY_METRIC_TIER_THRESHOLDS.normalMax) return "normal";
  return "high";
}

export function hubDirectoryMetricTierClass(tier: HubDirectoryMetricTier): string {
  return `hub-directory-metric-badge--${tier}`;
}
