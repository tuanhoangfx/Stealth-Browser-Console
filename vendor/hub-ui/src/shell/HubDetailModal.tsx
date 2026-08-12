import { useEffect, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HubModalFrame } from "./HubModalFrame";

/** `compact` = centered form backdrop (no sidebar pad) + max-w frame. `detail` = Settings/Log scale. */
export type HubDetailModalSize = "detail" | "compact";

export type HubDetailModalProps = {
  /** When false, renders nothing. Default true when mounted. */
  open?: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  size?: HubDetailModalSize;
  header?: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
  shellClassName?: string;
  shellStyle?: CSSProperties;
  /**
   * Extra classes on HubModalFrame — compact defaults to `w-full max-w-md`
   * so shell width matches the frame (close button stays on the panel corner).
   */
  frameClassName?: string;
  /** Tab/page inline — no portal, backdrop, escape, or body scroll lock. */
  embedded?: boolean;
};

/** Golden tool-detail modal — portal, backdrop, edge close, escape, body scroll lock. */
export function HubDetailModal({
  open = true,
  onClose,
  children,
  ariaLabel,
  ariaLabelledBy,
  size = "detail",
  header,
  footer,
  closeOnBackdrop = true,
  shellClassName = "",
  shellStyle,
  frameClassName,
  embedded = false,
}: HubDetailModalProps) {
  useEffect(() => {
    if (!open || embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("hub-modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("hub-modal-open");
    };
  }, [embedded, open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const isCompact = size === "compact";
  const shellClasses = [
    "modal-shell",
    "modal-shell--tool-detail",
    isCompact ? "modal-shell--compact" : "",
    isCompact ? "hub-tool-detail-modal--fit" : "",
    embedded ? "hub-tool-detail-modal--embedded" : "",
    shellClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const shell = (
    <div
      className={shellClasses}
      style={shellStyle}
      role={embedded ? "region" : "dialog"}
      aria-modal={embedded ? undefined : true}
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      {header}
      {children}
      {footer}
    </div>
  );

  if (embedded) return shell;

  const resolvedFrameClass =
    frameClassName ?? (isCompact ? "w-full max-w-md" : "");

  return createPortal(
    <div
      className={
        isCompact
          ? "modal-backdrop modal-backdrop--compact"
          : "modal-backdrop modal-backdrop--tool-detail"
      }
      role="presentation"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <HubModalFrame onClose={onClose} className={resolvedFrameClass}>
        {shell}
      </HubModalFrame>
    </div>,
    document.body,
  );
}
