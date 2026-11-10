import { describe, expect, it } from "vitest";
import { buildProfileKpiItems } from "./profile-kpi-items";

describe("buildProfileKpiItems", () => {
  it("maps profile KPI numbers to 8 SSOT strip tiles with pref keys", () => {
    const items = buildProfileKpiItems({
      total: 100,
      createToday: 4,
      createWeek: 12,
      updateToday: 25,
      ready: 90,
      running: 5,
      headless: 3,
      failed: 2,
    });
    expect(items.map((item) => item.prefKey)).toEqual([
      "total",
      "create_today",
      "create_week",
      "update_today",
      "running",
      "headless",
      "ready",
      "failed",
    ]);
    expect(items[0]).toMatchObject({ label: "Profiles", value: 100, tone: "indigo", emojiGlyph: "📡" });
    expect(items[1]).toMatchObject({ label: "Create Today", value: 4, tone: "sky", emojiGlyph: "📅" });
    expect(items[2]).toMatchObject({ label: "Create This Week", value: 12, tone: "indigo", emojiGlyph: "🗓️" });
    expect(items[3]).toMatchObject({ label: "Update Today", value: 25, tone: "amber", emojiGlyph: "🔄" });
    expect(items[4]).toMatchObject({ label: "Running", value: 5, tone: "emerald", emojiGlyph: "▶️" });
    expect(items[5]).toMatchObject({ label: "Headless", value: 3, tone: "sky", emojiGlyph: "👻" });
    expect(items[6]).toMatchObject({ label: "Waiting", value: 90, tone: "amber", emojiGlyph: "⏳" });
    expect(items[7]).toMatchObject({ label: "Failed", value: 2, tone: "rose", emojiGlyph: "⚠️" });
  });

  it("attaches K1 grouped Daemon/Process tooltips on Headless and Waiting KPI tiles", () => {
    const items = buildProfileKpiItems(
      {
        total: 100,
        createToday: 1,
        createWeek: 2,
        updateToday: 3,
        ready: 2,
        running: 1,
        headless: 3,
        failed: 0,
      },
      {
        total: 100,
        closed: 94,
        opening: 0,
        running: 4,
        failed: 0,
        groupCounts: {},
        headlessReasons: {
          "0009": "💬 G1 Support (member@gmail.com) · Elapsed: 2m 10s",
          "0027": "💬 G1 Support (member@gmail.com) · Elapsed: 1m 05s",
          "9016": "Agent Smoke / Ephemeral Pool (9000–9999) · Elapsed: 18s",
        },
        waitingCodes: ["0001", "0003"],
        waitingReasons: {
          "0001": "Waiting for User Window to Close (agent:deferred-order-drain)",
          "0003": "Waiting for User Window to Close (agent:deferred-order-drain)",
        },
      },
    );
    const headlessTile = items.find((i) => i.prefKey === "headless");
    const waitingTile = items.find((i) => i.prefKey === "ready");
    expect(headlessTile?.labelHint?.lines).toEqual([
      {
        emoji: "🤖",
        label: "💬 G1 Support (member@gmail.com) (2)",
        detail: "#0009 (2m 10s), #0027 (1m 05s)",
        actionKey: "0009 0027",
        actionLabel: "Filter directory to 💬 G1 Support (member@gmail.com) (2 profiles)",
      },
      {
        emoji: "🤖",
        label: "Agent Smoke / Ephemeral Pool (9000–9999) (1)",
        detail: "#9016 (18s)",
        actionKey: "9016",
        actionLabel: "Filter directory to Agent Smoke / Ephemeral Pool (9000–9999) (1 profiles)",
      },
    ]);
    expect(waitingTile?.labelHint?.lines).toEqual([
      {
        emoji: "🔒",
        label: "Waiting for User Window to Close (agent:deferred-order-drain) (2)",
        detail: "#0001, #0003",
        actionKey: "0001 0003",
        actionLabel: "Filter directory to Waiting for User Window to Close (agent:deferred-order-drain) (2 profiles)",
      },
    ]);
  });
});
