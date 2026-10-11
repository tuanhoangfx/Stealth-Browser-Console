/**
 * Shared S–D count rank. Visual = `HubCountRankBadge` (Customer Soft Gradient Pill).
 * Bands are per metric — do not reuse Customer order/spend thresholds for package counts.
 *
 * Package count (Partner Packages):
 * D = 0 · C = 1 · B < 3 (2) · A < 5 (3–4) · S ≥ 5
 */

export type HubCountRankLetter = "S" | "A" | "B" | "C" | "D";

export const HUB_COUNT_RANK_LETTERS: readonly HubCountRankLetter[] = ["S", "A", "B", "C", "D"];

/** Inclusive floors. Count below `cMin` is D. */
export type HubCountRankBands = {
  sMin: number;
  aMin: number;
  bMin: number;
  cMin: number;
};

export const HUB_PACKAGE_COUNT_RANK_BANDS: HubCountRankBands = {
  sMin: 5,
  aMin: 3,
  bMin: 2,
  cMin: 1,
};

/** Higher = better (S=4 … D=0). */
export function hubCountRankScore(letter: HubCountRankLetter): number {
  switch (letter) {
    case "S":
      return 4;
    case "A":
      return 3;
    case "B":
      return 2;
    case "C":
      return 1;
    default:
      return 0;
  }
}

export function resolveHubCountRank(
  count: number | null | undefined,
  bands: HubCountRankBands,
): HubCountRankLetter {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n >= bands.sMin) return "S";
  if (n >= bands.aMin) return "A";
  if (n >= bands.bMin) return "B";
  if (n >= bands.cMin) return "C";
  return "D";
}

export function hubPackageCountRank(count: number | null | undefined): HubCountRankLetter {
  return resolveHubCountRank(count, HUB_PACKAGE_COUNT_RANK_BANDS);
}

/** Header-hint copy for `HUB_PACKAGE_COUNT_RANK_BANDS`. Order matches `HUB_COUNT_RANK_LETTERS`. */
export function hubPackageCountRankDetail(letter: HubCountRankLetter): string {
  switch (letter) {
    case "S":
      return "≥ 5";
    case "A":
      return "3–4";
    case "B":
      return "2";
    case "C":
      return "1";
    default:
      return "0";
  }
}

export const HUB_PACKAGE_COUNT_RANK_LEGEND: readonly {
  letter: HubCountRankLetter;
  detail: string;
}[] = HUB_COUNT_RANK_LETTERS.map((letter) => ({
  letter,
  detail: hubPackageCountRankDetail(letter),
}));
