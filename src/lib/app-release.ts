/**
 * P0003 Stealth version clock — hub-ui `resolveHubProductVersionMeta` SSOT
 * (card: hub-version-clock-ssot).
 */
import {
  formatTabHeaderTimestamp,
  parseChangelogReleaseTimestamp,
  resolveHubProductVersionMeta,
  type AppVersionReleaseMeta,
  type ToolManifestReleaseSlice,
} from "@tool-workspace/hub-ui";
import changelogRaw from "../../CHANGELOG.md?raw";
import { APP_VERSION, STEALTH_PRODUCT } from "./app-meta";
import toolManifest from "../../tool.manifest.json";

export type { AppVersionReleaseMeta };

function readBuiltAtIso(): string | undefined {
  const raw = import.meta.env.VITE_APP_BUILT_AT;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

/** Same 4-source stamps as `stealthHostVersionMeta` — pass into `buildConsoleVersionMetaItems`. */
export function stealthVersionClockInput() {
  return {
    builtAtIso: readBuiltAtIso(),
    changelogPublishedAt: parseChangelogReleaseTimestamp(APP_VERSION, changelogRaw),
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
