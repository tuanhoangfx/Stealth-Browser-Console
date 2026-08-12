import { useMemo, type ReactNode } from "react";
import { Tag } from "lucide-react";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import type { HubGlyphComponent } from "../types/filter-badge";
import {
  AppTabHeader,
  type TabHeaderMetaItem,
  type TabHeaderStatItem,
  type TabTitleMenuItem, hubMetaActivityAtString } from "./AppTabHeader";
import { buildVersionMetaItems } from "./workspace-tab-header-meta";
import { HubVersionReleaseNotes } from "./HubVersionReleaseNotes";

export type WorkspaceTabHeaderProps = {
  ariaLabel: string;
  titleIcon: HubGlyphComponent;
  titleIconClass?: string;
  titleBrandIcon?: HubBrandIconId;
  /** Custom SVG/raster tab mark — takes precedence over Lucide/brand when set. */
  titleIconSrc?: string;
  /** Sheet-parity emoji sticker — takes precedence over `titleIconSrc` / Lucide when set. */
  titleEmojiGlyph?: string;
  title: string;
  titleMenu?: TabTitleMenuItem[];
  activeTitleMenuId?: string;
  onTitleMenuSelect?: (id: string) => void;
  /** e.g. `v4.3.42` — pair with `publishedAt` for activity timestamp label */
  versionLine: string;
  /** ISO release/deploy time — activity dot + relative/stale label in header meta */
  publishedAt?: string | null;
  versionLive?: boolean;
  /** Update / freshness icon beside version label (HubVersionUpdateStatusIcon). */
  versionAfter?: ReactNode;
  /**
   * Tool code (e.g. "P0020") — HubVersionReleaseNotes beside version meta.
   * When set, this is the single Latest/Update/Download affordance (prefer over `versionAfter`).
   */
  versionReleaseNotesCode?: string;
  /** Web bundle behind running tab — Download icon + reload (merged into release-notes trigger). */
  versionReleaseNotesBundleStale?: boolean;
  versionReleaseNotesOnBundleReload?: () => void;
  extraMetaItems?: TabHeaderMetaItem[];
  centerStats: TabHeaderStatItem[];
  /** Sparse vault/sync status before center stats — idle null. */
  statusSlot?: ReactNode;
  pinSticky?: boolean;
  dividerBelow?: boolean;
  embedded?: boolean;
  actions?: ReactNode;
};

/**
 * Shared workspace tab header (P0004 Hub layout):
 * title · session · version/release · status · center stats · actions.
 */
export function WorkspaceTabHeader({
  versionLine,
  publishedAt,
  versionLive,
  versionAfter,
  versionReleaseNotesCode,
  versionReleaseNotesBundleStale = false,
  versionReleaseNotesOnBundleReload,
  extraMetaItems = [],
  centerStats,
  statusSlot,
  ...header
}: WorkspaceTabHeaderProps) {
  const metaItems = useMemo(() => {
    let items: TabHeaderMetaItem[];
    if (publishedAt) {
      const semver = versionLine.match(/^v[\d.]+/i)?.[0]?.replace(/^v/i, "") ?? versionLine.replace(/^v/i, "");
      items = buildVersionMetaItems(semver, publishedAt, versionLive, extraMetaItems);
    } else {
      items = [
        {
          icon: Tag,
          value: versionLine,
          live: versionLive,
        } as TabHeaderMetaItem,
        ...extraMetaItems,
      ];
    }
    const releaseNotesBadge =
      versionReleaseNotesCode && items[0] ? (
        <HubVersionReleaseNotes
          code={versionReleaseNotesCode}
          version={items[0].value}
          publishedAt={hubMetaActivityAtString(publishedAt ?? items[0].activityAt)}
          bundleStale={versionReleaseNotesBundleStale}
          onBundleReload={versionReleaseNotesOnBundleReload}
        />
      ) : null;
    // Single icon SSOT: release-notes owns Latest/Update/Download when present.
    const afterNode = releaseNotesBadge ?? versionAfter;
    const after = afterNode ? (
      <span className="inline-flex shrink-0 items-center gap-1">{afterNode}</span>
    ) : undefined;
    if (after && items[0]) {
      items = [{ ...items[0], after }, ...items.slice(1)];
    }
    return items;
  }, [
    extraMetaItems,
    publishedAt,
    versionAfter,
    versionLine,
    versionLive,
    versionReleaseNotesBundleStale,
    versionReleaseNotesCode,
    versionReleaseNotesOnBundleReload,
  ]);

  return (
    <AppTabHeader {...header} metaItems={metaItems} centerStats={centerStats} statusSlot={statusSlot} />
  );
}

export type { TabHeaderMetaItem, TabHeaderStatItem, TabTitleMenuItem };
