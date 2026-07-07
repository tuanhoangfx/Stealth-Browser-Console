import { DIRECTORY_CELL_TRUNCATE } from "../lib/directory-cell-hover";

export type HubDirectoryEllipsisCellProps = {
  value: string;
  className?: string;
  /** Collapse internal whitespace (notes). */
  normalizeWhitespace?: boolean;
  /** @deprecated Cell tooltips removed — header hints only. */
  richTooltip?: boolean;
};

/** Read-only truncated directory cell — no hover tooltip (header hints only). */
export function HubDirectoryEllipsisCell({
  value,
  className = "",
  normalizeWhitespace = false,
}: HubDirectoryEllipsisCellProps) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return <span className="hub-users-cell-muted">—</span>;
  }

  const text = normalizeWhitespace ? raw.replace(/\s+/g, " ") : raw;

  return (
    <span className={`hub-users-name-title ${DIRECTORY_CELL_TRUNCATE} ${className}`.trim()}>
      {text}
    </span>
  );
}
