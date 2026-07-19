import { resolveHubDisplayAppVersion } from "./hub-embed-mode";
import { Tag } from "lucide-react";
import { resolveAppVersionReleaseMeta, type ToolManifestReleaseSlice } from "../lib/app-version-release-meta";
import type { TabHeaderMetaItem } from "./AppTabHeader";
import { buildVersionMetaItems } from "./workspace-tab-header-meta";
// readHubEmbedHostVersion unused after simplify — keep import only resolve

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
  const toolSemver = String(appVersion).replace(/^v/i, "").trim();
  const displayVersion = resolveHubDisplayAppVersion(appVersion);
  // Host portal (P0026) version inside embed — one clock for every ENZY screen.
  if (displayVersion !== toolSemver) {
    return buildVersionMetaItems(displayVersion, null, true, options?.extra ?? []);
  }
  const release = resolveAppVersionReleaseMeta({
    appVersion: displayVersion,
    manifest,
    builtAtIso: options?.builtAtIso,
    changelogPublishedAt: options?.changelogPublishedAt,
  });
  return buildVersionMetaItems(displayVersion, release.publishedAt, release.live, options?.extra ?? []);
}

/** Legacy `vX.Y.Z · dd/mm/yy` string meta (scaffold / simple headers). */
export function buildConsoleVersionMetaItemsLegacy(
  appVersion: string,
  manifest?: ToolManifestReleaseSlice,
  extra: TabHeaderMetaItem[] = [],
): TabHeaderMetaItem[] {
  const displayVersion = resolveHubDisplayAppVersion(appVersion);
  const toolSemver = String(appVersion).replace(/^v/i, "").trim();
  if (displayVersion !== toolSemver) {
    return [{ icon: Tag, value: `v${displayVersion}`, live: true }, ...extra];
  }
  const release = resolveAppVersionReleaseMeta({ appVersion: displayVersion, manifest });
  return [
    {
      icon: Tag,
      value: `v${displayVersion.replace(/^v/i, "")} · ${release.shortLabel}`,
      live: release.live,
    },
    ...extra,
  ];
}
