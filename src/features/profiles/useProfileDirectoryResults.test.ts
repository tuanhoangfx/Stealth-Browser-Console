import { describe, expect, it } from "vitest";
import type { ProfileRow } from "../../types";
import { filterIndexedProfiles, indexProfilesForSearch } from "./profile-directory-filter";

function liteProfile(id: string, name: string, extra: Partial<ProfileRow> = {}): ProfileRow {
  return {
    id,
    name,
    groupId: "default",
    groupName: "Default",
    status: "closed",
    proxy: "",
    startupUrl: "",
    note: "",
    fingerprintSeed: 1,
    ...extra,
  } as ProfileRow;
}

function paginateRows(rows: readonly ProfileRow[], pageIndex: number, pageSize: number) {
  const start = pageIndex * pageSize;
  return rows.slice(start, start + pageSize);
}

function serverDirectoryView(
  profiles: readonly ProfileRow[],
  query: { search: string; groupIds: readonly string[]; statuses: readonly ProfileRow["status"][] },
  pageIndex: number,
  pageSize: number,
) {
  const filtered = filterIndexedProfiles(indexProfilesForSearch(profiles), {
    groupIds: query.groupIds,
    statuses: query.statuses,
    search: query.search.trim(),
  });
  return {
    filteredProfiles: paginateRows(filtered, pageIndex, pageSize),
    filteredTotal: filtered.length,
  };
}

describe("server lite directory pagination", () => {
  it("shows first page immediately from in-memory lite catalog (5k scale)", () => {
    const catalog = Array.from({ length: 5001 }, (_, i) =>
      liteProfile(`id-${i}`, `Profile ${String(i).padStart(4, "0")}`),
    );
    const page = serverDirectoryView(catalog, { search: "", groupIds: [], statuses: [] }, 0, 20);
    expect(page.filteredTotal).toBe(5001);
    expect(page.filteredProfiles).toHaveLength(20);
    expect(page.filteredProfiles[0]?.name).toBe("Profile 0000");
  });

  it("filters by search term immediately (e.g. 1231)", () => {
    const catalog = [
      liteProfile("a", "Profile 0001"),
      liteProfile("b", "Profile 1231"),
      liteProfile("c", "Profile 2000", { note: "ref 1231-x" }),
    ];
    const page = serverDirectoryView(catalog, { search: "1231", groupIds: [], statuses: [] }, 0, 25);
    expect(page.filteredTotal).toBe(2);
    expect(page.filteredProfiles.map((row) => row.id).sort()).toEqual(["b", "c"]);
  });

  it("filters group/status on lite rows", () => {
    const catalog = [
      liteProfile("a", "Alpha"),
      { ...liteProfile("b", "Beta"), groupId: "sales", groupName: "Sales", status: "running" as const },
    ];
    const page = serverDirectoryView(
      catalog,
      { search: "", groupIds: ["sales"], statuses: ["running"] },
      0,
      25,
    );
    expect(page.filteredTotal).toBe(1);
    expect(page.filteredProfiles[0]?.id).toBe("b");
  });
});
