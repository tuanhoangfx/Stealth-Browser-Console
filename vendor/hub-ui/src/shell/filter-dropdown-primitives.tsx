import { Check, ChevronDown, FolderOpen, type LucideIcon } from "lucide-react";
import { forwardRef, type ReactNode } from "react";
import { compactIconSize } from "../ui-scale";
import {
  HUB_SHELL_LABEL_TYPO_CLASS,
  HUB_DIRECTORY_TOOLBAR_TYPO_CLASS,
  HUB_DIRECTORY_BODY_VALUE_TYPO_SSOT,
  HUB_DIRECTORY_HEADER_LABEL_TYPO_SSOT,
} from "./hub-typography";

/** Golden filter trigger typography — matches `HUB_FILTER_DROPDOWN_ROW_CLASS` label weight/size. */
export const HUB_FILTER_DROPDOWN_TRIGGER_TYPO_CLASS = HUB_SHELL_LABEL_TYPO_CLASS;

/** Shared Hub filter dropdown trigger — FilterBar + folder pickers. */
export function hubFilterTriggerClass(
  active: boolean,
  extra = "",
  typoClass: string = HUB_FILTER_DROPDOWN_TRIGGER_TYPO_CLASS,
) {
  return `inline-flex h-[var(--hub-control-h)] max-w-full items-center hub-inline-gap-comfort rounded-lg border px-3 ${typoClass} transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    active
      ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-200"
      : "border-white/10 bg-[var(--panel-2)] text-[var(--text)] hover:bg-white/5"
  }${extra ? ` ${extra}` : ""}`;
}

export function folderFilterButtonLabel(
  label: string,
  selectedCount: number,
  soleName?: string,
  showAllLabel = false,
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
  /** Override trigger typography — directory toolbar row uses `HUB_DIRECTORY_TOOLBAR_TYPO_CLASS`. */
  typoClass?: string;
};

export const HubFilterDropdownTrigger = forwardRef<HTMLButtonElement, HubFilterDropdownTriggerProps>(
  function HubFilterDropdownTrigger(
    {
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
      typoClass,
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        onClick={onClick}
        title={title}
        className={hubFilterTriggerClass(active, className, typoClass)}
      >
        {icon ?? (
          <span className="inline-flex size-[13px] shrink-0 items-center justify-center leading-none">
            <Icon
              size={compactIconSize(13)}
              className={iconColor ? "" : "opacity-75"}
              style={iconColor ? { color: iconColor } : undefined}
              aria-hidden
            />
          </span>
        )}
        <span className="min-w-0 max-w-[12rem] truncate leading-none">{label}</span>

        <ChevronDown
          size={compactIconSize(12)}
          className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
    );
  },
);

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
export const HUB_SCROLLBAR_CLASS = "hub-scrollbar";
export const HUB_FILTER_DROPDOWN_LIST_CLASS = "hub-filter-dropdown-list hub-scrollbar max-h-72 overflow-y-auto overflow-x-hidden p-1 min-w-0";

export const HUB_FILTER_DROPDOWN_PANEL_CLASS =
  "anim-pop absolute top-full z-30 mt-1 w-72 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[var(--panel)] shadow-xl shadow-black/40";

/** Portaled panel — fixed position, escapes modal overflow clipping. */
export const HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS =
  "anim-pop fixed z-[4000] w-72 min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[var(--panel)] shadow-xl shadow-black/40";

/** Golden filter panel row — All {label} + options share one weight (P0004 Group filter). */
export const HUB_FILTER_DROPDOWN_ROW_CLASS =
  "flex w-full min-w-0 items-center hub-inline-gap-name rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-white/5";

export const HUB_FILTER_DROPDOWN_ROW_COMPACT_CLASS =
  "flex w-full min-w-0 items-center hub-inline-gap-comfort rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-white/5";

/** Filter panel row — value text mirrors directory table body (twofa vault). */
export const HUB_FILTER_DROPDOWN_ROW_DIRECTORY_VALUE_CLASS = `flex w-full min-w-0 items-center hub-inline-gap-comfort rounded-md px-2 py-1 ${HUB_DIRECTORY_BODY_VALUE_TYPO_SSOT} transition-colors hover:bg-white/5`;

export function hubFilterUsesDirectoryValueTypo(panelScope?: string): boolean {
  return panelScope === "twofa";
}

export function hubFilterDropdownRowClass(compact = false, directoryValue = false): string {
  if (directoryValue) return HUB_FILTER_DROPDOWN_ROW_DIRECTORY_VALUE_CLASS;
  return compact ? HUB_FILTER_DROPDOWN_ROW_COMPACT_CLASS : HUB_FILTER_DROPDOWN_ROW_CLASS;
}

export const HUB_FILTER_OPTION_EMOJI_CLASS = "shrink-0 text-base leading-none";

export function hubFilterOptionEmojiClass(extra = ""): string {
  return `hub-filter-option-emoji ${HUB_FILTER_OPTION_EMOJI_CLASS}${extra ? ` ${extra}` : ""}`;
}

export const HUB_FILTER_DROPDOWN_TRIGGER_COMPACT_TYPO_CLASS = HUB_DIRECTORY_TOOLBAR_TYPO_CLASS;

/** Trigger showing a selected filter value — same as directory table body. */
export const HUB_FILTER_DROPDOWN_TRIGGER_DIRECTORY_VALUE_TYPO_CLASS = HUB_DIRECTORY_BODY_VALUE_TYPO_SSOT;

/** Trigger showing facet label (Service, Status…) — same as directory table header. */
export const HUB_FILTER_DROPDOWN_TRIGGER_DIRECTORY_HEADER_TYPO_CLASS = HUB_DIRECTORY_HEADER_LABEL_TYPO_SSOT;

/** twofa directory filter trigger — header label vs single selected body value. */
export function hubFilterDirectoryTriggerTypoClass(selectedCount: number): string {
  return selectedCount === 1
    ? HUB_FILTER_DROPDOWN_TRIGGER_DIRECTORY_VALUE_TYPO_CLASS
    : HUB_FILTER_DROPDOWN_TRIGGER_DIRECTORY_HEADER_TYPO_CLASS;
}

/** Filter trigger / row glyph px — directory + compact toolbar rows use 12px; default 13px. */
export function hubFilterGlyphPx(opts?: { directoryParity?: boolean; compact?: boolean }): number {
  if (opts?.compact || opts?.directoryParity) return 12;
  return 13;
}

export const HUB_FILTER_BRAND_ICON_CLASS = "hub-filter-brand-icon hub-filter-brand-icon--tile";

export type HubBrandIconShell = "bare" | "tile" | "darkInk";

export function hubBrandIconImgClass(shell: HubBrandIconShell = "bare"): string {
  switch (shell) {
    case "darkInk":
      return "hub-filter-brand-icon hub-filter-brand-icon--dark-ink";
    case "tile":
      return HUB_FILTER_BRAND_ICON_CLASS;
    default:
      return "hub-filter-brand-icon-bare";
  }
}

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
