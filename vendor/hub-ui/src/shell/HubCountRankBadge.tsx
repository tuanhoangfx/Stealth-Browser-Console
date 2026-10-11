import type { HubCountRankLetter } from "../lib/hub-count-rank";
import type { HubGlyphComponent } from "../types/filter-badge";

export type HubCountRankBadgeProps = {
  letter: HubCountRankLetter;
  title?: string;
};

/** Column-hint glyph — same pill as the directory cell. */
export function hubCountRankHintIcon(letter: HubCountRankLetter): HubGlyphComponent {
  function HubCountRankHintGlyph() {
    return <HubCountRankBadge letter={letter} />;
  }
  return HubCountRankHintGlyph;
}

/**
 * S–D pill — same Soft Gradient as P0005 `CustomerRankBadge`.
 * Classes live in `hub-users-table.css` (already on every hub directory).
 */
export function HubCountRankBadge({ letter, title }: HubCountRankBadgeProps) {
  return (
    <span
      data-hub-count-rank={letter}
      title={title}
      className={`hub-count-rank-badge hub-count-rank-badge--${letter}`}
    >
      {letter}
    </span>
  );
}
