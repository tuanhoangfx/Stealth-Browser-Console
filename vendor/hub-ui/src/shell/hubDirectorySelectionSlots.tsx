import type { ReactNode } from "react";
import {
  HubDirectoryToolbarSelection,
  type HubDirectoryToolbarSelectionProps,
} from "./HubDirectoryToolbarSelection";
import type { HubViewMode } from "./ViewToggle";

export type HubDirectorySelectionSlots = {
  searchTrailing?: ReactNode;
  row2Trailing?: ReactNode;
};

/** Route V2 selection chip — table: beside search · card: row-2 after bulk actions. */
export function buildHubDirectorySelectionSlots(
  props: HubDirectoryToolbarSelectionProps | undefined,
  viewMode: HubViewMode = "table",
): HubDirectorySelectionSlots {
  if (!props) return {};
  const chip = <HubDirectoryToolbarSelection {...props} />;
  if (viewMode === "card") return { row2Trailing: chip };
  return { searchTrailing: chip };
}
