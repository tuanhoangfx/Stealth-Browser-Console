import type { HubGlyphComponent } from "../types/filter-badge";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import { compactIconSize } from "../ui-scale";
import { HubBrandIcon } from "./HubBrandIcon";

type Props = {
  icon?: HubGlyphComponent;
  className?: string;
  size?: number;
  brandIcon?: HubBrandIconId;
};

/** Lucide glyph or shared Hub brand mark — KPI tiles, header stats, TOC. */
export function HubSemanticGlyph({ icon: Icon, className = "", size = 14, brandIcon }: Props) {
  if (brandIcon) {
    return <HubBrandIcon brandId={brandIcon} size={size} className={className} />;
  }
  if (!Icon) return null;
  return <Icon size={compactIconSize(size)} className={className} aria-hidden />;
}
