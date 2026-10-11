import { HubDirectoryColumnHint, type HubDirectoryColumnHintContent } from "../table/HubDirectoryColumnHint";
import {
  hubDirectoryMetricTierClass,
  resolveHubDirectoryMetricTier,
} from "../lib/directory-metric-tier";

export type HubDirectoryCountHintProps = {
  count: number;
  /** Hover list — Hub ColumnHint SSOT (no native `title=`). */
  hint?: HubDirectoryColumnHintContent | null;
  ariaLabel?: string;
  className?: string;
};

/**
 * Round count beside a directory label (Layer sub-count). Baseline-aligned with the label.
 * Heat = same V1 bands as `HubDirectoryMetricBadge` (not the 22px Lucide chip).
 */
export function HubDirectoryCountHint({
  count,
  hint,
  ariaLabel,
  className = "",
}: HubDirectoryCountHintProps) {
  if (!Number.isFinite(count) || count <= 0) return null;

  const badge = (
    <span
      className={[
        "hub-directory-count-hint",
        hubDirectoryMetricTierClass(resolveHubDirectoryMetricTier(count)),
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={ariaLabel?.trim() || `${count}`}
    >
      {count}
    </span>
  );

  if (!hint) return badge;
  return <HubDirectoryColumnHint content={hint}>{badge}</HubDirectoryColumnHint>;
}
