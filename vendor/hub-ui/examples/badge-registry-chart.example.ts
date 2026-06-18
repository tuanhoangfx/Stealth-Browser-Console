/**
 * Scaffold — copy to `src/lib/badge-registry-chart.ts` in P00xx tools.
 * Golden reference: P0004 `src/lib/badge-registry-chart.ts`
 *
 * Do NOT re-export this module from `badge-registry.ts` — circular import causes
 * `Cannot access 'WORKSPACE_ROLE' before initialization` at boot.
 */
import { createChartLegendResolver, type FilterIconMeta } from "@tool-workspace/hub-ui";

/** Tab-specific chart row labels → filter badge icons. */
const MY_TOOL_CHART: Record<string, FilterIconMeta> = {
  // Active: { icon: CheckCircle2, className: "text-emerald-400" },
};

export const resolveMyToolChartLegendIcon = createChartLegendResolver(
  [MY_TOOL_CHART],
  () => null,
);
