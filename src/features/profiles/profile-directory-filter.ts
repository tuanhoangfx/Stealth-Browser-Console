import type { ProfileRow } from "../../types";

export type IndexedProfileRow = {
  profile: ProfileRow;
  searchBlob: string;
};

/** Pre-index lowercase search blob once per profiles snapshot — avoids 6× toLowerCase per keystroke. */
export function indexProfilesForSearch(profiles: readonly ProfileRow[]): IndexedProfileRow[] {
  const out: IndexedProfileRow[] = new Array(profiles.length);
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i]!;
    out[i] = {
      profile,
      searchBlob: [
        profile.name,
        profile.groupName ?? "",
        profile.proxy ?? "",
        profile.startupUrl ?? "",
        profile.note ?? "",
        String(profile.fingerprintSeed),
      ]
        .join("\u0001")
        .toLowerCase(),
    };
  }
  return out;
}

export function filterIndexedProfiles(
  indexed: readonly IndexedProfileRow[],
  opts: {
    groupIds: readonly string[];
    statuses: readonly ProfileRow["status"][];
    search: string;
  },
): ProfileRow[] {
  const groupSet = opts.groupIds.length > 0 ? new Set(opts.groupIds) : null;
  const statusSet = opts.statuses.length > 0 ? new Set(opts.statuses) : null;
  const q = opts.search.trim().toLowerCase();

  const out: ProfileRow[] = [];
  for (let i = 0; i < indexed.length; i++) {
    const row = indexed[i]!;
    const profile = row.profile;
    if (groupSet && !groupSet.has(String(profile.groupId ?? ""))) continue;
    if (statusSet && !statusSet.has(profile.status)) continue;
    if (q && !row.searchBlob.includes(q)) continue;
    out.push(profile);
  }
  return out;
}
