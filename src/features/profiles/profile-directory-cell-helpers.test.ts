import { describe, expect, it } from "vitest";
import {
  formatLastOpenedRelativeAge,
  formatLastOpenedStaleDate,
  groupHubTone,
  lastOpenedAgeTone,
} from "./profile-directory-cell-helpers";

describe("profile-directory-cell-helpers", () => {
  it("formats stale last opened as dd/mm/yy", () => {
    const ms = Date.parse("2026-06-18T05:00:00");
    expect(formatLastOpenedStaleDate(ms)).toBe("18/06/26");
  });

  it("uses relative age for fresh rows", () => {
    const now = Date.now();
    expect(lastOpenedAgeTone(now - 30_000)).toBe("fresh");
    expect(formatLastOpenedRelativeAge(now - 30_000)).toBe("just now");
    expect(formatLastOpenedRelativeAge(now - 6 * 60_000)).toBe("6m ago");
    expect(formatLastOpenedRelativeAge(now - 3 * 60 * 60_000)).toBe("3h ago");
  });

  it("marks old opens as stale", () => {
    const ms = Date.now() - 48 * 60 * 60_000;
    expect(lastOpenedAgeTone(ms)).toBe("stale");
  });

  it("maps Default group to gray tone", () => {
    expect(groupHubTone("Default", "g1")).toBe("offline");
  });

  it("assigns stable non-default group tones", () => {
    expect(groupHubTone("Sales", "sales-id")).not.toBe("offline");
    expect(groupHubTone("Sales", "sales-id")).toBe(groupHubTone("Sales", "sales-id"));
  });
});
