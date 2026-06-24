import manifest from "../../tool.manifest.json";
import { APP_VERSION } from "./app-meta";

export type AppVersionReleaseMeta = {
  shortLabel: string;
  live: boolean;
  publishedAt?: string;
};

function normalizeVersion(value?: string) {
  return value?.replace(/^v/i, "").trim() ?? "";
}

/** Header release activity — manifest `latestPublished` or `manifestUpdatedAt` (P0004/P0016 parity). */
export function resolveAppVersionReleaseMeta(): AppVersionReleaseMeta {
  const currentVersion = normalizeVersion(APP_VERSION);
  const latest = manifest.release?.latestPublished;
  const manifestUpdatedAt = manifest.manifestUpdatedAt;

  if (normalizeVersion(latest?.tag) === currentVersion && latest?.publishedAt) {
    return {
      shortLabel: latest.publishedAt,
      live: true,
      publishedAt: latest.publishedAt,
    };
  }

  if (manifestUpdatedAt) {
    return {
      shortLabel: manifestUpdatedAt,
      live: false,
      publishedAt: manifestUpdatedAt,
    };
  }

  return { shortLabel: "dev", live: false };
}
