import { describe, expect, it } from "vitest";
import { buildProfileKpiItems } from "./profile-kpi-items";

describe("buildProfileKpiItems", () => {
  it("maps profile KPI numbers to strip tiles with pref keys", () => {
    const items = buildProfileKpiItems({ total: 100, ready: 90, running: 5, failed: 2 });
    expect(items.map((item) => item.prefKey)).toEqual(["total", "running", "failed", "ready"]);
    expect(items[0]).toMatchObject({ label: "Profiles", value: 100, tone: "indigo", emojiGlyph: "📡" });
    expect(items[1]).toMatchObject({ value: 5, tone: "emerald", emojiGlyph: "▶️" });
    expect(items[2]).toMatchObject({ label: "Failed", value: 2, tone: "rose", emojiGlyph: "⚠️" });
    expect(items[3]).toMatchObject({ label: "Ready", value: 90, tone: "emerald", emojiGlyph: "✅" });
  });
});
