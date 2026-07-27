/**
 * Unit — DirectorySearchToolbar page-size SSOT (Display owns `tpage` when displayBand is set).
 */
import { describe, expect, it } from "vitest";
import { resolveDirectoryToolbarShowTablePageSize } from "./directory-search-toolbar-page-size";

describe("resolveDirectoryToolbarShowTablePageSize", () => {
  it("hides toolbar page size whenever displayBand is present", () => {
    expect(
      resolveDirectoryToolbarShowTablePageSize({
        displayBand: <span>Display</span>,
        showTablePageSize: true,
      }),
    ).toBe(false);
    expect(
      resolveDirectoryToolbarShowTablePageSize({
        displayBand: true,
        showTablePageSize: undefined,
      }),
    ).toBe(false);
  });

  it("defaults to showing page size when there is no displayBand", () => {
    expect(resolveDirectoryToolbarShowTablePageSize({})).toBe(true);
    expect(resolveDirectoryToolbarShowTablePageSize({ showTablePageSize: false })).toBe(false);
    expect(resolveDirectoryToolbarShowTablePageSize({ showTablePageSize: true })).toBe(true);
  });
});
