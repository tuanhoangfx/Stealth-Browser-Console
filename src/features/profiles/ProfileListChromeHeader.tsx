import type { ReactNode } from "react";
import { Database } from "lucide-react";
import { HubListChromeHeader, buildConsoleVersionMetaItems, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { APP_VERSION } from "../../lib/app-meta";
import toolManifest from "../../../tool.manifest.json";

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
      metaItems={buildConsoleVersionMetaItems(APP_VERSION, toolManifest)}
      centerStats={centerStats ?? []}
      actions={actions}
    />
  );
}
