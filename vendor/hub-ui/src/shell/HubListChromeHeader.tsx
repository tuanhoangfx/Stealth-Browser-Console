import { useMemo, type ReactNode } from "react";
import type { HubGlyphComponent } from "../types/filter-badge";
import { AppTabHeader, type TabHeaderMetaItem, type TabHeaderStatItem, hubMetaActivityAtString } from "./AppTabHeader";
import { HubVersionReleaseNotes } from "./HubVersionReleaseNotes";
import { applyHubListVersionReleaseNotesMeta } from "./hub-list-chrome-version-meta";
import { useHubChromePrefs } from "./HubTabChrome";

export type HubListChromeHeaderProps = {
  ariaLabel: string;
  title: string;
  titleIcon: HubGlyphComponent;
  titleIconClass?: string;
  metaItems?: TabHeaderMetaItem[];
  /** Tool code — release-notes badge beside the first (version) meta item (WorkspaceTabHeader parity). */
  versionReleaseNotesCode?: string;
  versionReleaseNotesBundleStale?: boolean;
  versionReleaseNotesOnBundleReload?: () => void;
  centerStats?: TabHeaderStatItem[];
  centerContent?: ReactNode;
  /** Sparse status before center stats (e.g. Start Shift toolbar). */
  statusSlot?: ReactNode;
  actions?: ReactNode;
};

/** Directory tab header — pin/embedded prefs wired from `configureHubChromePrefs`. */
export function HubListChromeHeader({
  ariaLabel,
  title,
  titleIcon,
  titleIconClass,
  metaItems = [],
  versionReleaseNotesCode,
  versionReleaseNotesBundleStale = false,
  versionReleaseNotesOnBundleReload,
  centerStats = [],
  centerContent,
  statusSlot,
  actions,
}: HubListChromeHeaderProps) {
  const { searchPin, headerPin, stackChrome } = useHubChromePrefs();

  const resolvedMetaItems = useMemo(() => {
    if (!versionReleaseNotesCode || !metaItems[0]) return metaItems;
    const badge = (
      <HubVersionReleaseNotes
        code={versionReleaseNotesCode}
        version={metaItems[0].value}
        publishedAt={hubMetaActivityAtString(metaItems[0].activityAt)}
        bundleStale={versionReleaseNotesBundleStale}
        onBundleReload={versionReleaseNotesOnBundleReload}
      />
    );
    return applyHubListVersionReleaseNotesMeta(metaItems, badge);
  }, [
    metaItems,
    versionReleaseNotesBundleStale,
    versionReleaseNotesCode,
    versionReleaseNotesOnBundleReload,
  ]);

  return (
    <AppTabHeader
      ariaLabel={ariaLabel}
      titleIcon={titleIcon}
      titleIconClass={titleIconClass}
      title={title}
      metaItems={resolvedMetaItems}
      centerStats={centerStats}
      centerContent={centerContent}
      statusSlot={statusSlot}
      pinSticky={stackChrome ? false : headerPin}
      dividerBelow={stackChrome ? false : !searchPin}
      embedded={stackChrome}
      actions={actions}
    />
  );
}
