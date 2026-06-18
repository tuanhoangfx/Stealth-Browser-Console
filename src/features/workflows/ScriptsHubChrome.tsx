import { useMemo, type ReactNode } from "react";
import { HubSplitWorkspaceScreen } from "@tool-workspace/hub-ui";
import { ScriptsListChromeHeader } from "./ScriptsListChromeHeader";
import { buildWorkflowHeaderCenterStats, type WorkflowKpiNumbers } from "./workflow-kpi-items";

export type ScriptsHubChromeProps = {
  counts: WorkflowKpiNumbers;
  headerActions?: ReactNode;
  children: ReactNode;
};

/** Screen-level header only — search/filter live inside the Workflow frame (mirrors ProfilesHubChrome). */
export function ScriptsHubChrome({ counts, headerActions, children }: ScriptsHubChromeProps) {
  const centerStats = useMemo(() => buildWorkflowHeaderCenterStats(counts), [counts]);

  return (
    <HubSplitWorkspaceScreen
      bodyClassName="stealth-scripts-workspace__body flex min-h-0 flex-1 overflow-hidden"
      header={<ScriptsListChromeHeader centerStats={centerStats} actions={headerActions} />}
      sectionRuleLabel="Scripts"
    >
      {children}
    </HubSplitWorkspaceScreen>
  );
}
