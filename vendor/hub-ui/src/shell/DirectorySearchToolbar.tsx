import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { RefreshCw } from "lucide-react";
import type { TimeRange } from "../display-prefs/constants";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import { useDirectoryTimeRange } from "../lib/directory-time-range";
import { HubResultCount } from "./HubResultCount";
import { HubTablePageSizeSelect } from "./HubTablePageSizeSelect";
import { HubTimeRangeSelect } from "./HubTimeRangeSelect";
import { HubWorkspacePeriodSelect, type HubWorkspacePeriodSelectProps } from "./HubWorkspacePeriodSelect";
import { ViewToggle, type HubViewMode } from "./ViewToggle";

export type DirectorySearchToolbarProps = {
  /** Workspace period filter — P0020 vault tabs (replaces manual `leading` + `HubWorkspacePeriodSelect`). */
  workspacePeriod?: HubWorkspacePeriodSelectProps;
  /** Slot before view toggle — custom leading when `workspacePeriod` is not used. */
  leading?: ReactNode;
  viewMode?: HubViewMode;
  onViewModeChange?: (mode: HubViewMode) => void;
  countIcon?: LucideIcon;
  countBrandIcon?: HubBrandIconId;
  shown: number;
  total: number;
  countLabel?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
  disabled?: boolean;
  showViewToggle?: boolean;
  /** Filter by `updatedAt` / activity — Hub catalog, System Overview, … */
  showTimeRange?: boolean;
  timeRange?: TimeRange;
  /** Pager rows (`tpage`) — golden on all paginated directory tables. */
  showTablePageSize?: boolean;
  /** Shell SSOT — when set, passed to `HubTablePageSizeSelect` (table + toolbar stay in sync). */
  tablePageSize?: number;
  /** Optional host callback after URL `tpage` patch (reset pager, side effects). */
  onTablePageSizeChange?: (size: number) => void;
  /** When false, omit the Refresh button (e.g. Inbox uses a custom Sync menu). */
  showRefresh?: boolean;
  /** When false, omit shown/total chip (e.g. Todo row-1 period-only). */
  showResultCount?: boolean;
  displayBand?: ReactNode;
  trailing?: ReactNode;
};

/** Shared FilterBar row-1 toolbar — golden P0004 Users search row. */
export function DirectorySearchToolbar({
  workspacePeriod,
  leading,
  viewMode,
  onViewModeChange,
  countIcon,
  countBrandIcon,
  shown,
  total,
  countLabel = "tools",
  refreshing = false,
  onRefresh,
  disabled = false,
  showViewToggle = true,
  showTimeRange = true,
  timeRange,
  showTablePageSize,
  tablePageSize,
  onTablePageSizeChange,
  showRefresh = true,
  showResultCount = true,
  displayBand,
  trailing,
}: DirectorySearchToolbarProps) {
  const period = useDirectoryTimeRange(timeRange);
  const resolvedShowTablePageSize = showTablePageSize ?? !displayBand;
  return (
    <>
      {leading}
      {workspacePeriod ? <HubWorkspacePeriodSelect {...workspacePeriod} /> : null}
      {showViewToggle && viewMode != null && onViewModeChange ? (
        <ViewToggle value={viewMode} onChange={onViewModeChange} />
      ) : null}
      {showTimeRange ? <HubTimeRangeSelect value={period} /> : null}
      {resolvedShowTablePageSize ? (
        <HubTablePageSizeSelect value={tablePageSize} onChange={onTablePageSizeChange} />
      ) : null}
      {displayBand}
      {showResultCount ? (
        <HubResultCount
          icon={countIcon}
          brandIcon={countBrandIcon}
          shown={shown}
          total={total}
          label={countLabel}
        />
      ) : null}
      {trailing}
      {showRefresh && onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={disabled}
          className="inline-flex h-[var(--hub-control-h)] shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Updating…" : "Refresh"}
        </button>
      ) : null}
    </>
  );
}
