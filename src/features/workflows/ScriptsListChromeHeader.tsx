import type { ReactNode } from "react";
import { Workflow } from "lucide-react";
import { HubListChromeHeader, buildVersionMetaItems, type TabHeaderStatItem } from "@tool-workspace/hub-ui";
import { APP_VERSION } from "../../lib/app-meta";
import { resolveAppVersionReleaseMeta } from "../../lib/app-release";

type ScriptsListChromeHeaderProps = {
  centerStats?: TabHeaderStatItem[];
  actions?: ReactNode;
};

/** Common Hub-UI screen header for the Scripts builder — no search (search lives in the Workflow frame). */
export function ScriptsListChromeHeader({ centerStats, actions }: ScriptsListChromeHeaderProps) {
  const release = resolveAppVersionReleaseMeta();

  return (
    <HubListChromeHeader
      ariaLabel="Scripts header"
      titleIcon={Workflow}
      titleIconClass="text-cyan-300"
      title="Scripts"
      metaItems={buildVersionMetaItems(`v${APP_VERSION} · ${release.shortLabel}`, release.live)}
      centerStats={centerStats ?? []}
      actions={actions}
    />
  );
}
