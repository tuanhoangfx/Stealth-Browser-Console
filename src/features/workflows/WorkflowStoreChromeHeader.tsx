import type { ReactNode } from "react";
import { HubListChromeHeader } from "@tool-workspace/hub-ui";
import { stealthWorkflowTabChrome } from "../../lib/stealth-nav-structure";
import { useStealthVersionMetaItems } from "../../hooks/useStealthVersionMetaItems";

const storeChrome = stealthWorkflowTabChrome("store");

export function WorkflowStoreChromeHeader({ actions }: { actions?: ReactNode }) {
  const metaItems = useStealthVersionMetaItems();
  return (
    <HubListChromeHeader
      ariaLabel="Store header"
      titleIcon={storeChrome.icon}
      titleIconClass={storeChrome.titleIconClass}
      title={storeChrome.label}
      metaItems={metaItems}
      actions={actions}
    />
  );
}
