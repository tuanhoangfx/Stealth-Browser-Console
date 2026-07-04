import { memo, type ReactNode } from "react";
import { HubSplitWorkspaceScreen } from "@tool-workspace/hub-ui";
import { WorkflowStoreChromeHeader } from "../features/workflows/WorkflowStoreChromeHeader";
import { WorkflowStorePanel } from "../features/workflows/WorkflowStorePanel";
import "../theme/stealth-workflow-store.css";

export const WorkflowStoreView = memo(function WorkflowStoreView({
  headerActions,
}: {
  headerActions?: ReactNode;
}) {
  return (
    <HubSplitWorkspaceScreen
      bodyClassName="stealth-workflow-store-screen flex min-h-0 flex-1 flex-col overflow-hidden"
      header={<WorkflowStoreChromeHeader actions={headerActions} />}
      sectionRuleLabel="Store"
    >
      <WorkflowStorePanel />
    </HubSplitWorkspaceScreen>
  );
});
