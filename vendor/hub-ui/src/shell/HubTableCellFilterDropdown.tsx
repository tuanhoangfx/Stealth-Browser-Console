import type { MouseEvent } from "react";
import { HubSingleFilterDropdown } from "./FilterBar";
import type { FilterOption } from "./FilterBar";

export type HubTableCellFilterDropdownProps = {
  filterKey: string;
  /** Screen-reader / fallback when value missing */
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Golden FilterBar chrome inside directory table cells — same trigger/panel as toolbar filters.
 * Replaces native `<select>` (OS dropdown ≠ hub filter panel).
 */
export function HubTableCellFilterDropdown({
  filterKey,
  label,
  options,
  value,
  onChange,
  disabled,
  className = "hub-table-cell-filter",
}: HubTableCellFilterDropdownProps) {
  function stopRowNav(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div className={className} onClick={stopRowNav} onMouseDown={stopRowNav}>
      <HubSingleFilterDropdown
        filterKey={filterKey}
        label={label}
        options={options}
        value={value}
        onChange={onChange}
        disabled={disabled}
        triggerFormat="value"
        usePortal
        className="w-full min-w-0"
      />
    </div>
  );
}
