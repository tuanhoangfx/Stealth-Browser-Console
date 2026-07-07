import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  hubDirectoryPopoverAlignClass,
  hubDirectoryPopoverPosition,
  type HubDirectoryPopoverAlign,
} from "../lib/hub-directory-popover";
import "../styles/hub-directory-popover.css";

export type HubDirectoryCellTooltipAlign = HubDirectoryPopoverAlign;

export type HubDirectoryCellTooltipProps = {
  content: string;
  children: ReactNode;
  align?: HubDirectoryCellTooltipAlign;
  /** When false, renders children only (short values use native title). */
  enabled?: boolean;
};

/** Portal popover for truncated directory cells — below anchor, hub-directory-popover SSOT. */
export function HubDirectoryCellTooltip({
  content,
  children,
  align = "start",
  enabled = true,
}: HubDirectoryCellTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const text = String(content ?? "").trim();

  const show = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    setPos(hubDirectoryPopoverPosition(el.getBoundingClientRect(), align));
    setOpen(true);
  }, [align]);

  const hide = useCallback(() => setOpen(false), []);

  if (!enabled || !text) {
    return <>{children}</>;
  }

  const alignClass = hubDirectoryPopoverAlignClass(align);

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            key={text}
            className={`hub-directory-popover hub-directory-popover--passive ${alignClass}`.trim()}
            style={{ top: pos.top, left: pos.left }}
            role="tooltip"
          >
            <p className="hub-directory-popover__body">{text}</p>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={anchorRef}
        className="hub-directory-popover-anchor hub-directory-popover-anchor--block"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {popover}
    </>
  );
}
