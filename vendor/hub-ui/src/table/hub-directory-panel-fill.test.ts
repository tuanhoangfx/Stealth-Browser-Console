import { describe, expect, it } from "vitest";
import { resolveDirectoryPanelFillRows } from "./hub-directory-table-meta";

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
