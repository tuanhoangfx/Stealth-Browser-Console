import type { ReactNode } from "react";
import {
  HubDirectoryColumnHint,
  type HubDirectoryColumnHintContent,
} from "../table/HubDirectoryColumnHint";
import { HUB_DIRECTORY_TOOLBAR_TYPO_CLASS } from "./hub-typography";

export type HubBulkActionTone = "indigo" | "amber" | "emerald" | "rose" | "sky" | "neutral";

const TONE_CLASS: Record<HubBulkActionTone, string> = {
  indigo:
    "border-indigo-400/35 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25 disabled:border-indigo-400/28 disabled:bg-indigo-500/12 disabled:text-indigo-100/90",
  amber:
    "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20 disabled:border-amber-500/25 disabled:bg-amber-500/10 disabled:text-amber-100/90",
  emerald:
    "border-emerald-500/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 disabled:border-emerald-500/28 disabled:bg-emerald-500/12 disabled:text-emerald-100/90",
  rose:
    "border-rose-500/35 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25 disabled:border-rose-500/28 disabled:bg-rose-500/12 disabled:text-rose-100/90",
  sky:
    "border-sky-500/30 bg-sky-500/12 text-sky-100 hover:bg-sky-500/20 disabled:border-sky-500/25 disabled:bg-sky-500/10 disabled:text-sky-100/90",
  neutral:
    "border-white/10 bg-[var(--panel-2)] text-[var(--text)] hover:bg-white/5 disabled:border-white/8 disabled:bg-white/[0.03] disabled:text-[var(--muted)]",
};

const BADGE_CLASS: Record<HubBulkActionTone, string> = {
  indigo: "bg-indigo-400",
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  sky: "bg-sky-400",
  neutral: "bg-white/80 text-[#0f1220]",
};

export const HUB_BULK_ACTION_BTN_CLASS = `hub-bulk-action-btn relative inline-flex h-[var(--hub-control-h)] shrink-0 items-center gap-1.5 rounded-lg border px-3 ${HUB_DIRECTORY_TOOLBAR_TYPO_CLASS} transition-colors disabled:cursor-not-allowed`;

export type HubBulkActionCountBadgeProps = {
  count: number;
  tone?: HubBulkActionTone;
};

export function HubBulkActionCountBadge({ count, tone = "indigo" }: HubBulkActionCountBadgeProps) {
  return (
    <span
      className={`grid h-4 min-w-[var(--hub-count-badge-min-w)] place-items-center rounded-full px-1 text-[9px] font-bold text-[#0f1220] ${BADGE_CLASS[tone]}`}
    >
      {count}
    </span>
  );
}

export type HubBulkActionButtonProps = {
  icon: ReactNode;
  label: string;
  title: string;
  tone?: HubBulkActionTone;
  disabled?: boolean;
  selectedCount?: number;
  iconSpinning?: boolean;
  onClick: () => void;
  /** Popover hint on label — replaces native `title` when set. */
  labelHint?: HubDirectoryColumnHintContent;
  /** Custom label node (e.g. fixed-width Select/Unselect) — still uses `label` for a11y text. */
  labelNode?: ReactNode;
};

/** Golden bulk-action CTA — filter row 2 (Pin, Refresh, Edit, Sync, …). */
export function HubBulkActionButton({
  icon,
  label,
  title,
  tone = "indigo",
  disabled = false,
  selectedCount,
  iconSpinning = false,
  onClick,
  labelHint,
  labelNode,
}: HubBulkActionButtonProps) {
  const labelNodeInner = labelNode ?? <span>{label}</span>;
  const labelContent = (
    <span className="hub-bulk-action-btn__label">
      {labelHint ? (
        <HubDirectoryColumnHint content={labelHint}>{labelNodeInner}</HubDirectoryColumnHint>
      ) : (
        labelNodeInner
      )}
    </span>
  );

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={labelHint ? undefined : title}
      aria-label={label}
      className={`${HUB_BULK_ACTION_BTN_CLASS} ${TONE_CLASS[tone]}`}
    >
      <span
        className={`shrink-0 [&_svg]:size-[13px] [&_svg]:opacity-100 ${disabled ? "" : "opacity-90"} ${iconSpinning ? "[&_svg]:animate-spin" : ""}`}
      >
        {icon}
      </span>
      {labelContent}
      {selectedCount != null && selectedCount > 0 ? (
        <HubBulkActionCountBadge count={selectedCount} tone={tone} />
      ) : null}
    </button>
  );
}
