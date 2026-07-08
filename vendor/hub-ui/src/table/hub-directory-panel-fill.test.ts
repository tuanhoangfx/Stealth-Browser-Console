import { describe, expect, it } from "vitest";
import {
  resolveDirectoryPanelFillRows,
  shouldPadDirectoryBodyToFixedRows,
  shouldPadDirectoryBodyToPageSize,
} from "./hub-directory-table-meta";

describe("resolveDirectoryPanelFillRows", () => {
  it("always uses page size so partial pages do not stretch rows to full tbody", () => {
    expect(resolveDirectoryPanelFillRows(20, 1)).toBe(20);
    expect(resolveDirectoryPanelFillRows(20, 5)).toBe(20);
    expect(resolveDirectoryPanelFillRows(20, 0)).toBe(20);
  });

  it("caps at page size for full pages", () => {
    expect(resolveDirectoryPanelFillRows(20, 20)).toBe(20);
    expect(resolveDirectoryPanelFillRows(20, 99)).toBe(20);
  });

  it("never returns below 1", () => {
    expect(resolveDirectoryPanelFillRows(0, 0)).toBe(1);
  });
});

describe("shouldPadDirectoryBodyToPageSize", () => {
  it("pads partial pages with data only", () => {
    expect(shouldPadDirectoryBodyToPageSize(1, 20)).toBe(true);
    expect(shouldPadDirectoryBodyToPageSize(19, 20)).toBe(true);
    expect(shouldPadDirectoryBodyToPageSize(20, 20)).toBe(false);
    expect(shouldPadDirectoryBodyToPageSize(0, 20)).toBe(false);
  });
});

describe("shouldPadDirectoryBodyToFixedRows", () => {
  it("pads partial fixedRows pages with data only", () => {
    expect(shouldPadDirectoryBodyToFixedRows(1, 5)).toBe(true);
    expect(shouldPadDirectoryBodyToFixedRows(5, 5)).toBe(false);
    expect(shouldPadDirectoryBodyToFixedRows(0, 5)).toBe(false);
  });
});
