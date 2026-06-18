import { Ellipsis, Pencil } from "lucide-react";
import { chartRankBarColor, CHART_OTHERS_BAR_COLOR } from "./lib/chart-palette";
import type { FilterIconMeta } from "./types/filter-badge";

export type ChartLegendIcon = FilterIconMeta;

export type ChartRow = {
  label: string;
  value: number;
  color?: string;
  iconMeta?: FilterIconMeta | null;
  /** Brand image — takes precedence over iconMeta when set. */
  iconSrc?: string;
};

export const CHART_OTHERS_LABEL = "Others";

/** Top-N legend rows shown in MiniBarChart / MiniDonut (+1 Others bucket). */
export const CHART_TOP_N = 3;
export const CHART_LEGEND_SLOT_COUNT = CHART_TOP_N + 1;

const OTHERS_COLOR = CHART_OTHERS_BAR_COLOR;

const FALLBACK_LEGEND: Record<string, FilterIconMeta> = {
  [CHART_OTHERS_LABEL]: { icon: Ellipsis, className: "text-slate-400" },
  Other: { icon: Ellipsis, className: "text-slate-400" },
  Draft: { icon: Pencil, className: "text-amber-300" },
};

let resolveLegend: ((label: string) => FilterIconMeta | null) | null = null;

/** Host app wires P0004 `resolveChartLegendIcon` for full registry parity. */
export function configureChartLegend(resolve: (label: string) => FilterIconMeta | null) {
  resolveLegend = resolve;
}

function legendFor(label: string): FilterIconMeta | null {
  const key = label.trim();
  return resolveLegend?.(key) ?? FALLBACK_LEGEND[key] ?? null;
}

export function withChartLegendIcon<T extends ChartRow>(row: T): T {
  const iconMeta = row.iconMeta ?? legendFor(row.label);
  return iconMeta ? { ...row, iconMeta } : row;
}

function withChartRankColor<T extends ChartRow>(row: T, index: number): T {
  return { ...row, color: chartRankBarColor(index, row.label) };
}

export function topChartItems<T extends ChartRow>(items: T[], topN = CHART_TOP_N, othersLabel = CHART_OTHERS_LABEL): T[] {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  if (sorted.length === 0) return [];
  const head = sorted.slice(0, topN).map((row, i) => withChartRankColor(withChartLegendIcon(row), i));
  const rest = sorted.slice(topN);
  const othersValue = rest.reduce((sum, row) => sum + row.value, 0);
  return [...head, withChartRankColor(withChartLegendIcon({ label: othersLabel, value: othersValue } as T), topN)];
}

export function prepareChartItems<T extends ChartRow>(items: T[]): T[] {
  return topChartItems(items);
}
