import { describe, expect, it } from "vitest";
import { formatDirectoryOneLine } from "./directory-one-line";

describe("formatDirectoryOneLine", () => {
  it("collapses agent-pool note newlines into one line", () => {
    const note = [
      "Agent pool —",
      "parallel headless",
      "smoke (9990-9999);",
      "do not use for",
      "personal browse",
    ].join("\n");
    expect(formatDirectoryOneLine(note)).toBe(
      "Agent pool — parallel headless smoke (9990-9999); do not use for personal browse",
    );
  });

  it("treats empty and whitespace as blank", () => {
    expect(formatDirectoryOneLine("")).toBe("");
    expect(formatDirectoryOneLine("   \n\t  ")).toBe("");
    expect(formatDirectoryOneLine(null)).toBe("");
  });
});
