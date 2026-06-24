import type { ReactNode } from "react";
import { Database } from "lucide-react";
import { HubListChromeHeader, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { buildConsoleVersionMetaItems } from "../../lib/hub-tab-header-meta";

export function ProfileListChromeHeader({
  centerStats,
  actions
}: {
  centerStats?: TabHeaderStatItem[];
  actions?: ReactNode;
}) {
  return (
    <HubListChromeHeader
      ariaLabel="Profiles header"
      titleIcon={Database}
      titleIconClass="text-emerald-300"
      title="Profiles"
      metaItems={buildConsoleVersionMetaItems()}
      centerStats={centerStats ?? []}
      actions={actions}
    />
  );
}
