import type { ProfileRow } from "../../types";

import { matchesProfileDirectorySearch } from "./profile-directory-search";



export type IndexedProfileRow = {

  profile: ProfileRow;

};



/** Pre-index profile rows once per snapshot — search uses `matchesProfileDirectorySearch`. */

export function indexProfilesForSearch(profiles: readonly ProfileRow[]): IndexedProfileRow[] {

  const out: IndexedProfileRow[] = new Array(profiles.length);

  for (let i = 0; i < profiles.length; i++) {

    out[i] = { profile: profiles[i]! };

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

  const q = opts.search.trim();



  const out: ProfileRow[] = [];

  for (let i = 0; i < indexed.length; i++) {

    const row = indexed[i]!;

    const profile = row.profile;

    if (groupSet && !groupSet.has(String(profile.groupId ?? ""))) continue;

    if (statusSet && !statusSet.has(profile.status)) continue;

    if (q && !matchesProfileDirectorySearch(profile, q)) continue;

    out.push(profile);

  }

  return out;

}

