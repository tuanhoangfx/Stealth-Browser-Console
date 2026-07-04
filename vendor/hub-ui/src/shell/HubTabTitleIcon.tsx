import type { HubGlyphComponent } from "../types/filter-badge";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import { compactIconSize, HUB_CHROME_ICON_PX } from "../ui-scale";
import { HubBrandIcon } from "./HubBrandIcon";

type Props = {
  titleIcon: HubGlyphComponent;
  titleIconClass?: string;
  titleBrandIcon?: HubBrandIconId;
};

/** Tab header title glyph — Lucide tone icon or shared Hub brand mark. */
export function HubTabTitleIcon({ titleIcon: TitleIcon, titleIconClass = "", titleBrandIcon }: Props) {
  if (titleBrandIcon) {
    return <HubBrandIcon brandId={titleBrandIcon} size={HUB_CHROME_ICON_PX} />;
  }

  return (
    <TitleIcon
      size={compactIconSize(HUB_CHROME_ICON_PX)}
      className={`shrink-0 ${titleIconClass}`}
      aria-hidden
    />
  );
}
