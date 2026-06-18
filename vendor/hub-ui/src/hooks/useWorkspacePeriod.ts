import { useEffect, useState } from "react";
import {
  patchWorkspacePeriod,
  readWorkspacePeriod,
  subscribeHubListPrefs,
  type WorkspacePeriodKey,
  type WorkspacePeriodPrefs,
  type WorkspacePeriodScope,
} from "../lib/hub-workspace-period";

/** URL-synced workspace period — one scope per Hub tab. */
export function useWorkspacePeriod(
  scope: WorkspacePeriodScope,
  defaultRange: WorkspacePeriodKey = "last30Days",
) {
  const [period, setPeriod] = useState<WorkspacePeriodPrefs>(() => readWorkspacePeriod(scope, defaultRange));

  useEffect(() => {
    return subscribeHubListPrefs(() => setPeriod(readWorkspacePeriod(scope, defaultRange)));
  }, [scope, defaultRange]);

  return {
    ...period,
    setRange: (range: WorkspacePeriodKey) => patchWorkspacePeriod(scope, { range }, defaultRange),
    setCustomMonth: (customMonth: string) =>
      patchWorkspacePeriod(scope, { customMonth, range: "customMonth" }, defaultRange),
    setCustomStartDate: (customStartDate: string) =>
      patchWorkspacePeriod(scope, { customStartDate }, defaultRange),
    setCustomEndDate: (customEndDate: string) => patchWorkspacePeriod(scope, { customEndDate }, defaultRange),
    patch: (patch: Partial<WorkspacePeriodPrefs>) => patchWorkspacePeriod(scope, patch, defaultRange),
  };
}
