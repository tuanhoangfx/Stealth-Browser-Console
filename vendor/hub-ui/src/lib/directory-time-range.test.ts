import { describe, expect, it } from "vitest";
import {
  directoryActivityIso,
  matchesDirectoryActivityAt,
  matchesDirectoryTimeRange,
} from "./directory-time-range";

describe("directoryActivityIso", () => {
  it("normalizes epoch seconds", () => {
    const iso = directoryActivityIso(1_700_000_000);
    expect(iso).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it("passes through ISO strings", () => {
    expect(directoryActivityIso("2024-01-15T12:00:00.000Z")).toBe("2024-01-15T12:00:00.000Z");
  });
});

describe("matchesDirectoryActivityAt", () => {
  it("filters epoch timestamps", () => {
    const recent = Math.floor(Date.now() / 1000) - 3600;
    expect(matchesDirectoryActivityAt(recent, "7d")).toBe(true);
    expect(matchesDirectoryActivityAt(recent, "all")).toBe(true);
  });
});

describe("matchesDirectoryTimeRange", () => {
  it("allows all when range is all", () => {
    expect(matchesDirectoryTimeRange(undefined, "all")).toBe(true);
  });

  it("static rows stay visible when staticAlwaysVisible", () => {
    expect(matchesDirectoryTimeRange(null, "7d", { staticAlwaysVisible: true })).toBe(true);
  });

  it("excludes undated rows when filtering", () => {
    expect(matchesDirectoryTimeRange(null, "7d")).toBe(false);
  });
});
