import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { HubDetailModal, type HubDetailModalSize } from "./HubDetailModal";
import { HubTocHighlightContent, HubTocSectionHighlightProvider } from "./HubTocSectionHighlight";

export const HUB_TOOL_DETAIL_TITLE_ID = "hub-tool-detail-modal-title";
/** Scroll container when modal has TOC — content column only. */
export const HUB_TOOL_DETAIL_SCROLL_CLASS = "hub-tool-detail-modal__scroll";
export const HUB_TOOL_DETAIL_SCROLL_ROOT = ".hub-tool-detail-modal__scroll";
/** Fallback single-column body (no TOC). */
export const HUB_TOOL_DETAIL_BODY_SCROLL_CLASS = "modal-shell__scroll modal-shell__scroll--user-access";

export type HubToolDetailModalTocLayoutProps = {
  toc: ReactNode;
  children: ReactNode;
  className?: string;
};

/** TOC left · content right — scroll isolated to content column (aligned tops). */
export function HubToolDetailModalTocLayout({ toc, children, className = "" }: HubToolDetailModalTocLayoutProps) {
  return (
    <div className={`hub-tool-detail-modal__layout${className ? ` ${className}` : ""}`}>
      <aside className="hub-tool-detail-modal__toc">{toc}</aside>
      <div className="hub-tool-detail-modal__content">
        <div className={HUB_TOOL_DETAIL_SCROLL_CLASS}>
          <div className="hub-tool-detail-modal__scroll-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}

export type HubToolDetailModalPrimaryActionProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  danger?: boolean;
  icon?: LucideIcon;
};

export function HubToolDetailModalPrimaryAction({
  label,
  onClick,
  disabled,
  busy,
  danger,
  icon: Icon,
}: HubToolDetailModalPrimaryActionProps) {
  return (
    <button
      type="button"
      className={`hub-tool-detail-modal__confirm${danger ? " hub-tool-detail-modal__confirm--danger" : ""}`}
      disabled={disabled || busy}
      onClick={onClick}
      aria-label={busy ? "Please wait" : label}
    >
      {busy ? (
        <Loader2 size={16} className="hub-tool-detail-modal__confirm-icon--busy animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon size={16} aria-hidden />
      ) : null}
      <span>{busy ? "Please wait…" : label}</span>
    </button>
  );
}

export function HubToolDetailModalSecondaryAction({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="hub-tool-detail-modal__secondary"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export type HubToolDetailModalProps = {
  open?: boolean;
  onClose: () => void;
  /** When omitted, use custom `header` only. */
  title?: string;
  titleId?: string;
  headerImageUrl?: string;
  headerIcon?: LucideIcon;
  headerIconClassName?: string;
  headerLeading?: ReactNode;
  headerTrailing?: ReactNode;
  /** Full header override (User access, etc.). */
  header?: ReactNode;
  /** Left TOC column. */
  toc?: ReactNode;
  /** When set with `toc`, pointer + scroll highlight matching TOC labels. */
  sectionIds?: string[];
  /** Scroll root for TOC spy + jump (default modal content column). */
  scrollRootSelector?: string;
  footer?: ReactNode;
  shellClassName?: string;
  shellStyle?: CSSProperties;
  bodyClassName?: string;
  size?: HubDetailModalSize;
  ariaLabelledBy?: string;
  children: ReactNode;
};

/**
 * Golden tool-detail modal — header identity · TOC left · content right · footer actions.
 * Reference: P0020 Cookie Auto extension download FAB.
 */
export function HubToolDetailModal({
  open = true,
  onClose,
  title,
  titleId = HUB_TOOL_DETAIL_TITLE_ID,
  headerImageUrl,
  headerIcon: HeaderIcon,
  headerIconClassName = "text-indigo-200",
  headerLeading,
  headerTrailing,
  header,
  toc,
  sectionIds,
  scrollRootSelector = HUB_TOOL_DETAIL_SCROLL_ROOT,
  footer,
  shellClassName = "",
  shellStyle,
  bodyClassName = "",
  size = "detail",
  ariaLabelledBy,
  children,
}: HubToolDetailModalProps) {
  const resolvedHeader =
    header ??
    (title ? (
      <header className="user-access-modal__header">
        <div className="user-access-modal__header-main min-w-0 flex-1">
          {headerLeading ??
            (headerImageUrl ? (
              <img
                src={headerImageUrl}
                alt=""
                width={32}
                height={32}
                className="user-access-modal__avatar h-8 w-8 shrink-0 rounded-lg object-cover"
              />
            ) : HeaderIcon ? (
              <span
                className="user-access-modal__avatar grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-500/20"
                aria-hidden
              >
                <HeaderIcon size={18} className={headerIconClassName} />
              </span>
            ) : null)}
          <h2
            id={titleId}
            className="user-access-modal__header-name min-w-0 truncate text-sm font-semibold text-[var(--text)]"
          >
            {title}
          </h2>
          {headerTrailing}
        </div>
      </header>
    ) : undefined);

  const resolvedFooter = footer ? (
    <footer className="hub-tool-detail-modal__footer">
      <div className="hub-tool-detail-modal__footer-inner">{footer}</div>
    </footer>
  ) : undefined;

  const body = toc ? (
    (() => {
      const layout = (
        <HubToolDetailModalTocLayout toc={toc}>
          {sectionIds?.length ? (
            <HubTocHighlightContent className={bodyClassName || undefined}>{children}</HubTocHighlightContent>
          ) : (
            children
          )}
        </HubToolDetailModalTocLayout>
      );
      const wrapped =
        sectionIds?.length ? (
          <HubTocSectionHighlightProvider sectionIds={sectionIds} scrollRootSelector={scrollRootSelector}>
            {layout}
          </HubTocSectionHighlightProvider>
        ) : (
          layout
        );
      return <div className="hub-tool-detail-modal__body">{wrapped}</div>;
    })()
  ) : (
    <div className={`${HUB_TOOL_DETAIL_BODY_SCROLL_CLASS}${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
  );

  return (
    <HubDetailModal
      open={open}
      onClose={onClose}
      ariaLabelledBy={ariaLabelledBy ?? (title ? titleId : undefined)}
      size={size}
      shellClassName={`hub-tool-detail-modal${shellClassName ? ` ${shellClassName}` : ""}`}
      shellStyle={shellStyle}
      header={resolvedHeader}
      footer={resolvedFooter}
    >
      {body}
    </HubDetailModal>
  );
}
