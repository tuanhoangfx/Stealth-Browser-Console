/**
 * P0003 Stealth version clock — hub-ui `resolveHubProductVersionMeta` SSOT
 * (card: hub-version-clock-ssot).
 */
import {
  formatTabHeaderTimestamp,
  resolveHubProductVersionMeta,
  type AppVersionReleaseMeta,
  type ToolManifestReleaseSlice,
} from "@tool-workspace/hub-ui";
import releaseNotesJson from "../../public/release-notes.json";
import { APP_VERSION, STEALTH_PRODUCT } from "./app-meta";
import toolManifest from "../../tool.manifest.json";

export type { AppVersionReleaseMeta };

function readBuiltAtIso(): string | undefined {
  const raw = import.meta.env.VITE_APP_BUILT_AT;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/** Same 4-source stamps as `stealthHostVersionMeta` — pass into `buildConsoleVersionMetaItems`. */
export function stealthVersionClockInput(versionOverride?: string) {
  const ver = versionOverride || APP_VERSION;
  return {
    builtAtIso: readBuiltAtIso(),
    changelogPublishedAt:
      releaseNotesJson.entries?.find((e) => e.version === ver)?.at ||
      releaseNotesJson.entries?.find((e) => e.version === APP_VERSION)?.at ||
      releaseNotesJson.entries?.[0]?.at ||
      releaseNotesJson.generatedAt,
  };
}

export function stealthHostVersionMeta() {
  return resolveHubProductVersionMeta({
    appVersion: APP_VERSION,
    releaseNotesCode: STEALTH_PRODUCT.code,
    manifest: toolManifest as ToolManifestReleaseSlice,
    ...stealthVersionClockInput(),
  });
}

/** Header release activity — same clock as P0020 `dataBoxHostVersionMeta`. */
export function resolveAppVersionReleaseMeta(): AppVersionReleaseMeta {
  const meta = stealthHostVersionMeta();
  return {
    shortLabel: meta.publishedAt ? formatTabHeaderTimestamp(meta.publishedAt) : "—",
    live: meta.live,
    publishedAt: meta.publishedAt,
  };
}
