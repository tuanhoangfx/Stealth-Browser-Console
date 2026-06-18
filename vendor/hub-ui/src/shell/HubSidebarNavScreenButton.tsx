import type { LucideIcon } from "lucide-react";
import { compactIconSize, HUB_CHROME_ICON_PX } from "../ui-scale";
import {
  navActiveBarClass,
  navActiveBgClass,
  navActiveTextClass,
  navIconClass,
  type NavIconTone,
} from "./sidebar-nav-tones";

export type HubSidebarNavScreenButtonProps = {
  label: string;
  icon: LucideIcon;
  iconTone: NavIconTone;
  active: boolean;
  badge?: number;
  onClick: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
};

/** Single top-level sidebar screen row (Dashboard, Hub, Logs, …). */
export function HubSidebarNavScreenButton({
  label,
  icon: Icon,
  iconTone,
  active,
  badge,
  onClick,
  onMouseEnter,
  onFocus,
}: HubSidebarNavScreenButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      className={`group relative flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all ${
        active
          ? `${navActiveBgClass(iconTone)} ${navActiveTextClass(iconTone)}`
          : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
      }`}
    >
      {active ? (
        <span
          className={`absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r ${navActiveBarClass(iconTone)}`}
        />
      ) : null}
      <Icon size={compactIconSize(HUB_CHROME_ICON_PX)} className={`shrink-0 ${navIconClass(iconTone, active)}`} />
      <span className="flex-1 text-left">{label}</span>
      {badge != null && badge > 0 ? (
        <span className="min-w-[1.125rem] rounded-full bg-amber-500/25 px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-amber-200">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
}
