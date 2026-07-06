import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

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
  children,
  className = "",
  ariaLabel,
}: {
  id?: string;
  title: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <section
      id={id}
      className={`hub-tool-detail-panel${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
    >
      <div className="hub-tool-detail-panel__head">
        {Icon ? <Icon size={12} aria-hidden /> : null}
        {title}
      </div>
      <div className="hub-tool-detail-panel__body">{children}</div>
    </section>
  );
}

export function HubToolDetailRail({
  id,
  title,
  icon: Icon,
  children,
  scroll = true,
  className = "",
  ariaLabel,
}: {
  id?: string;
  title: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  scroll?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <aside
      id={id}
      className={`hub-tool-detail-rail${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel ?? (typeof title === "string" ? title : undefined)}
    >
      <div className="hub-tool-detail-rail__head">
        {Icon ? <Icon size={12} aria-hidden /> : null}
        {title}
      </div>
      <div
        className={`hub-tool-detail-rail__body${scroll ? " hub-tool-detail-rail__body--scroll" : ""}`}
      >
        {children}
      </div>
    </aside>
  );
}
