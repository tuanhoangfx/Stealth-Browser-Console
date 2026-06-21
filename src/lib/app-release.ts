import manifest from "../../tool.manifest.json";

export type AppVersionReleaseMeta = {
  shortLabel: string;
  live: boolean;
};

/** Header version chip — release date (P0001/P0004 parity), not a static “MVP” label. */
export function resolveAppVersionReleaseMeta(): AppVersionReleaseMeta {
  const publishedAt = manifest.release?.latestPublished?.publishedAt;
  if (!publishedAt) {
    return { shortLabel: "dev", live: false };
  }
  const date = new Date(publishedAt);
  if (!Number.isFinite(date.getTime())) {
    return { shortLabel: "dev", live: false };
  }
  const shortLabel = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
  return { shortLabel, live: true };
}
