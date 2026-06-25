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

  it("uses relative age for fresh and recent rows", () => {
    expect(hubActivityAgeTone(now - 30_000, now)).toBe("fresh");
    expect(formatHubActivityRelativeAge(now - 30_000, now)).toBe("just now");
    expect(formatHubActivityRelativeAge(now - 6 * 60_000, now)).toBe("6m ago");
    expect(hubActivityAgeTone(now - 6 * 60 * 60_000, now)).toBe("recent");
    expect(formatHubActivityRelativeAge(now - 6 * 60 * 60_000, now)).toBe("6h ago");
  });

  it("marks activity older than 24h as stale", () => {
    const ms = now - 48 * 60 * 60_000;
    expect(hubActivityAgeTone(ms, now)).toBe("stale");
    const d = new Date(2026, 5, 20, 12, 0, 0);
    expect(formatHubActivityTime(d.getTime(), now)?.label).toBe("20/06/26");
  });

  it("maps tone buckets to hub status tones", () => {
    expect(formatHubActivityTime("2026-06-22T11:30:00", now)?.hubTone).toBe("active");
    expect(formatHubActivityTime("2026-06-22T06:00:00", now)?.hubTone).toBe("idle");
    expect(formatHubActivityTime("2026-06-20T12:00:00", now)?.hubTone).toBe("offline");
  });

  it("uses 1h fresh bucket (not 3h)", () => {
    const twoHoursAgo = now - 2 * 60 * 60_000;
    expect(hubActivityAgeTone(twoHoursAgo, now)).toBe("recent");
  });
});
