import { describe, expect, it } from "vitest";
import {
  formatHubActivityRelativeAge,
  formatHubActivityStaleLabel,
  formatHubActivityTime,
  hubActivityAgeTone,
} from "./format-hub-activity-time";

describe("format-hub-activity-time", () => {
  const now = Date.parse("2026-06-22T12:00:00");

  it("formats stale activity as dd/mm/yy", () => {
    const d = new Date(2026, 5, 18, 5, 0, 0);
    expect(formatHubActivityStaleLabel(d.getTime())).toBe("18/06/26");
  });

  it("uses relative age for fresh rows (≤1h)", () => {
    expect(hubActivityAgeTone(now - 30_000, now)).toBe("fresh");
    expect(formatHubActivityRelativeAge(now - 30_000, now)).toBe("Just now");
    expect(formatHubActivityRelativeAge(now - 45 * 60_000, now)).toBe("45m ago");
  });

  it("marks activity between 1h and 24h as recent (orange dot)", () => {
    expect(hubActivityAgeTone(now - 6 * 60 * 60_000, now)).toBe("recent");
    expect(formatHubActivityRelativeAge(now - 6 * 60 * 60_000, now)).toBe("6h ago");
    const ms = now - 20 * 60 * 60_000;
    expect(hubActivityAgeTone(ms, now)).toBe("recent");
    expect(formatHubActivityRelativeAge(ms, now)).toBe("20h ago");
  });

  it("marks activity older than 24h as stale (gray dot)", () => {
    const d = new Date(2026, 5, 18, 12, 0, 0);
    expect(hubActivityAgeTone(d.getTime(), now)).toBe("stale");
    expect(formatHubActivityTime(d.getTime(), now)?.label).toBe("18/06/26");
    const ms = now - 30 * 60 * 60_000;
    expect(hubActivityAgeTone(ms, now)).toBe("stale");
  });

  it("maps 3 tone buckets to activity dot tones", () => {
    expect(formatHubActivityTime("2026-06-22T11:30:00", now)?.hubTone).toBe("age-recent");
    expect(formatHubActivityTime("2026-06-22T06:00:00", now)?.hubTone).toBe("age-aging");
    expect(formatHubActivityTime("2026-06-18T12:00:00", now)?.hubTone).toBe("age-stale");
  });

  it("uses 1h fresh bucket (blue dot)", () => {
    const fortyFiveMinAgo = now - 45 * 60_000;
    expect(hubActivityAgeTone(fortyFiveMinAgo, now)).toBe("fresh");
    const twoHoursAgo = now - 2 * 60 * 60_000;
    expect(hubActivityAgeTone(twoHoursAgo, now)).toBe("recent");
  });

  it("treats future timestamps as stale calendar dates (not Just now)", () => {
    const future = now + 4 * 24 * 60 * 60_000;
    expect(hubActivityAgeTone(future, now)).toBe("stale");
    expect(formatHubActivityRelativeAge(future, now)).toBe("26/06/26");
  });
});
