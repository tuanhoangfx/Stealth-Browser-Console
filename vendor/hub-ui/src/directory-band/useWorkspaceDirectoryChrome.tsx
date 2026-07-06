import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { HubDirectoryToolbarSelectionProps } from "../shell/HubDirectoryToolbarSelection";
import type { HubViewMode } from "../shell/ViewToggle";
import type { TabHeaderStatItem } from "../shell/AppTabHeader";
import { HubLoadingView } from "../shell/HubLoadingView";

export type WorkspaceDirectoryChromeHandlers = {
  setToolbar: (toolbar: ReactNode) => void;
  setFilterSelectionToolbar: (toolbar: HubDirectoryToolbarSelectionProps | undefined) => void;
  setDirectoryViewMode: (mode: HubViewMode | undefined) => void;
  setFilterToolbar: (toolbar: ReactNode) => void;
  setCenterStats: (stats: TabHeaderStatItem[]) => void;
};

export type WorkspaceDirectoryChromeSnapshot = {
  toolbar: ReactNode;
  filterToolbar: ReactNode;
  filterSelectionToolbar?: HubDirectoryToolbarSelectionProps;
  directoryViewMode?: HubViewMode;
  centerStats: TabHeaderStatItem[];
  /** Stable fingerprint — bump when any chrome slot meaningfully changes (avoids ReactNode dep loops). */
  syncKey: string;
};

/**
 * Lift FilterBar + header stats into workspace shell before paint (P0004 Hub parity).
 * Pair with `useDirectoryBandSync` for KPI/charts band.
 */
export function useWorkspaceDirectoryChrome(
  snapshot: WorkspaceDirectoryChromeSnapshot,
  handlers: WorkspaceDirectoryChromeHandlers,
  enabled = true,
) {
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  useLayoutEffect(() => {
    if (!enabled) {
      handlers.setToolbar(null);
      handlers.setFilterSelectionToolbar(undefined);
      handlers.setDirectoryViewMode(undefined);
      handlers.setFilterToolbar(null);
      handlers.setCenterStats([]);
      return;
    }
    const s = snapshotRef.current;
    handlers.setToolbar(s.toolbar);
    handlers.setFilterSelectionToolbar(s.filterSelectionToolbar);
    handlers.setDirectoryViewMode(s.directoryViewMode);
    handlers.setFilterToolbar(s.filterToolbar);
    handlers.setCenterStats(s.centerStats);
  }, [
    enabled,
    snapshot.syncKey,
    handlers.setCenterStats,
    handlers.setDirectoryViewMode,
    handlers.setFilterSelectionToolbar,
    handlers.setFilterToolbar,
    handlers.setToolbar,
  ]);

  useLayoutEffect(
    () => () => {
      handlers.setToolbar(null);
      handlers.setFilterSelectionToolbar(undefined);
      handlers.setDirectoryViewMode(undefined);
      handlers.setFilterToolbar(null);
      handlers.setCenterStats([]);
    },
    [
      handlers.setCenterStats,
      handlers.setDirectoryViewMode,
      handlers.setFilterSelectionToolbar,
      handlers.setFilterToolbar,
      handlers.setToolbar,
    ],
  );
}

/** Row count at which directory tabs should wait for authoritative local store hydrate before paint. */
export const HUB_LARGE_DIRECTORY_BOOT_THRESHOLD = 2_000;

export function needsLargeDirectoryBoot(rowCount: number): boolean {
  return rowCount >= HUB_LARGE_DIRECTORY_BOOT_THRESHOLD;
}

export type DirectoryBootGateProps = {
  ready: boolean;
  ariaLabel: string;
  icon: LucideIcon;
  /** When false, hidden eager-mounted tabs must not portal over the active screen. */
  enabled?: boolean;
  portaled?: boolean;
  children: ReactNode;
};

/** Block directory body until local authoritative read completes (large vault / IDB-only mirror miss). */
export function DirectoryBootGate({
  ready,
  ariaLabel,
  icon,
  enabled = true,
  portaled = true,
  children,
}: DirectoryBootGateProps) {
  if (!enabled) return children;
  if (!ready) {
    return (
      <HubLoadingView
        icon={icon}
        ariaLabel={ariaLabel}
        variant="overlay"
        enabled
        portaled={portaled}
      />
    );
  }
  return children;
}
