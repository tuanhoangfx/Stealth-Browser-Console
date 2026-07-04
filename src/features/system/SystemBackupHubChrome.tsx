import type { ReactNode } from "react";
import { HubSplitWorkspaceScreen } from "@tool-workspace/hub-ui";
import { SystemBackupChromeHeader } from "./SystemBackupChromeHeader";
import type { TabHeaderStatItem } from "@tool-workspace/hub-ui";

export function SystemBackupHubChrome({
  centerStats,
  headerActions,
  children,
}: {
  centerStats: TabHeaderStatItem[];
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <HubSplitWorkspaceScreen
      bodyClassName="stealth-system-backup-workspace__body flex min-h-0 flex-1 overflow-hidden"
      header={<SystemBackupChromeHeader centerStats={centerStats} actions={headerActions} />}
      sectionRuleLabel="Backup"
    >
      {children}
    </HubSplitWorkspaceScreen>
  );
}
