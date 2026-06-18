import type { ElementType, ReactNode } from "react";
import { AppTabHeader, type TabHeaderMetaItem, type TabHeaderStatItem } from "./AppTabHeader";
import { useHubChromePrefs } from "./HubTabChrome";

export type HubListChromeHeaderProps = {
  ariaLabel: string;
  title: string;
  titleIcon: ElementType<{ size?: number; className?: string }>;
  titleIconClass?: string;
  metaItems?: TabHeaderMetaItem[];
  centerStats?: TabHeaderStatItem[];
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
      pinSticky={stackChrome ? false : headerPin}
      dividerBelow={stackChrome ? false : !searchPin}
      embedded={stackChrome}
      actions={actions}
    />
  );
}
