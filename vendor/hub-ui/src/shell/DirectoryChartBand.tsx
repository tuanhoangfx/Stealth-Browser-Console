import type { ReactNode } from "react";
import { CHART_TOP_N, type ChartRow } from "../chart-items";
import type { PrefItem } from "../display-prefs/types";
import { chartPanelTitleFromDefs } from "../lib/chart-panel-titles";
import { MiniBarChart } from "./MiniBarChart";
import { MiniDonut } from "./MiniDonut";

function isDonutChartKey(key: string): boolean {
  return key.endsWith("_donut");
}

/**
 * Allowlist only — `topN > CHART_TOP_N` (3) is forbidden unless the facet is a
 * fixed enum with ≤4 values (fits `--hub-chart-bar-rows: 4` with no empty Other).
 * Slot / Price / open vocab → default `CHART_TOP_N` (3 + Other).
 * Current allowlist: `contact_bar: 4` (exactly 4 contact channels).
 */
const BAR_CHART_TOP_N: Record<string, number> = {
  contact_bar: 4,
  customers_bar: 4,
  day_bar: 4,
  notify_bar: 4,
  order_status_bar: 4,
  pay_status_bar: 4,
};

/** Fixed-bucket facets — keep aggregate row order (not value-rank). */
const BAR_CHART_PRESERVE_ORDER = new Set([
  "day_bar",
  "notify_bar",
  "order_status_bar",
  "pay_status_bar",
]);

export type DirectoryChartBandProps = {
  visCharts: Set<string>;
  defs: PrefItem[];
  data: Record<string, ChartRow[] | undefined>;
};

export function hasDirectoryCharts(
  visCharts: Set<string>,
  defs: PrefItem[],
  data: Record<string, ChartRow[] | undefined>,
): boolean {
  return defs.some((d) => visCharts.has(d.key) && data[d.key]);
}

/** Pass to `HubDirectoryScreen` `charts` only when ≥1 chart visible — avoids empty analytics frame. */
export function directoryChartBandNode(props: DirectoryChartBandProps): ReactNode | undefined {
  return hasDirectoryCharts(props.visCharts, props.defs, props.data) ? (
    <DirectoryChartBand {...props} />
  ) : undefined;
}

/** Golden directory charts row — defs order, Display prefs visibility, MiniBarChart + top-N/Other. */
export function DirectoryChartBand({ visCharts, defs, data }: DirectoryChartBandProps) {
  const keys = defs.map((d) => d.key).filter((k) => visCharts.has(k) && data[k]);
  if (keys.length === 0) return null;
  return (
    <>
      {keys.map((key) => {
        const def = defs.find((d) => d.key === key);
        const title = chartPanelTitleFromDefs(defs, key);
        const items = data[key]!;
        const titleEmoji = def?.emoji;
        const titleHint = def?.labelHint;
        const topN = BAR_CHART_TOP_N[key] ?? CHART_TOP_N;
        const preserveOrder = BAR_CHART_PRESERVE_ORDER.has(key);
        return isDonutChartKey(key) ? (
          <MiniDonut key={key} title={title} titleEmoji={titleEmoji} titleHint={titleHint} items={items} />
        ) : (
          <MiniBarChart
            key={key}
            title={title}
            titleEmoji={titleEmoji}
            titleHint={titleHint}
            items={items}
            topN={topN}
            preserveOrder={preserveOrder}
          />
        );
      })}
    </>
  );
}
