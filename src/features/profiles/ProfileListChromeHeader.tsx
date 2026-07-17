import type { ReactNode } from "react";
import { Database } from "lucide-react";
import {
  AppTabHeader,
  buildConsoleVersionMetaItems,
  useHubChromePrefs,
  type TabHeaderStatItem,
} from "@tool-workspace/hub-ui";
import { APP_VERSION } from "../../lib/app-meta";
import toolManifest from "../../../tool.manifest.json";

export function ProfileListChromeHeader({
  centerStats,
  centerContent,
  actions,
  statusSlot,
}: {
  centerStats?: TabHeaderStatItem[];
  centerContent?: ReactNode;
  actions?: ReactNode;
  statusSlot?: ReactNode;
}) {
  const { searchPin, headerPin, stackChrome } = useHubChromePrefs();

  return (
    <AppTabHeader
      ariaLabel="Profiles header"
      titleIcon={Database}
      titleIconClass="text-emerald-300"
      title="Profiles"
      metaItems={buildConsoleVersionMetaItems(APP_VERSION, toolManifest)}
      centerStats={centerStats ?? []}
      centerContent={centerContent}
      statusSlot={statusSlot}
      pinSticky={stackChrome ? false : headerPin}
      dividerBelow={stackChrome ? false : !searchPin}
      embedded={stackChrome}
      actions={actions}
    />
  );
}
