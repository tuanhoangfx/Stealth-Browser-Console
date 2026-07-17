import type { LucideIcon } from "lucide-react";
import { Layers } from "lucide-react";
import {
  hubDirectoryMetricTierClass,
  resolveHubDirectoryMetricTier,
} from "../lib/directory-metric-tier";
import { compactIconSize } from "../ui-scale";

export type HubDirectoryMetricBadgeProps = {
  count: number;
  icon?: LucideIcon;
  /** `tool` — table row (22px). `card` — card metric strip. */
  display?: "tool" | "card";
  className?: string;
};

/** Unified numeric metric chip — Design V1 Heat sequential palette. */
export function HubDirectoryMetricBadge({
  count,
  icon: Icon = Layers,
  display = "tool",
  className = "",
}: HubDirectoryMetricBadgeProps) {
  const tier = resolveHubDirectoryMetricTier(count);
  const tierClass = hubDirectoryMetricTierClass(tier);

  return (
    <span
      className={[
        "hub-users-tool-badge",
        "hub-directory-metric-badge",
        tierClass,
        display === "card" ? "hub-users-tool-badge--card" : "",
        tier === "empty" ? "hub-users-tool-badge--empty" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon size={compactIconSize(11)} className="hub-users-tool-badge__icon" aria-hidden />
      <span className="hub-users-tool-badge__count tabular-nums">{count}</span>
    </span>
  );
}
