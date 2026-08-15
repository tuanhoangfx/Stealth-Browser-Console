import type { ReactNode } from "react";
import { Archive } from "lucide-react";
import { HubListChromeHeader, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { useStealthVersionMetaItems } from "../../hooks/useStealthVersionMetaItems";

export function SystemBackupChromeHeader({
  centerStats,
  actions,
}: {
  centerStats?: TabHeaderStatItem[];
  actions?: ReactNode;
}) {
  const metaItems = useStealthVersionMetaItems();
  return (
    <HubListChromeHeader
      ariaLabel="Backup header"
      titleIcon={Archive}
      titleIconClass="text-amber-300"
      title="Backup"
      metaItems={metaItems}
      versionReleaseNotesCode="P0003"
      centerStats={centerStats ?? []}
      actions={actions}
    />
  );
}
