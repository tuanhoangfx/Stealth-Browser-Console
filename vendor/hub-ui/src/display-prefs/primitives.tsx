import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { compactIconSize } from "../ui-scale";

export function TabButton({
  active,
  onClick,
  icon,
  children,
  scrollable = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  /** When true, tabs sit in a horizontal scroller instead of equal-width columns. */
  scrollable?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
        scrollable ? "shrink-0" : "flex-1"
      } ${
        active
          ? "bg-indigo-500/20 text-indigo-200 ring-1 ring-indigo-500/30"
          : "text-[var(--muted)]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export function SectionIcon({
  icon: Icon,
  className,
}: {
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  className: string;
}) {
  return <Icon size={compactIconSize(12)} className={className} aria-hidden />;
}

export function Section({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="hub-settings-subsection mb-3 last:mb-0">
      <div className="hub-settings-subsection__label mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--muted)]">
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}

/** Nested settings row inside a top-level TOC group (Header, KPI, App mode, …). */
export function SettingsSubsection({
  label,
  icon,
  headerActions,
  children,
  className = "",
}: {
  label: string;
  icon?: ReactNode;
  headerActions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`hub-settings-subsection mb-3 last:mb-0${className ? ` ${className}` : ""}`}>
      <div className="hub-settings-subsection__header mb-1.5 flex items-center justify-between gap-2">
        <div className="hub-settings-subsection__label flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-[var(--muted)]">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        {headerActions ? <div className="hub-settings-subsection__actions shrink-0">{headerActions}</div> : null}
      </div>
      {children ? <div className="hub-settings-subsection__body">{children}</div> : null}
    </div>
  );
}

export function ToggleRow({
  label,
  on,
  onChange,
  disabled = false,
  onDisabledClick,
}: {
  label: string;
  on: boolean;
  onChange: () => void;
  /** Gray out when cap reached (e.g. KPI max visible). */
  disabled?: boolean;
  /** Fires when user clicks a disabled row (e.g. show cap message in app log). */
  onDisabledClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) {
          onDisabledClick?.();
          return;
        }
        onChange();
      }}
      disabled={disabled && !onDisabledClick}
      aria-disabled={disabled || undefined}
      className={`hub-settings-toggle flex w-full items-center gap-2 rounded-md px-2 py-0.5 text-left text-[11px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400/45 focus-visible:outline-offset-1${
        disabled ? " hub-settings-toggle--disabled cursor-not-allowed opacity-40" : ""
      }`}
    >
      <span className={`hub-check-indicator${on ? " is-on" : ""}`} aria-hidden>
        {on ? <Check size={compactIconSize(9)} strokeWidth={2.75} /> : null}
      </span>
      <span className={on ? "text-[var(--text)]" : "text-[var(--muted)]"}>{label}</span>
    </button>
  );
}
