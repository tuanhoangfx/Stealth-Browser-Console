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
import { APP_VERSION } from "./app-meta";
import toolManifest from "../../tool.manifest.json";

export type { AppVersionReleaseMeta };

function readBuiltAtIso(): string | undefined {
  const raw = import.meta.env.VITE_APP_BUILT_AT;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export function stealthHostVersionMeta() {
  return resolveHubProductVersionMeta({
    appVersion: APP_VERSION,
    releaseNotesCode: "P0003",
    manifest: toolManifest as ToolManifestReleaseSlice,
    builtAtIso: readBuiltAtIso(),
  });
}

/** Header release activity — manifest SSOT via hub-ui. */
export function resolveAppVersionReleaseMeta(): AppVersionReleaseMeta {
  const meta = stealthHostVersionMeta();
  return {
    shortLabel: meta.publishedAt ? formatTabHeaderTimestamp(meta.publishedAt) : "—",
    live: meta.live,
    publishedAt: meta.publishedAt,
  };
}
