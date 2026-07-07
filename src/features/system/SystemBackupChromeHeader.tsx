import type { ReactNode } from "react";
import { Archive } from "lucide-react";
import { HubListChromeHeader, buildConsoleVersionMetaItems, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { APP_VERSION } from "../../lib/app-meta";
import toolManifest from "../../../tool.manifest.json";

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
      metaItems={buildConsoleVersionMetaItems(APP_VERSION, toolManifest)}
      centerStats={centerStats ?? []}
      actions={actions}
    />
  );
}
