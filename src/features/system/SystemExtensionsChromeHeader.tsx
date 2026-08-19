import type { ReactNode } from "react";
import { Puzzle } from "lucide-react";
import { HubListChromeHeader, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { useStealthVersionMetaItems } from "../../hooks/useStealthVersionMetaItems";

export function SystemExtensionsChromeHeader({
  centerStats,
  actions,
}: {
  centerStats?: TabHeaderStatItem[];
  actions?: ReactNode;
}) {
  const { metaItems, desktopUpdate } = useStealthVersionMetaItems();
  return (
    <HubListChromeHeader
      ariaLabel="Extensions header"
      titleIcon={Puzzle}
      titleIconClass="text-cyan-300"
      title="Extensions"
      metaItems={metaItems}
      versionReleaseNotesCode="P0003"
      versionReleaseNotesDesktopUpdate={desktopUpdate}
      centerStats={centerStats ?? []}
      actions={actions}
    />
  );
}
