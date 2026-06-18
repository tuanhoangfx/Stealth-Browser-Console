import type { ElementType } from "react";

export type MetricBadgeTone = "ok" | "bad" | "warn" | "neutral";

/** Portable filter/badge icon metadata (full registry lives in each app's `lib/badge-registry`). */
export type FilterIconMeta = {
  icon: ElementType<{ size?: number; className?: string }>;
  className: string;
};

export type BadgeSpec = {
  label: string;
  iconMeta: FilterIconMeta;
  tone?: MetricBadgeTone;
  variantClass?: string;
};
