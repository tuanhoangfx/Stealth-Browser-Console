import type { FilterIconMeta } from "../types/filter-badge";
import { compactIconSize } from "../ui-scale";
import { hubBrandIconImgClass, hubFilterOptionEmojiClass, type HubBrandIconShell } from "../shell/filter-dropdown-primitives";
import { splitChartLegendGlyph } from "./chart-legend-glyphs";

/** Chart legend row — brand / Lucide / emoji / color dot + label text (SSOT gap via `.hub-chart-legend-label`). */
export function ChartLegendLabelContent({
  label,
  iconSrc,
  iconShell,
  iconMeta,
  emojiGlyph,
  colorDot,
}: {
  label: string;
  iconSrc?: string;
  iconShell?: HubBrandIconShell;
  iconMeta?: FilterIconMeta | null;
  /** Sticker emoji — takes precedence over label prefix glyph. */
  emojiGlyph?: string;
  /** Heat / donut slice color — preferred over Lucide when set. */
  colorDot?: string;
}) {
  const { glyph: labelGlyph, text } = splitChartLegendGlyph(label);
  const glyph = emojiGlyph ?? labelGlyph;
  const display = text || label;
  const Icon = iconMeta?.icon;

  return (
    <>
      {iconSrc ? (
        <img src={iconSrc} alt="" className={hubBrandIconImgClass(iconShell)} aria-hidden />
      ) : colorDot ? (
        <span
          className="hub-chart-legend-label__glyph hub-chart-legend-label__glyph--dot"
          style={{ background: colorDot }}
          aria-hidden
        />
      ) : glyph ? (
        <span className={hubFilterOptionEmojiClass()} aria-hidden>
          {glyph}
        </span>
      ) : Icon ? (
        <Icon size={compactIconSize(11)} className={`shrink-0 ${iconMeta!.className}`} aria-hidden />
      ) : (
        <span className="hub-chart-legend-label__glyph" aria-hidden />
      )}
      <span className="hub-chart-legend-label__text" style={colorDot ? { color: colorDot } : undefined}>
        {display}
      </span>
    </>
  );
}
