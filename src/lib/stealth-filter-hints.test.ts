import { describe, expect, it } from "vitest";
import { stealthFilterHintContent } from "./stealth-filter-hints";

describe("stealthFilterHintContent", () => {
  it("maps profile group filter to column hint", () => {
    const hint = stealthFilterHintContent("group", "Group", "profiles");
    expect(hint.title).toBe("Group");
    expect(hint.description).toContain("filter bar");
  });

  it("maps workflow-store source filter to store column hint", () => {
    const hint = stealthFilterHintContent("source", "Source", "workflow-store");
    expect(hint.title).toBe("Source");
    expect(hint.description).toContain("filter bar");
  });
});
