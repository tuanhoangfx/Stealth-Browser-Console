import type { TimeRange } from "../display-prefs/constants";
import { useDirectoryTimeRange } from "../lib/directory-time-range";
import { HubTablePageSizeSelect } from "./HubTablePageSizeSelect";
import { HubTimeRangeSelect } from "./HubTimeRangeSelect";

export type HubDirectoryToolbarSlotsProps = {
  showTimeRange?: boolean;
  timeRange?: TimeRange;
  showTablePageSize?: boolean;
};

/** Period + pager row controls — insert in FilterBar `toolbar` before ViewToggle / count. */
export function HubDirectoryToolbarSlots({
  showTimeRange = true,
  timeRange,
  showTablePageSize = true,
}: HubDirectoryToolbarSlotsProps) {
  const period = useDirectoryTimeRange(timeRange);
  return (
    <>
      {showTimeRange ? <HubTimeRangeSelect value={period} /> : null}
      {showTablePageSize ? <HubTablePageSizeSelect /> : null}
    </>
  );
}
