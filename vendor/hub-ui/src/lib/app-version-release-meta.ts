import { formatTabHeaderTimestamp } from "./tab-header-timestamp";

export type ToolManifestReleaseSlice = {
  release?: {
    version?: string;
    latestPublished?: {
      tag?: string;
      publishedAt?: string;
    };
  };
  manifestUpdatedAt?: string;
};

export type AppVersionReleaseMeta = {
  shortLabel: string;
  live: boolean;
  publishedAt?: string;
};

function normalizeVersion(value?: string) {
  return value?.replace(/^v/i, "") ?? "";
}

/** Parse `YYYY-MM-DD HH:mm (UTC+7)` changelog timestamps to ISO. */
export function normalizeChangelogTimestampRaw(raw: string): string | undefined {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+\(UTC([+-]\d{1,2})\)$/i);
  if (!match) return trimmed || undefined;
  const [, date, time, offset] = match;
  const sign = offset.startsWith("-") ? "-" : "+";
  const hour = offset.replace(/^[+-]/, "").padStart(2, "0");
  return `${date}T${time}:00${sign}${hour}:00`;
}

export function parseChangelogReleaseTimestamp(version: string, changelog: string): string | undefined {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entry = changelog.match(
    new RegExp(`- Version:\\s*\`${escaped}\`[\\s\\S]*?- Timestamp:\\s*([^\\n]+)`, "i"),
  );
  const raw = entry?.[1]?.trim();
  if (!raw) return undefined;
  return normalizeChangelogTimestampRaw(raw);
}

/** Resolve build / GitHub release timestamp for Hub tab headers (SSOT). */
export function resolveAppVersionReleaseMeta(input: {
  appVersion: string;
  manifest?: ToolManifestReleaseSlice;
  builtAtIso?: string;
  changelogPublishedAt?: string;
}): AppVersionReleaseMeta {
  const builtAt = input.builtAtIso?.trim();
  if (builtAt) {
    return {
      shortLabel: formatTabHeaderTimestamp(builtAt),
      live: true,
      publishedAt: builtAt,
    };
  }

  const currentVersion = normalizeVersion(input.appVersion);
  const latest = input.manifest?.release?.latestPublished;

  if (normalizeVersion(latest?.tag) === currentVersion && latest?.publishedAt) {
    return {
      shortLabel: formatTabHeaderTimestamp(latest.publishedAt),
      live: true,
      publishedAt: latest.publishedAt,
    };
  }

  if (input.changelogPublishedAt) {
    return {
      shortLabel: formatTabHeaderTimestamp(input.changelogPublishedAt),
      live: false,
      publishedAt: input.changelogPublishedAt,
    };
  }

  const manifestUpdatedAt = input.manifest?.manifestUpdatedAt;
  if (manifestUpdatedAt) {
    return {
      shortLabel: formatTabHeaderTimestamp(manifestUpdatedAt),
      live: false,
      publishedAt: manifestUpdatedAt,
    };
  }

  return { shortLabel: "—", live: false };
}
