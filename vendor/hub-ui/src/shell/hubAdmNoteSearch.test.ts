import { describe, expect, it } from "vitest";
import {
  findHubAdmNoteMatchRanges,
  getHubAccountDetailNoteHighlightTerms,
} from "./hubAdmNoteSearch";

describe("getHubAccountDetailNoteHighlightTerms", () => {
  it("returns empty for numeric-only id search", () => {
    expect(getHubAccountDetailNoteHighlightTerms("08")).toEqual([]);
    expect(getHubAccountDetailNoteHighlightTerms("21")).toEqual([]);
    expect(getHubAccountDetailNoteHighlightTerms("#1477")).toEqual([]);
  });

  it("returns text terms for plain text search", () => {
    expect(getHubAccountDetailNoteHighlightTerms("gmail")).toEqual(["gmail"]);
    expect(getHubAccountDetailNoteHighlightTerms("Gmail")).toEqual(["gmail"]);
  });

  it("returns text terms only for mixed search (id terms excluded from note rail)", () => {
    expect(getHubAccountDetailNoteHighlightTerms("00a")).toEqual(["a"]);
  });
});

describe("findHubAdmNoteMatchRanges with note highlight terms", () => {
  const note = "Imported 05/07/26\nRecovery glassq@outlook.com";

  it("does not match id digits in note dates when using note terms only", () => {
    const terms = getHubAccountDetailNoteHighlightTerms("08");
    expect(findHubAdmNoteMatchRanges(note, terms)).toEqual([]);
  });

  it("matches text terms in note body", () => {
    const terms = getHubAccountDetailNoteHighlightTerms("glassq");
    const ranges = findHubAdmNoteMatchRanges(note, terms);
    expect(ranges.length).toBeGreaterThan(0);
    expect(note.slice(ranges[0]!.start, ranges[0]!.end)).toBe("glassq");
  });
});
