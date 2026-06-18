import { describe, expect, it } from "vitest";
import { DEFAULT_TABLE_PAGE_SIZE } from "../../app/constants";
import { normalizeProfileDirectoryPageSize } from "./profile-directory-page-size";

describe("normalizeProfileDirectoryPageSize", () => {
  it("maps legacy hub default 25 to 20", () => {
    expect(normalizeProfileDirectoryPageSize(25)).toBe(DEFAULT_TABLE_PAGE_SIZE);
  });

  it("keeps P0003 page size options", () => {
    expect(normalizeProfileDirectoryPageSize(20)).toBe(20);
    expect(normalizeProfileDirectoryPageSize(50)).toBe(50);
    expect(normalizeProfileDirectoryPageSize(100)).toBe(100);
  });

  it("falls back to 20 for unknown sizes", () => {
    expect(normalizeProfileDirectoryPageSize(30)).toBe(DEFAULT_TABLE_PAGE_SIZE);
    expect(normalizeProfileDirectoryPageSize(NaN)).toBe(DEFAULT_TABLE_PAGE_SIZE);
  });
});
