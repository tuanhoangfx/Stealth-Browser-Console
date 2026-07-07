import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HUB_ADM_TYPE_NAV_CLASS } from "./hubAccountDetailModal";

/** Main + right rail — P0020 Account detail golden split. */
export function HubToolDetailSplitLayout({
  main,
  rail,
  className = "",
}: {
  main: ReactNode;
  rail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`hub-tool-detail-split${className ? ` ${className}` : ""}`}>
      <div className="hub-tool-detail-split__main">{main}</div>
      {rail ? <div className="hub-tool-detail-split__rail">{rail}</div> : null}
    </div>
  );
}

export function HubToolDetailPanel({
  id,
  title,
  icon: Icon,
  iconClassName,
  headExtra,
  children,
  className = "",
  bodyClassName = "",
  ariaLabel,
}: {
  id?: string;
  title: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  /** Slot below panel head — meta row, filters, etc. */
  headExtra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
}) {
  return (
    <section
      id={id}
      className={`hub-tool-detail-panel${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
    >
      <div className={`hub-tool-detail-panel__head ${HUB_ADM_TYPE_NAV_CLASS}`}>
        {Icon ? <Icon size={12} className={iconClassName} aria-hidden /> : null}
        {title}
      </div>
      {headExtra ? <div className="hub-tool-detail-panel__head-extra">{headExtra}</div> : null}
      <div className={`hub-tool-detail-panel__body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
    </section>
  );
}

export function HubToolDetailRail({
  id,
  title,
  icon: Icon,
  iconClassName,
  children,
  scroll = true,
  className = "",
  bodyClassName = "",
  ariaLabel,
}: {
  id?: string;
  title: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  children: ReactNode;
  scroll?: boolean;
  className?: string;
  bodyClassName?: string;
  ariaLabel?: string;
}) {
  return (
    <aside
      id={id}
      className={`hub-tool-detail-rail${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
    >
      <div className={`hub-tool-detail-rail__head ${HUB_ADM_TYPE_NAV_CLASS}`}>
        {Icon ? <Icon size={12} className={iconClassName} aria-hidden /> : null}
        {title}
      </div>
      <div
        className={`hub-tool-detail-rail__body${scroll ? " hub-tool-detail-rail__body--scroll" : ""}${bodyClassName ? ` ${bodyClassName}` : ""}`}
      >
        {children}
      </div>
    </aside>
  );
}
