import type { ReactNode } from "react";
import type { TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { HubSplitWorkspaceScreen } from "@tool-workspace/hub-ui";
import { ProfileListChromeHeader } from "./ProfileListChromeHeader";

export type ProfilesHubChromeProps = {
  centerStats: TabHeaderStatItem[];
  headerActions?: ReactNode;
  children: ReactNode;
};

/** Screen chrome — header stats only; KPI band lives inside profile directory pane. */
export function ProfilesHubChrome({ centerStats, headerActions, children }: ProfilesHubChromeProps) {
  return (
    <HubSplitWorkspaceScreen
      bodyClassName="stealth-profiles-workspace__body flex min-h-0 flex-1 overflow-hidden"
      header={<ProfileListChromeHeader centerStats={centerStats} actions={headerActions} />}
      sectionRuleLabel="Profiles"
    >
      {children}
    </HubSplitWorkspaceScreen>
  );
}
