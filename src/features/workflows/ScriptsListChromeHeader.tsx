import type { ReactNode } from "react";
import { HubListChromeHeader, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { buildConsoleVersionMetaItems } from "../../lib/hub-tab-header-meta";
import { stealthScreenChrome } from "../../lib/stealth-nav-structure";

type ScriptsListChromeHeaderProps = {
  centerStats?: TabHeaderStatItem[];
  actions?: ReactNode;
};

const workflowChrome = stealthScreenChrome("workflow");

/** Workflow tab header — label/icon SSOT from sidebar nav (search lives in directory frame). */
export function ScriptsListChromeHeader({ centerStats, actions }: ScriptsListChromeHeaderProps) {
  return (
    <HubListChromeHeader
      ariaLabel="Workflow header"
      titleIcon={workflowChrome.icon}
      titleIconClass={workflowChrome.titleIconClass}
      title={workflowChrome.label}
      metaItems={buildConsoleVersionMetaItems()}
      centerStats={centerStats ?? []}
      actions={actions}
    />
  );
}
