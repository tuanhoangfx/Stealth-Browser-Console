import type { ReactNode } from "react";
import { Database } from "lucide-react";
import {
  AppTabHeader,
  useHubChromePrefs,
  type TabHeaderStatItem,
} from "@tool-workspace/hub-ui";
import { useStealthVersionMetaItems } from "../../hooks/useStealthVersionMetaItems";

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
  const metaItems = useStealthVersionMetaItems();

  return (
    <AppTabHeader
      ariaLabel="Profiles header"
      titleIcon={Database}
      titleIconClass="text-emerald-300"
      title="Profiles"
      metaItems={metaItems}
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
