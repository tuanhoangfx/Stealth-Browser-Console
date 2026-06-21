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

  it("numeric search ignores fingerprint_seed false positives (e.g. 1477 vs 0448)", () => {
    const catalog = indexProfilesForSearch([
      profile({ id: "1", name: "1477", fingerprintSeed: 999 }),
      profile({ id: "2", name: "0448", fingerprintSeed: 1231477890 }),
      profile({ id: "3", name: "2564", fingerprintSeed: 14770001 }),
    ]);
    const out = filterIndexedProfiles(catalog, { groupIds: [], statuses: [], search: "1477" });
    expect(out.map((r) => r.name)).toEqual(["1477"]);
  });

  it("5k catalog numeric search has no fingerprint_seed false positives", () => {
    const catalog = indexProfilesForSearch(
      Array.from({ length: 5000 }, (_, i) => {
        const code = String(i).padStart(4, "0");
        const seed = 1_000_000 + ((i * 7919 + 1477) % 9_000_000);
        return profile({ id: `id-${i}`, name: code, fingerprintSeed: seed });
      }),
    );
    const targetCode = "1477";
    catalog[1477] = { profile: profile({ id: "id-hit", name: targetCode, fingerprintSeed: 42_4242 }) };
    const out = filterIndexedProfiles(catalog, { groupIds: [], statuses: [], search: targetCode });
    expect(out.map((r) => r.name)).toEqual([targetCode]);
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
