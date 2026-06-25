import type { LucideIcon } from "lucide-react";
import { compactIconSize, HUB_CHROME_ICON_PX } from "../ui-scale";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import { HubBrandIcon } from "./HubBrandIcon";
import { navIconClass, type NavIconTone } from "./sidebar-nav-tones";

export type HubNavIconProps = {
  icon: LucideIcon;
  iconTone: NavIconTone;
  active: boolean;
  brandIcon?: HubBrandIconId;
};

/** Sidebar nav glyph — Lucide tone icon or shared brand mark. */
export function HubNavIcon({ icon: Icon, iconTone, active, brandIcon }: HubNavIconProps) {
  const px = compactIconSize(HUB_CHROME_ICON_PX);

  if (brandIcon) {
    return <HubBrandIcon brandId={brandIcon} size={px} />;
  }

  return <Icon size={px} className={`shrink-0 ${navIconClass(iconTone, active)}`} aria-hidden />;
}
