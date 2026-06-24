import { describe, expect, it } from "vitest";
import {
  formatLastOpenedRelativeAge,
  formatLastOpenedStaleDate,
  groupHubTone,
  lastOpenedAgeTone,
} from "./profile-directory-cell-helpers";

describe("profile-directory-cell-helpers", () => {
  const now = Date.parse("2026-06-22T12:00:00");

  it("formats stale last opened as hh:mm dd/mm/yy", () => {
    const d = new Date(2026, 5, 18, 5, 0, 0);
    expect(formatLastOpenedStaleDate(d.getTime())).toMatch(/^05:00 18\/06\/26$/);
  });

  it("uses relative age for fresh rows", () => {
    expect(lastOpenedAgeTone(now - 30_000, now)).toBe("fresh");
    expect(formatLastOpenedRelativeAge(now - 30_000, now)).toBe("just now");
    expect(formatLastOpenedRelativeAge(now - 6 * 60_000, now)).toBe("6m ago");
    expect(formatLastOpenedRelativeAge(now - 6 * 60 * 60_000, now)).toBe("6h ago");
  });

  it("uses 1h fresh bucket", () => {
    expect(lastOpenedAgeTone(now - 2 * 60 * 60_000, now)).toBe("recent");
  });

  it("marks old opens as stale", () => {
    const ms = now - 48 * 60 * 60_000;
    expect(lastOpenedAgeTone(ms, now)).toBe("stale");
  });

  it("maps Default group to gray tone", () => {
    expect(groupHubTone("Default", "g1")).toBe("offline");
  });

  it("assigns stable non-default group tones", () => {
    expect(groupHubTone("Sales", "sales-id")).not.toBe("offline");
    expect(groupHubTone("Sales", "sales-id")).toBe(groupHubTone("Sales", "sales-id"));
  });
});
