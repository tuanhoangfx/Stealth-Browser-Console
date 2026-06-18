import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Ellipsis } from "lucide-react";
import { HUB_FILTER_DROPDOWN_PANEL_CLASS } from "./filter-dropdown-primitives";
import {
  HUB_BULK_ACTION_BTN_CLASS,
  HubBulkActionCountBadge,
  type HubBulkActionTone,
} from "./HubBulkActionButton";

export type HubDirectoryBulkMoreAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  title?: string;
  tone?: HubBulkActionTone;
  selectedCount?: number;
  onClick: () => void;
};

export type HubDirectoryBulkMoreMenuProps = {
  actions: HubDirectoryBulkMoreAction[];
  disabled?: boolean;
  selectedCount?: number;
  title?: string;
  footer?: ReactNode;
};

/** Overflow bulk actions — keeps filter row 2 compact (Dashboard / directory golden). */
export function HubDirectoryBulkMoreMenu({
  actions,
  disabled = false,
  selectedCount = 0,
  title = "More actions",
  footer,
}: HubDirectoryBulkMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={title}
        className={`${HUB_BULK_ACTION_BTN_CLASS} border border-white/10 bg-[var(--panel-2)] text-[var(--text)] hover:bg-white/5`}
      >
        <Ellipsis size={14} aria-hidden />
        More
        {selectedCount > 0 ? <HubBulkActionCountBadge count={selectedCount} tone="indigo" /> : null}
      </button>
      {open ? (
        <div role="menu" className={`${HUB_FILTER_DROPDOWN_PANEL_CLASS} right-0 w-52 py-1`}>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                title={action.title}
                onClick={() => {
                  action.onClick();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon size={14} className="shrink-0 opacity-80" aria-hidden />
                <span className="min-w-0 flex-1">{action.label}</span>
                {action.selectedCount != null && action.selectedCount > 0 ? (
                  <HubBulkActionCountBadge count={action.selectedCount} tone={action.tone ?? "indigo"} />
                ) : null}
              </button>
            );
          })}
          {footer ? <div className="border-t border-white/5 px-3 py-2">{footer}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
