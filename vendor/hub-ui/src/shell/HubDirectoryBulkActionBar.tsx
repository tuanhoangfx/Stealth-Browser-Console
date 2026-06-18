import type { ReactNode } from "react";
import { HubDirectorySelectAllChip, type HubDirectorySelectAllChipProps } from "./HubDirectorySelectAllChip";

export type HubDirectoryBulkActionBarProps = {
  /** Card-view select-all chip — `x/y` count uses `filterSelectionToolbar` + `directoryViewMode="card"`. */
  selectAll?: HubDirectorySelectAllChipProps | null;
  children?: ReactNode;
};

/** Golden filter row 2 — bulk CTAs only (`filterRowActions`; selection count lives in toolbar row-1). */
export function HubDirectoryBulkActionBar({ selectAll, children }: HubDirectoryBulkActionBarProps) {
  const showSelectAll = selectAll != null && selectAll.visibleCount > 0;
  if (!showSelectAll && !children) return null;
  return (
    <>
      {showSelectAll ? <HubDirectorySelectAllChip {...selectAll} /> : null}
      {children}
    </>
  );
}
