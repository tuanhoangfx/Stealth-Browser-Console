import type { ReactNode } from "react";
import { HubSplitWorkspaceScreen } from "@tool-workspace/hub-ui";
import { SystemExtensionsChromeHeader } from "./SystemExtensionsChromeHeader";
import type { TabHeaderStatItem } from "@tool-workspace/hub-ui";

export function SystemExtensionsHubChrome({
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
      bodyClassName="stealth-system-extensions-workspace__body flex min-h-0 flex-1 overflow-hidden"
      header={<SystemExtensionsChromeHeader centerStats={centerStats} actions={headerActions} />}
      sectionRuleLabel="Extensions"
    >
      {children}
    </HubSplitWorkspaceScreen>
  );
}
