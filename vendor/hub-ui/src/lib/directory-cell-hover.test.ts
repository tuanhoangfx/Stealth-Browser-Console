import { describe, expect, it } from "vitest";
import {
  DIRECTORY_CELL_TRUNCATE,
  directoryCellHoverTitle,
  directoryCellNeedsRichTooltip,
} from "./directory-cell-hover";

describe("directoryCellHoverTitle", () => {
  it("returns display or value", () => {
    expect(directoryCellHoverTitle("secret", "••••")).toBe("••••");
    expect(directoryCellHoverTitle("  abc  ")).toBe("abc");
  });
});

describe("directoryCellNeedsRichTooltip", () => {
  it("always false — header hints only", () => {
    expect(directoryCellNeedsRichTooltip("short")).toBe(false);
    expect(directoryCellNeedsRichTooltip("noraclonegm019@gmail.com")).toBe(false);
    expect(directoryCellNeedsRichTooltip("")).toBe(false);
  });
});

describe("DIRECTORY_CELL_TRUNCATE", () => {
  it("is stable SSOT class", () => {
    expect(DIRECTORY_CELL_TRUNCATE).toContain("truncate");
  });
});
