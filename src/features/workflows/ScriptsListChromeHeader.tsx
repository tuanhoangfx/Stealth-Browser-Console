import type { ReactNode } from "react";
import { HubListChromeHeader, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { stealthScreenChrome } from "../../lib/stealth-nav-structure";
import { useStealthVersionMetaItems } from "../../hooks/useStealthVersionMetaItems";

type ScriptsListChromeHeaderProps = {
  centerStats?: TabHeaderStatItem[];
  actions?: ReactNode;
};

const workflowChrome = stealthScreenChrome("workflow");

/** Workflow tab header — label/icon SSOT from sidebar nav (search lives in directory frame). */
export function ScriptsListChromeHeader({ centerStats, actions }: ScriptsListChromeHeaderProps) {
  const { metaItems, desktopUpdate } = useStealthVersionMetaItems();
  return (
    <HubListChromeHeader
      ariaLabel="Workflow header"
      titleIcon={workflowChrome.icon}
      titleIconClass={workflowChrome.titleIconClass}
      title={workflowChrome.label}
      metaItems={metaItems}
      versionReleaseNotesCode="P0003"
      versionReleaseNotesDesktopUpdate={desktopUpdate}
      centerStats={centerStats ?? []}
      actions={actions}
    />
  );
}
