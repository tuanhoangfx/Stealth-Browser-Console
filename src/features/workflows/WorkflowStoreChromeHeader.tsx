import type { ReactNode } from "react";
import { HubListChromeHeader } from "@tool-workspace/hub-ui";
import { buildConsoleVersionMetaItems } from "../../lib/hub-tab-header-meta";
import { stealthWorkflowTabChrome } from "../../lib/stealth-nav-structure";

const storeChrome = stealthWorkflowTabChrome("store");

export function WorkflowStoreChromeHeader({ actions }: { actions?: ReactNode }) {
  return (
    <HubListChromeHeader
      ariaLabel="Store header"
      titleIcon={storeChrome.icon}
      titleIconClass={storeChrome.titleIconClass}
      title={storeChrome.label}
      metaItems={buildConsoleVersionMetaItems()}
      actions={actions}
    />
  );
}
