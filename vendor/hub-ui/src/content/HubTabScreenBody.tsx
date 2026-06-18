import type { ReactNode } from "react";
import { ChartsBand } from "../shell/ChartsBand";
import { KpiStrip, type KpiTileData } from "../shell/KpiStrip";
import { HubTabSectionRule } from "../shell/HubTabSectionRule";

/**
 * P0004 HubListPage content bands below chrome:
 * mt-5 KPI/charts → section rule pill → space-y-3 main body.
 */
export function HubTabScreenBody({
  kpis,
  kpiBand,
  charts,
  chartCount,
  sectionRuleLabel,
  bodyFlex = false,
  reserveAnalyticsBand = false,
  bandOrder = "kpis-first",
  kpiZoneClassName,
  embedded = false,
  children,
}: {
  kpis?: KpiTileData[];
  /** Custom KPI row (e.g. sparkline tiles); takes precedence over `kpis`. */
  kpiBand?: ReactNode;
  charts?: ReactNode;
  chartCount?: number;
  sectionRuleLabel?: string;
  bodyFlex?: boolean;
  reserveAnalyticsBand?: boolean;
  bandOrder?: "kpis-first" | "charts-first";
  kpiZoneClassName?: string;
  embedded?: boolean;
  children: ReactNode;
}) {
  const hasAnalytics = Boolean(kpiBand || kpis?.length || charts);
  const showAnalyticsZone = hasAnalytics || reserveAnalyticsBand;
  const showSectionRule = Boolean(sectionRuleLabel && (hasAnalytics || reserveAnalyticsBand));
  const bodyClass = bodyFlex
    ? "hub-tab-body-zone hub-tab-body-zone--split space-y-3"
    : "hub-tab-body-zone space-y-3";

  const kpiRow = kpiBand ?? (kpis?.length ? (
    <KpiStrip items={kpis} />
  ) : reserveAnalyticsBand ? (
    <div className="hub-kpi-strip hub-kpi-strip--reserve" aria-hidden />
  ) : null);

  const chartsBand = charts ? (
    <ChartsBand count={chartCount}>{charts}</ChartsBand>
  ) : reserveAnalyticsBand ? (
    <ChartsBand reserve />
  ) : null;

  const inner = (
    <>
      {showAnalyticsZone ? (
        <div
          className={[
            "hub-tab-kpi-zone flex flex-col",
            !hasAnalytics && reserveAnalyticsBand ? "hub-tab-kpi-zone--reserved" : "",
            kpiZoneClassName ?? "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {bandOrder === "charts-first" ? (
            <>
              {chartsBand}
              {kpiRow}
            </>
          ) : (
            <>
              {kpiRow}
              {chartsBand}
            </>
          )}
        </div>
      ) : null}
      {showSectionRule ? <HubTabSectionRule label={sectionRuleLabel!} /> : null}
      <div className={bodyClass}>{children}</div>
    </>
  );

  if (embedded) return inner;
  return <div className="hub-tab-content-zone">{inner}</div>;
}
