import { useMemo, type ElementType, type ReactNode } from "react";
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
  title: string;
  titleMenu?: TabTitleMenuItem[];
  activeTitleMenuId?: string;
  onTitleMenuSelect?: (id: string) => void;
  /** e.g. `v1.1.2 · 03/06/26` */
  versionLine: string;
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
  versionLive,
  extraMetaItems = [],
  centerStats,
  ...header
}: WorkspaceTabHeaderProps) {
  const metaItems = useMemo(
    () => buildVersionMetaItems(versionLine, versionLive, extraMetaItems),
    [extraMetaItems, versionLine, versionLive],
  );

  return <AppTabHeader {...header} metaItems={metaItems} centerStats={centerStats} />;
}

export type { TabHeaderMetaItem, TabHeaderStatItem, TabTitleMenuItem };
