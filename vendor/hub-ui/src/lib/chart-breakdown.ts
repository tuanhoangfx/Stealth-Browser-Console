import type { ChartRow } from "../chart-items";
import type { FilterIconMeta } from "../types/filter-badge";

export { DEFAULT_CHART_PALETTE } from "./chart-palette";

export type ChartBreakdownOptions = {
  iconFor?: (label: string) => FilterIconMeta | null;
};

function rowsFromCounts(
  map: Map<string, number>,
  opts?: ChartBreakdownOptions,
): ChartRow[] {
  return [...map.entries()]
    .map(([label, value]) => ({
      label,
      value,
      iconMeta: opts?.iconFor?.(label) ?? null,
    }))
    .sort((a, b) => b.value - a.value);
}

/** Count categorical values from a list of labels (System Server / Supabase panels). */
export function chartBreakdownFromLabels(
  labels: readonly (string | null | undefined)[],
  opts?: ChartBreakdownOptions,
): ChartRow[] {
  const map = new Map<string, number>();
  for (const raw of labels) {
    const label = raw?.trim() || "—";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return rowsFromCounts(map, opts);
}

/** Count by picker — Hub tools, agent context, schema rows, etc. */
export function chartBreakdownFromPicker<T>(
  items: readonly T[],
  pick: (item: T) => string,
  opts?: ChartBreakdownOptions,
): ChartRow[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const label = pick(item) || "—";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return rowsFromCounts(map, opts);
}
