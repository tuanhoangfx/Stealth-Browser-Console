import { DIRECTORY_CELL_TRUNCATE } from "../lib/directory-cell-hover";
import { HubDirectoryValuePopover } from "../table/HubDirectoryValuePopover";

export type HubDirectoryEllipsisCellProps = {
  value: string;
  className?: string;
  /** Collapse internal whitespace (notes). */
  normalizeWhitespace?: boolean;
  /** @deprecated Prefer `hoverPopover` — richTooltip ignored. */
  richTooltip?: boolean;
  /** Hover popover with full value (multiline notes / plan fields). */
  hoverPopover?: boolean;
  popoverTitle?: string;
};

/** Read-only truncated directory cell — optional `hoverPopover` for Note/multiline (hub-tooltip-ssot). */
export function HubDirectoryEllipsisCell({
  value,
  className = "",
  normalizeWhitespace = false,
  hoverPopover = false,
  popoverTitle,
}: HubDirectoryEllipsisCellProps) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return <span className="hub-users-cell-muted">—</span>;
  }

  const text = normalizeWhitespace ? raw.replace(/\s+/g, " ") : raw;
  const cell = (
    <span className={`hub-users-name-title ${DIRECTORY_CELL_TRUNCATE} ${className}`.trim()}>
      {text}
    </span>
  );

  if (!hoverPopover) return cell;

  return (
    <HubDirectoryValuePopover value={raw} title={popoverTitle}>
      {cell}
    </HubDirectoryValuePopover>
  );
}
