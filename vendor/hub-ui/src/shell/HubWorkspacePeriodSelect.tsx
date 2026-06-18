import { useMemo } from "react";
import { HubPeriodSelect } from "../shell/HubPeriodSelect";
import { useWorkspacePeriod } from "../hooks/useWorkspacePeriod";
import {
  workspacePeriodOptions,
  type WorkspacePeriodKey,
  type WorkspacePeriodScope,
} from "../lib/hub-workspace-period";

export type HubWorkspacePeriodSelectProps = {
  scope: WorkspacePeriodScope;
  defaultRange?: WorkspacePeriodKey;
  inactiveKeys?: readonly WorkspacePeriodKey[];
  language?: string;
  labels?: Partial<Record<WorkspacePeriodKey, string>>;
  applyLabel?: string;
};

/** Golden Period filter — HubPeriodSelect + per-tab URL prefs. */
export function HubWorkspacePeriodSelect({
  scope,
  defaultRange = "last30Days",
  inactiveKeys = ["all", "last30Days"],
  language = typeof navigator !== "undefined" ? navigator.language : "en",
  labels,
  applyLabel = "Apply",
}: HubWorkspacePeriodSelectProps) {
  const period = useWorkspacePeriod(scope, defaultRange);

  const options = useMemo(() => {
    const base = workspacePeriodOptions();
    if (!labels) return base;
    return base.map((o) => ({ ...o, label: labels[o.value] ?? o.label }));
  }, [labels]);

  return (
    <HubPeriodSelect
      value={period.range}
      onChange={(range) => period.patch({ range: range as WorkspacePeriodKey })}
      options={options}
      customMonth={period.customMonth}
      onCustomMonthChange={(customMonth) => period.patch({ customMonth, range: "customMonth" })}
      customStartDate={period.customStartDate}
      onCustomStartDateChange={(customStartDate) => period.patch({ customStartDate })}
      customEndDate={period.customEndDate}
      onCustomEndDateChange={(customEndDate) => period.patch({ customEndDate })}
      monthRangeKey="customMonth"
      dateRangeKey="customRange"
      inactiveKeys={inactiveKeys}
      language={language}
      thisMonthLabel={labels?.thisMonth ?? "This Month"}
      backLabel="Back"
      applyLabel={applyLabel}
      startLabel="Start"
      endLabel="End"
    />
  );
}
