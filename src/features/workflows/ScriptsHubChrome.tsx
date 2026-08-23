import type { ReactNode } from "react";
import { HubSplitWorkspaceScreen } from "@tool-workspace/hub-ui";
import { useHostHeaderStats } from "../../hooks/useHostHeaderStats";
import { stealthScreenChrome } from "../../lib/stealth-nav-structure";
import { ScriptsListChromeHeader } from "./ScriptsListChromeHeader";

const workflowChrome = stealthScreenChrome("workflow");

export type ScriptsHubChromeProps = {
  headerActions?: ReactNode;
  children: ReactNode;
};

/** Screen-level header — device CPU/RAM (workflow counts stay in the directory). */
export function ScriptsHubChrome({ headerActions, children }: ScriptsHubChromeProps) {
  const centerStats = useHostHeaderStats();

  return (
    <HubSplitWorkspaceScreen
      bodyClassName="stealth-scripts-workspace__body flex min-h-0 flex-1 overflow-hidden"
      header={<ScriptsListChromeHeader centerStats={centerStats} actions={headerActions} />}
      sectionRuleLabel={workflowChrome.label}
    >
      {children}
    </HubSplitWorkspaceScreen>
  );
}
