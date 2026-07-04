import type { ReactNode } from "react";
import { Archive } from "lucide-react";
import { HubListChromeHeader, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { buildConsoleVersionMetaItems } from "../../lib/hub-tab-header-meta";

export function SystemBackupChromeHeader({
  centerStats,
  actions,
}: {
  centerStats?: TabHeaderStatItem[];
  actions?: ReactNode;
}) {
  return (
    <HubListChromeHeader
      ariaLabel="Backup header"
      titleIcon={Archive}
      titleIconClass="text-amber-300"
      title="Backup"
      metaItems={buildConsoleVersionMetaItems()}
      centerStats={centerStats ?? []}
      actions={actions}
    />
  );
}
