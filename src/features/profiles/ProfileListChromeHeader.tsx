import type { ReactNode } from "react";
import { Database } from "lucide-react";
import { HubListChromeHeader, buildVersionMetaItems, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { APP_VERSION } from "../../lib/app-meta";
import { resolveAppVersionReleaseMeta } from "../../lib/app-release";

export function ProfileListChromeHeader({
  centerStats,
  actions
}: {
  centerStats?: TabHeaderStatItem[];
  actions?: ReactNode;
}) {
  const release = resolveAppVersionReleaseMeta();

  return (
    <HubListChromeHeader
      ariaLabel="Profiles header"
      titleIcon={Database}
      titleIconClass="text-emerald-300"
      title="Profiles"
      metaItems={buildVersionMetaItems(`v${APP_VERSION} · ${release.shortLabel}`, release.live)}
      centerStats={centerStats ?? []}
      actions={actions}
    />
  );
}
