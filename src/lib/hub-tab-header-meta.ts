import { Tag } from "lucide-react";
import type { TabHeaderMetaItem } from "@tool-workspace/hub-ui";
import { APP_VERSION } from "./app-meta";
import { resolveAppVersionReleaseMeta } from "./app-release";

export function buildConsoleVersionMetaItems(extra: TabHeaderMetaItem[] = []): TabHeaderMetaItem[] {
  const release = resolveAppVersionReleaseMeta();
  return [
    {
      icon: Tag,
      value: `v${APP_VERSION} · ${release.shortLabel}`,
      live: release.live
    },
    ...extra
  ];
}
