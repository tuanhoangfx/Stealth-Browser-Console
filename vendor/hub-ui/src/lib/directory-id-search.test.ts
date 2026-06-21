import { describe, expect, it } from "vitest";
import {
  buildHighlightSegments,
  getDirectorySearchHighlight,
  matchesDirectoryIdSearch,
} from "./directory-id-search";

describe("matchesDirectoryIdSearch", () => {
  it("numeric-only matches idText only", () => {
    expect(matchesDirectoryIdSearch({ idText: "1477", textBlob: "x" }, "1477")).toBe(true);
    expect(matchesDirectoryIdSearch({ idText: "0448", textBlob: "seed 1231477890" }, "1477")).toBe(false);
  });

  it("mixed without whitespace when mixedRequiresWhitespace is false", () => {
    expect(
      matchesDirectoryIdSearch({ idText: "0083", textBlob: "alpha task" }, "00a", { mixedRequiresWhitespace: false }),
    ).toBe(true);
  });

  it("socks5 stays text search when mixedRequiresWhitespace is true", () => {
    expect(
      matchesDirectoryIdSearch({ idText: "0000", textBlob: "socks5://x" }, "socks5", { mixedRequiresWhitespace: true }),
    ).toBe(true);
  });
});

describe("getDirectorySearchHighlight", () => {
  it("splits id vs text terms", () => {
    expect(getDirectorySearchHighlight("1477")).toEqual({ idTerms: ["1477"], textTerms: [] });
    expect(getDirectorySearchHighlight("00a", { mixedRequiresWhitespace: false })).toEqual({
      idTerms: ["00"],
      textTerms: ["a"],
    });
  });
});

describe("buildHighlightSegments", () => {
  it("highlights id fragment", () => {
    expect(buildHighlightSegments("Profile 1477", ["1477"])).toEqual([
      { text: "Profile ", highlight: false },
      { text: "1477", highlight: true },
    ]);
  });
});
