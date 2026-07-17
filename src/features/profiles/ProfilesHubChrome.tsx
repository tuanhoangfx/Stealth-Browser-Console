import type { ReactNode } from "react";
import type { TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { HubSplitWorkspaceScreen } from "@tool-workspace/hub-ui";
import type { AutomationLaunchProgress } from "../runtime/useStealthAutomationQueue";
import { ProfileListChromeHeader } from "./ProfileListChromeHeader";
import { StealthProfilesLaunchHeaderBand } from "./StealthProfilesLaunchHeaderBand";

export type ProfilesHubChromeProps = {
  centerStats: TabHeaderStatItem[];
  launchProgress?: AutomationLaunchProgress | null;
  headerActions?: ReactNode;
  children: ReactNode;
};

/** Screen chrome — header stats only; KPI band lives inside profile directory pane. */
export function ProfilesHubChrome({
  centerStats,
  launchProgress = null,
  headerActions,
  children,
}: ProfilesHubChromeProps) {
  const launching = Boolean(launchProgress);

  return (
    <HubSplitWorkspaceScreen
      bodyClassName="stealth-profiles-workspace__body flex min-h-0 flex-1 overflow-hidden"
      header={
        <ProfileListChromeHeader
          centerStats={launching ? [] : centerStats}
          centerContent={launching ? <StealthProfilesLaunchHeaderBand progress={launchProgress!} /> : undefined}
          actions={headerActions}
        />
      }
      sectionRuleLabel="Profiles"
    >
      {children}
    </HubSplitWorkspaceScreen>
  );
}
