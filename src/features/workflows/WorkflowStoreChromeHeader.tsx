import type { ReactNode } from "react";
import { HubListChromeHeader } from "@tool-workspace/hub-ui";
import { useHostHeaderStats } from "../../hooks/useHostHeaderStats";
import { stealthWorkflowTabChrome } from "../../lib/stealth-nav-structure";
import { useStealthVersionMetaItems } from "../../hooks/useStealthVersionMetaItems";

const storeChrome = stealthWorkflowTabChrome("store");

export function WorkflowStoreChromeHeader({ actions }: { actions?: ReactNode }) {
  const { metaItems, desktopUpdate } = useStealthVersionMetaItems();
  const centerStats = useHostHeaderStats();
  return (
    <HubListChromeHeader
      ariaLabel="Store header"
      titleIcon={storeChrome.icon}
      titleIconClass={storeChrome.titleIconClass}
      title={storeChrome.label}
      metaItems={metaItems}
      versionReleaseNotesCode="P0003"
      versionReleaseNotesDesktopUpdate={desktopUpdate}
      centerStats={centerStats}
      actions={actions}
    />
  );
}
