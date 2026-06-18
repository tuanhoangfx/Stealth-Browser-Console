import type { ReactNode } from "react";
import { FilterBar, type FilterBarProps } from "./FilterBar";

export type HubSplitDirectoryFilterBarProps = Omit<
  FilterBarProps,
  "layout" | "trailing" | "pinSticky" | "embedded" | "frameless"
> & {
  shortcutScope: string;
  toolbar?: ReactNode;
  row2Leading?: ReactNode;
  row2Actions?: ReactNode;
  row2Trailing?: ReactNode;
};

/** Frameless FilterBar for `HubSplitDirectoryPane` — parent owns border/bg. */
export function HubSplitDirectoryFilterBar({
  shortcutScope,
  toolbar,
  row2Leading,
  row2Actions,
  row2Trailing,
  ...rest
}: HubSplitDirectoryFilterBarProps) {
  return (
    <FilterBar
      layout="hub"
      frameless
      pinSticky={false}
      shortcutScope={shortcutScope}
      toolbar={toolbar}
      row2Leading={row2Leading}
      row2Actions={row2Actions}
      row2Trailing={row2Trailing}
      {...rest}
    />
  );
}
