import type { FilterIconMeta } from "../types/filter-badge";
import { compactIconSize } from "../ui-scale";
import { hubBrandIconImgClass, type HubBrandIconShell } from "../shell/filter-dropdown-primitives";
import { splitChartLegendGlyph } from "./chart-legend-glyphs";

/** Chart legend row — brand / Lucide / emoji / color dot + label text (SSOT gap via `.hub-chart-legend-label`). */
export function ChartLegendLabelContent({
  label,
  iconSrc,
  iconShell,
  iconMeta,
  colorDot,
}: {
  label: string;
  iconSrc?: string;
  iconShell?: HubBrandIconShell;
  iconMeta?: FilterIconMeta | null;
  /** Donut slice color when no brand/Lucide/emoji glyph. */
  colorDot?: string;
}) {
  const { glyph, text } = splitChartLegendGlyph(label);
  const display = text || label;
  const Icon = iconMeta?.icon;

  return (
    <>
      {iconSrc ? (
        <img src={iconSrc} alt="" className={hubBrandIconImgClass(iconShell)} aria-hidden />
      ) : Icon ? (
        <Icon size={compactIconSize(11)} className={`shrink-0 ${iconMeta!.className}`} aria-hidden />
      ) : glyph ? (
        <span className="hub-chart-legend-label__glyph hub-chart-legend-label__glyph--emoji" aria-hidden>
          {glyph}
        </span>
      ) : colorDot ? (
        <span
          className="hub-chart-legend-label__glyph hub-chart-legend-label__glyph--dot"
          style={{ background: colorDot }}
          aria-hidden
        />
      ) : (
        <span className="hub-chart-legend-label__glyph" aria-hidden />
      )}
      <span className="hub-chart-legend-label__text">{display}</span>
    </>
  );
}
