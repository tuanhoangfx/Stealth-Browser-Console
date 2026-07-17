import type { ReactNode } from "react";
import { HubCopyBadge } from "./HubCopyBadge";
import { HubDirectoryValuePopover } from "../table/HubDirectoryValuePopover";
import { HubDirectoryEmptyCell } from "../lib/directory-empty-label";

/**
 * Semantic chip tones — status-driven colour SSOT (P0005 Order Sample columns):
 * `warn` amber (pending/plan) · `info` sky (processing) · `muted` slate (cancel) ·
 * `success` emerald (completed/appeal/…) · `orange` (guarantee update).
 */
export type HubAdmCopyValueBadgeTone =
  | "default"
  | "warn"
  | "info"
  | "muted"
  | "success"
  | "orange";

export type HubAdmCopyValueBadgeProps = {
  /** Full text copied + shown in hover popover (P0020 Full Info golden). */
  value: string;
  /** Popover title + copy action title base. */
  title: string;
  copyToastLabel?: string;
  /** Optional chip label; defaults to truncated `value` (HubCopyBadge SSOT). */
  label?: string;
  /** Semantic tone — see {@link HubAdmCopyValueBadgeTone}. */
  tone?: HubAdmCopyValueBadgeTone;
  className?: string;
  emptyFallback?: ReactNode;
};

const HUB_ADM_COPY_VALUE_BADGE_TONE_CLASS: Record<HubAdmCopyValueBadgeTone, string> = {
  default: "",
  warn: "hub-adm-copy-value-badge--warn border-amber-400/45 bg-amber-500/10 text-amber-100 hover:border-amber-300/55 hover:bg-amber-500/15 hover:text-amber-50",
  info: "hub-adm-copy-value-badge--info border-sky-400/45 bg-sky-500/10 text-sky-100 hover:border-sky-300/55 hover:bg-sky-500/15 hover:text-sky-50",
  muted: "hub-adm-copy-value-badge--muted border-slate-400/40 bg-slate-500/10 text-slate-200 hover:border-slate-300/50 hover:bg-slate-500/15 hover:text-slate-100",
  success: "hub-adm-copy-value-badge--success border-emerald-400/45 bg-emerald-500/10 text-emerald-100 hover:border-emerald-300/55 hover:bg-emerald-500/15 hover:text-emerald-50",
  orange: "hub-adm-copy-value-badge--orange border-orange-400/45 bg-orange-500/10 text-orange-100 hover:border-orange-300/55 hover:bg-orange-500/15 hover:text-orange-50",
};

/**
 * Account-detail read-only copy chip + dark hover popover — P0020 Mail/Service Full Info SSOT.
 *
 * Use inside `HubAdmReadonlyField` with `valueLayout="inline"`.
 */
export function HubAdmCopyValueBadge({
  value,
  title,
  copyToastLabel,
  label,
  tone = "default",
  className = "",
  emptyFallback,
}: HubAdmCopyValueBadgeProps) {
  const text = String(value ?? "").trim();
  if (!text) {
    return emptyFallback ?? <HubDirectoryEmptyCell className="hub-users-cell-muted" />;
  }

  const toneClass = HUB_ADM_COPY_VALUE_BADGE_TONE_CLASS[tone] ?? "";

  return (
    <div
      className={`min-w-0 max-w-full${className ? ` ${className}` : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <HubDirectoryValuePopover value={text} title={title} className="block min-w-0 max-w-full">
        <HubCopyBadge
          value={text}
          label={label}
          title={`Copy ${title}`}
          copyToastLabel={copyToastLabel}
          className={`hub-adm-type-mono max-w-full${toneClass ? ` ${toneClass}` : ""}`}
        />
      </HubDirectoryValuePopover>
    </div>
  );
}
