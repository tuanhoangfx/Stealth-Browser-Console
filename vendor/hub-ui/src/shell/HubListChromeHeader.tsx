import type { ReactNode } from "react";
import type { HubGlyphComponent } from "../types/filter-badge";
import { AppTabHeader, type TabHeaderMetaItem, type TabHeaderStatItem } from "./AppTabHeader";
import { useHubChromePrefs } from "./HubTabChrome";

export type HubListChromeHeaderProps = {
  ariaLabel: string;
  title: string;
  titleIcon: HubGlyphComponent;
  titleIconClass?: string;
  metaItems?: TabHeaderMetaItem[];
  centerStats?: TabHeaderStatItem[];
  centerContent?: ReactNode;
  actions?: ReactNode;
};

/** Directory tab header — pin/embedded prefs wired from `configureHubChromePrefs`. */
export function HubListChromeHeader({
  ariaLabel,
  title,
  titleIcon,
  titleIconClass,
  metaItems = [],
  centerStats = [],
  centerContent,
  actions,
}: HubListChromeHeaderProps) {
  const { searchPin, headerPin, stackChrome } = useHubChromePrefs();

  return (
    <AppTabHeader
      ariaLabel={ariaLabel}
      titleIcon={titleIcon}
      titleIconClass={titleIconClass}
      title={title}
      metaItems={metaItems}
      centerStats={centerStats}
      centerContent={centerContent}
      pinSticky={stackChrome ? false : headerPin}
      dividerBelow={stackChrome ? false : !searchPin}
      embedded={stackChrome}
      actions={actions}
    />
  );
}
