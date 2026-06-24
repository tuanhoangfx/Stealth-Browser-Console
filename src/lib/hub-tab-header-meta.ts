import { buildVersionMetaItems as hubBuildVersionMetaItems } from "@tool-workspace/hub-ui";
import type { TabHeaderMetaItem } from "@tool-workspace/hub-ui";
import { APP_VERSION } from "./app-meta";
import { resolveAppVersionReleaseMeta } from "./app-release";

/** P0004 Hub parity — `vX.Y.Z · [activity timestamp]` via hub-ui MetaLine + activityAt. */
export function buildConsoleVersionMetaItems(extra: TabHeaderMetaItem[] = []): TabHeaderMetaItem[] {
  const release = resolveAppVersionReleaseMeta();
  return [...hubBuildVersionMetaItems(APP_VERSION, release.publishedAt), ...extra];
}
