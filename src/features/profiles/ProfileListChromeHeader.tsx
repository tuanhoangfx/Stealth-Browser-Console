import type { ReactNode } from "react";
import { Database } from "lucide-react";
import { HubListChromeHeader, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { useStealthVersionMetaItems } from "../../hooks/useStealthVersionMetaItems";

export function ProfileListChromeHeader({
  centerStats,
  centerContent,
  actions,
}: {
  centerStats?: TabHeaderStatItem[];
  centerContent?: ReactNode;
  actions?: ReactNode;
  statusSlot?: ReactNode;
}) {
  const metaItems = useStealthVersionMetaItems();

  return (
    <HubListChromeHeader
      ariaLabel="Profiles header"
      titleIcon={Database}
      titleIconClass="text-emerald-300"
      title="Profiles"
      metaItems={metaItems}
      versionReleaseNotesCode="P0003"
      centerStats={centerStats ?? []}
      centerContent={centerContent}
      actions={actions}
    />
  );
}
