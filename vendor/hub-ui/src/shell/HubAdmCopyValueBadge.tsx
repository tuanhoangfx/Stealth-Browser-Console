import type { ReactNode } from "react";
import { HubCopyBadge } from "./HubCopyBadge";
import { HubDirectoryValuePopover } from "../table/HubDirectoryValuePopover";
import { HubDirectoryEmptyCell } from "../lib/directory-empty-label";

export type HubAdmCopyValueBadgeProps = {
  /** Full text copied + shown in hover popover (P0020 Full Info golden). */
  value: string;
  /** Popover title + copy action title base. */
  title: string;
  copyToastLabel?: string;
  /** Optional chip label; defaults to truncated `value` (HubCopyBadge SSOT). */
  label?: string;
  /** `warn` — amber chip (e.g. Notify Sample when days-left ≤ threshold). */
  tone?: "default" | "warn";
  className?: string;
  emptyFallback?: ReactNode;
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

  const toneClass =
    tone === "warn"
      ? "hub-adm-copy-value-badge--warn border-amber-400/45 bg-amber-500/10 text-amber-100 hover:border-amber-300/55 hover:bg-amber-500/15 hover:text-amber-50"
      : "";

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
