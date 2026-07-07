import type { ReactNode } from "react";
import { HubListChromeHeader, buildConsoleVersionMetaItems } from "@tool-workspace/hub-ui";
import { APP_VERSION } from "../../lib/app-meta";
import toolManifest from "../../../tool.manifest.json";
import { stealthWorkflowTabChrome } from "../../lib/stealth-nav-structure";

const storeChrome = stealthWorkflowTabChrome("store");

export function WorkflowStoreChromeHeader({ actions }: { actions?: ReactNode }) {
  return (
    <HubListChromeHeader
      ariaLabel="Store header"
      titleIcon={storeChrome.icon}
      titleIconClass={storeChrome.titleIconClass}
      title={storeChrome.label}
      metaItems={buildConsoleVersionMetaItems(APP_VERSION, toolManifest)}
      actions={actions}
    />
  );
}
