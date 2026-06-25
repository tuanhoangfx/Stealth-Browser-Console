import { Check, ChevronDown, FolderOpen, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { compactIconSize } from "../ui-scale";
import { HUB_SHELL_LABEL_TYPO_CLASS } from "./hub-typography";

/** Golden filter trigger typography — matches `HUB_FILTER_DROPDOWN_ROW_CLASS` label weight/size. */
export const HUB_FILTER_DROPDOWN_TRIGGER_TYPO_CLASS = HUB_SHELL_LABEL_TYPO_CLASS;

/** Shared Hub filter dropdown trigger — FilterBar + folder pickers. */
export function hubFilterTriggerClass(active: boolean, extra = "") {
  return `inline-flex h-[var(--hub-control-h)] max-w-full items-center gap-1.5 rounded-lg border px-3 ${HUB_FILTER_DROPDOWN_TRIGGER_TYPO_CLASS} transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    active
      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-200"
      : "border-white/10 bg-[var(--panel-2)] text-[var(--text)] hover:bg-white/5"
  }${extra ? ` ${extra}` : ""}`;
}

export function folderFilterButtonLabel(
  label: string,
  selectedCount: number,
  soleName?: string,
  showAllLabel = true,
): string {
  if (selectedCount === 0) return showAllLabel ? `All ${label}` : label;
  if (selectedCount === 1) return soleName ?? label;
  return `${selectedCount} selected`;
}

type FilterOptionLike = { value: string; label: string };

/** Hover title when multi-select label is abbreviated (`2 selected`). */
export function multiFilterTriggerTitle(
  selectedValues: readonly string[],
  options: ReadonlyArray<FilterOptionLike>,
): string | undefined {
  if (selectedValues.length <= 1) return undefined;
  const names = selectedValues
    .map((v) => options.find((o) => o.value === v)?.label ?? v)
    .filter((name) => name.trim().length > 0);
  return names.length ? names.join(", ") : undefined;
}

type HubFilterDropdownTriggerProps = {
  active: boolean;
  open?: boolean;
  label: string;
  count?: number;
  iconColor?: string | null;
  Icon?: LucideIcon;
  icon?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  className?: string;
};

export function HubFilterDropdownTrigger({
  active,
  open = false,
  label,
  count,
  iconColor,
  Icon = FolderOpen,
  icon,
  disabled,
  onClick,
  title,
  className = "",
}: HubFilterDropdownTriggerProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={hubFilterTriggerClass(active, className)}
    >
      {icon ?? (
        <Icon
          size={compactIconSize(12)}
          className={`shrink-0 ${iconColor ? "" : "opacity-75"}`}
          style={iconColor ? { color: iconColor } : undefined}
          aria-hidden
        />
      )}
      <span className="min-w-0 max-w-[12rem] truncate">{label}</span>

      <ChevronDown
        size={compactIconSize(12)}
        className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        aria-hidden
      />
    </button>
  );
}

export function HubFilterDropdownCircle({ checked, indeterminate }: { checked: boolean; indeterminate?: boolean }) {
  return (
    <div
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-all ${
        checked
          ? "border-indigo-400 bg-indigo-500"
          : indeterminate
            ? "border-indigo-400 bg-indigo-500/30"
            : "border-white/25"
      }`}
      aria-hidden
    >
      {checked || indeterminate ? (
        indeterminate ? (
          <div className="h-1 w-2 rounded-full bg-white" />
        ) : (
          <Check size={9} className="text-white" />
        )
      ) : null}
    </div>
  );
}

/** Scrollable option list inside filter / period dropdown panels. */
export const HUB_FILTER_DROPDOWN_LIST_CLASS = "max-h-72 overflow-auto p-1";

export const HUB_FILTER_DROPDOWN_PANEL_CLASS =
  "anim-pop absolute top-full z-30 mt-1 w-72 rounded-xl border border-white/10 bg-[var(--panel)] shadow-xl shadow-black/40";

/** Portaled panel — fixed position, escapes modal overflow clipping. */
export const HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS =
  "anim-pop fixed z-[2600] w-72 rounded-xl border border-white/10 bg-[var(--panel)] shadow-xl shadow-black/40";

/** Golden filter panel row — All {label} + options share one weight (P0004 Group filter). */
export const HUB_FILTER_DROPDOWN_ROW_CLASS =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-white/5";

/** Emoji / glyph slot in filter trigger + option rows. */
export const HUB_FILTER_OPTION_EMOJI_CLASS = "shrink-0 text-base leading-none";

/** Brand logo in filter rows/trigger — styled by product CSS (light tile on dark dropdown). */
export const HUB_FILTER_BRAND_ICON_CLASS = "hub-filter-brand-icon";

export function filterDropdownPanelSearchPlaceholder(filterLabel: string) {
  return `Search ${filterLabel.toLowerCase()}…`;
}

type HubFilterDropdownPanelSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/** Compact search row at top of filter dropdown panels (multi-select + portal). */
export function HubFilterDropdownPanelSearch({
  value,
  onChange,
  placeholder = "Search…",
}: HubFilterDropdownPanelSearchProps) {
  return (
    <div className="border-b border-white/5 p-2">
      <div className="relative">
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="field h-[var(--hub-control-h)] w-full min-w-0 text-xs"
          style={{ paddingLeft: 10, paddingRight: 10 }}
        />
      </div>
    </div>
  );
}

