import { describe, expect, it } from "vitest";
import {
  hasActiveProfileDirectoryFilters,
  resolveProfileDirectoryVisibleTotal,
} from "./profile-directory-counts";

describe("profile-directory-counts", () => {
  const emptyQuery = { search: "", groupIds: [] as string[], statuses: [] as const };

  it("uses catalog total when no filters are active", () => {
    expect(resolveProfileDirectoryVisibleTotal(emptyQuery, 5000, 4999)).toBe(5000);
  });

  it("uses filtered total when search is active", () => {
    expect(
      resolveProfileDirectoryVisibleTotal(
        { ...emptyQuery, search: "demo" },
        5000,
        12,
      ),
    ).toBe(12);
  });

  it("detects active group/status filters", () => {
    expect(hasActiveProfileDirectoryFilters(emptyQuery)).toBe(false);
    expect(hasActiveProfileDirectoryFilters({ ...emptyQuery, groupIds: ["g1"] })).toBe(true);
    expect(hasActiveProfileDirectoryFilters({ ...emptyQuery, statuses: ["running"] })).toBe(true);
  });
});
