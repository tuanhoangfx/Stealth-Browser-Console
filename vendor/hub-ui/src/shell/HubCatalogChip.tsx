import { hubFilterOptionEmojiClass } from "./filter-dropdown-primitives";

export type HubCatalogChipProps = {
  label: string;
  emoji?: string;
  /** Dashed hairline — unset catalog (empty Position). */
  unset?: boolean;
  title?: string;
  className?: string;
};

/**
 * Hub catalog fragment — Team / Position chips.
 * Set = 1px hairline. Unset = dashed hairline. Typography = directory body (12px / 400).
 */
export function HubCatalogChip({
  label,
  emoji,
  unset = false,
  title,
  className = "",
}: HubCatalogChipProps) {
  return (
    <span
      className={`hub-catalog-chip${unset ? " hub-catalog-chip--unset" : ""}${className ? ` ${className}` : ""}`}
      title={title}
    >
      {emoji ? (
        <span className={hubFilterOptionEmojiClass()} aria-hidden>
          {emoji}
        </span>
      ) : null}
      <span className="hub-catalog-chip__label">{label}</span>
    </span>
  );
}
