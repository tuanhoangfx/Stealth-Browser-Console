import { describe, expect, it } from "vitest";
import {
  HUB_ACTIVITY_AGE_HINT_LINES,
  inferDirectoryColumnHintLines,
  isActivityAgeDirectoryColumn,
  withSortPriorityHintLines,
} from "./directory-column-hint-helpers";

describe("directory-column-hint-helpers activity age", () => {
  it("detects camelCase lastActiveAt / createdAt keys", () => {
    expect(isActivityAgeDirectoryColumn("lastActiveAt", "Latest activity")).toBe(true);
    expect(isActivityAgeDirectoryColumn("createdAt", "Created")).toBe(true);
    expect(isActivityAgeDirectoryColumn("updatedAt", "Update")).toBe(true);
  });

  it("detects Last active label on groups active key", () => {
    expect(isActivityAgeDirectoryColumn("active", "Last active")).toBe(true);
  });

  it("attaches 5-bucket legend lines", () => {
    const lines = inferDirectoryColumnHintLines("lastActiveAt", "Latest activity");
    expect(lines).toBe(HUB_ACTIVITY_AGE_HINT_LINES);
    expect(lines?.some((l) => l.statusDot === "age-days")).toBe(true);
    expect(lines?.some((l) => l.statusDot === "age-week")).toBe(true);
    expect(lines).toHaveLength(5);
  });

  it("prefixes activity legend with Sort priority N", () => {
    expect(HUB_ACTIVITY_AGE_HINT_LINES[0]?.detail).toMatch(/^Sort priority 1 —/);
    expect(HUB_ACTIVITY_AGE_HINT_LINES[4]?.detail).toMatch(/^Sort priority 5 —/);
  });

  it("skips non-activity columns", () => {
    expect(isActivityAgeDirectoryColumn("email", "Email")).toBe(false);
    expect(inferDirectoryColumnHintLines("role", "Role")).toBeUndefined();
  });
});

describe("withSortPriorityHintLines", () => {
  it("annotates OPTION details by list order", () => {
    const lines = withSortPriorityHintLines([
      { label: "Ready", detail: "first bucket" },
      { label: "Rent", detail: "second bucket" },
    ]);
    expect(lines[0]?.detail).toBe("Sort priority 1 — first bucket");
    expect(lines[1]?.detail).toBe("Sort priority 2 — second bucket");
  });

  it("does not double-prefix existing sort priority", () => {
    const lines = withSortPriorityHintLines([
      { label: "Ready", detail: "Sort priority 1 — already set" },
    ]);
    expect(lines[0]?.detail).toBe("Sort priority 1 — already set");
  });
});
