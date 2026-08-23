import { describe, expect, it } from "vitest";
import { isLocalCalendarToday } from "./local-calendar-today";

describe("isLocalCalendarToday", () => {
  it("matches today's local midnight and rejects yesterday", () => {
    const now = new Date(2026, 7, 23, 15, 0, 0);
    expect(isLocalCalendarToday(new Date(2026, 7, 23, 1, 0, 0).toISOString(), now)).toBe(true);
    expect(isLocalCalendarToday(new Date(2026, 7, 22, 23, 0, 0).toISOString(), now)).toBe(false);
    expect(isLocalCalendarToday("", now)).toBe(false);
  });
});
