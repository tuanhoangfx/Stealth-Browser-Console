import type { ReactNode } from "react";
import { HUB_DIRECTORY_TOOLBAR_TYPO_CLASS } from "./hub-typography";

export type HubBulkActionTone = "indigo" | "amber" | "emerald" | "rose" | "sky" | "neutral";

const TONE_CLASS: Record<HubBulkActionTone, string> = {
  indigo: "border-indigo-400/35 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20",
  emerald: "border-emerald-500/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
  rose: "border-rose-500/35 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25",
  sky: "border-sky-500/30 bg-sky-500/12 text-sky-100 hover:bg-sky-500/20",
  neutral:
    "border-white/10 bg-[var(--panel-2)] text-[var(--text)] hover:bg-white/5",
};

const BADGE_CLASS: Record<HubBulkActionTone, string> = {
  indigo: "bg-indigo-400",
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  sky: "bg-sky-400",
  neutral: "bg-white/80 text-[#0f1220]",
};

export const HUB_BULK_ACTION_BTN_CLASS = `inline-flex h-[var(--hub-control-h)] shrink-0 items-center gap-1.5 rounded-lg border px-3 ${HUB_DIRECTORY_TOOLBAR_TYPO_CLASS} transition-colors disabled:cursor-not-allowed disabled:opacity-40`;

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
}: HubBulkActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`${HUB_BULK_ACTION_BTN_CLASS} ${TONE_CLASS[tone]}`}
    >
      <span
        className={`shrink-0 opacity-90 [&_svg]:size-[13px] ${iconSpinning ? "[&_svg]:animate-spin" : ""}`}
      >
        {icon}
      </span>
      {label}
      {selectedCount != null && selectedCount > 0 ? (
        <HubBulkActionCountBadge count={selectedCount} tone={tone} />
      ) : null}
    </button>
  );
}
