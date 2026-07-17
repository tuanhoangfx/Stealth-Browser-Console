import type { ReactNode } from "react";
import { Puzzle } from "lucide-react";
import { HubListChromeHeader, buildConsoleVersionMetaItems, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { APP_VERSION } from "../../lib/app-meta";
import toolManifest from "../../../tool.manifest.json";

export function SystemExtensionsChromeHeader({
  centerStats,
  actions,
}: {
  centerStats?: TabHeaderStatItem[];
  actions?: ReactNode;
}) {
  return (
    <HubListChromeHeader
      ariaLabel="Extensions header"
      titleIcon={Puzzle}
      titleIconClass="text-cyan-300"
      title="Extensions"
      metaItems={buildConsoleVersionMetaItems(APP_VERSION, toolManifest)}
      centerStats={centerStats ?? []}
      actions={actions}
    />
  );
}
