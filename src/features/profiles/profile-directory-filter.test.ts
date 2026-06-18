import { describe, expect, it } from "vitest";
import type { ProfileRow } from "../../types";
import { filterIndexedProfiles, indexProfilesForSearch } from "./profile-directory-filter";

function profile(partial: Partial<ProfileRow> & Pick<ProfileRow, "id" | "name">): ProfileRow {
  return {
    groupId: "",
    groupName: "",
    status: "closed",
    proxy: "",
    startupUrl: "",
    note: "",
    fingerprintSeed: 1,
    ...partial,
  } as ProfileRow;
}

describe("profile-directory-filter", () => {
  const rows = [
    profile({ id: "a", name: "Alpha", groupId: "g1", groupName: "Team A", proxy: "socks5://x" }),
    profile({ id: "b", name: "Beta", groupId: "g2", groupName: "Team B", note: "vip" }),
  ];
  const indexed = indexProfilesForSearch(rows);

  it("filters by profile name fragment (e.g. 1701)", () => {
    const catalog = indexProfilesForSearch([
      profile({ id: "1", name: "Profile 0001" }),
      profile({ id: "2", name: "Profile 1701" }),
      profile({ id: "3", name: "Profile 2000" }),
    ]);
    const out = filterIndexedProfiles(catalog, { groupIds: [], statuses: [], search: "1701" });
    expect(out.map((r) => r.name)).toEqual(["Profile 1701"]);
  });

  it("filters by search blob", () => {
    const out = filterIndexedProfiles(indexed, { groupIds: [], statuses: [], search: "socks5" });
    expect(out.map((r) => r.id)).toEqual(["a"]);
  });

  it("filters by group and status", () => {
    const out = filterIndexedProfiles(indexed, {
      groupIds: ["g2"],
      statuses: ["closed"],
      search: "",
    });
    expect(out.map((r) => r.id)).toEqual(["b"]);
  });
});
