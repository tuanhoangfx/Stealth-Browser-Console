import { useMemo, type ElementType, type ReactNode } from "react";
import { Tag } from "lucide-react";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import {
  AppTabHeader,
  type TabHeaderMetaItem,
  type TabHeaderStatItem,
  type TabTitleMenuItem,
} from "./AppTabHeader";
import { buildVersionMetaItems } from "./workspace-tab-header-meta";

export type WorkspaceTabHeaderProps = {
  ariaLabel: string;
  titleIcon: ElementType<{ size?: number; className?: string }>;
  titleIconClass?: string;
  titleBrandIcon?: HubBrandIconId;
  title: string;
  titleMenu?: TabTitleMenuItem[];
  activeTitleMenuId?: string;
  onTitleMenuSelect?: (id: string) => void;
  /** e.g. `v4.3.42` — pair with `publishedAt` for activity timestamp label */
  versionLine: string;
  /** ISO release/deploy time — activity dot + relative/stale label in header meta */
  publishedAt?: string | null;
  versionLive?: boolean;
  extraMetaItems?: TabHeaderMetaItem[];
  centerStats: TabHeaderStatItem[];
  pinSticky?: boolean;
  dividerBelow?: boolean;
  embedded?: boolean;
  actions?: ReactNode;
};

/**
 * Shared workspace tab header (P0004 Hub layout):
 * title · session · version/release · center stats · actions.
 */
export function WorkspaceTabHeader({
  versionLine,
  publishedAt,
  versionLive,
  extraMetaItems = [],
  centerStats,
  ...header
}: WorkspaceTabHeaderProps) {
  const metaItems = useMemo(() => {
    if (publishedAt) {
      const semver = versionLine.match(/^v[\d.]+/i)?.[0]?.replace(/^v/i, "") ?? versionLine.replace(/^v/i, "");
      return buildVersionMetaItems(semver, publishedAt, versionLive, extraMetaItems);
    }
    return [
      {
        icon: Tag,
        value: versionLine,
        live: versionLive,
      } as TabHeaderMetaItem,
      ...extraMetaItems,
    ];
  }, [extraMetaItems, publishedAt, versionLine, versionLive]);

  return <AppTabHeader {...header} metaItems={metaItems} centerStats={centerStats} />;
}

export type { TabHeaderMetaItem, TabHeaderStatItem, TabTitleMenuItem };
