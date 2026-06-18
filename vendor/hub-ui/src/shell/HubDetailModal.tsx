import { useEffect, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HubModalFrame } from "./HubModalFrame";

/** @deprecated Outer shell is unified via `--hub-modal-*` CSS; `compact` only keeps the legacy class name. */
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
}: HubDetailModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("hub-modal-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("hub-modal-open");
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const shellClasses = [
    "modal-shell",
    "modal-shell--tool-detail",
    size === "compact" ? "modal-shell--compact" : "",
    shellClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div
      className="modal-backdrop modal-backdrop--tool-detail"
      role="presentation"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <HubModalFrame onClose={onClose}>
        <div
          className={shellClasses}
          style={shellStyle}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabelledBy ? undefined : ariaLabel}
          aria-labelledby={ariaLabelledBy}
        >
          {header}
          {children}
          {footer}
        </div>
      </HubModalFrame>
    </div>,
    document.body,
  );
}
