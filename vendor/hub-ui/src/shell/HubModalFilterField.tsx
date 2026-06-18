import type { LucideIcon } from "lucide-react";
import { HubFormFieldLabel } from "./HubFormFieldLabel";
import { HubSingleFilterDropdown, type FilterOption } from "./FilterBar";

export type HubModalFilterFieldProps = {
  filterKey: string;
  label: string;
  icon?: LucideIcon;
  iconClassName?: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Modal form filter — field label row + dropdown trigger/panel always show `Label: value`.
 * Golden pattern for HubToolDetailModal forms (Add route, Share, etc.).
 */
export function HubModalFilterField({
  filterKey,
  label,
  icon,
  iconClassName,
  options,
  value,
  onChange,
  disabled,
  className = "",
}: HubModalFilterFieldProps) {
  return (
    <label className={`hub-modal-filter-field block min-w-0${className ? ` ${className}` : ""}`}>
      <HubFormFieldLabel icon={icon} iconClassName={iconClassName}>
        {label}
      </HubFormFieldLabel>
      <HubSingleFilterDropdown
        filterKey={filterKey}
        label={label}
        options={options}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="hub-modal-filter-field__dropdown w-full"
      />
    </label>
  );
}
