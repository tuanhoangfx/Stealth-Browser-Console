import { Tag } from "lucide-react";
import { resolveAppVersionReleaseMeta, type ToolManifestReleaseSlice } from "../lib/app-version-release-meta";
import type { TabHeaderMetaItem } from "./AppTabHeader";
import { buildVersionMetaItems } from "./workspace-tab-header-meta";

/** `vX.Y.Z · activity timestamp` — thin wrapper over manifest + build meta. */
export function buildConsoleVersionMetaItems(
  appVersion: string,
  manifest?: ToolManifestReleaseSlice,
  options?: {
    builtAtIso?: string;
    changelogPublishedAt?: string;
    extra?: TabHeaderMetaItem[];
  },
): TabHeaderMetaItem[] {
  const release = resolveAppVersionReleaseMeta({
    appVersion,
    manifest,
    builtAtIso: options?.builtAtIso,
    changelogPublishedAt: options?.changelogPublishedAt,
  });
  return buildVersionMetaItems(appVersion, release.publishedAt, release.live, options?.extra ?? []);
}

/** Legacy `vX.Y.Z · dd/mm/yy` string meta (scaffold / simple headers). */
export function buildConsoleVersionMetaItemsLegacy(
  appVersion: string,
  manifest?: ToolManifestReleaseSlice,
  extra: TabHeaderMetaItem[] = [],
): TabHeaderMetaItem[] {
  const release = resolveAppVersionReleaseMeta({ appVersion, manifest });
  return [
    {
      icon: Tag,
      value: `v${appVersion.replace(/^v/i, "")} · ${release.shortLabel}`,
      live: release.live,
    },
    ...extra,
  ];
}
