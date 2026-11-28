import { describe, expect, it } from "vitest";
import { ACTIVE_DESIGN_COUNT, ACTIVE_DESIGN_FEATURES } from "../../design-registry";
import { MOCK_CARRIER_LANES, MOCK_DAEMONS, MOCK_DEVICES, MOCK_LIVE_EVENTS } from "./mock";
import { MOBILE_FARM_PREVIEW_VARIANTS } from "./tokens";

describe("mobile-farm-realtime-v2 design-preview-5", () => {
  it("registers active review in design-registry", () => {
    expect(ACTIVE_DESIGN_COUNT).toBeGreaterThan(0);
    expect(ACTIVE_DESIGN_FEATURES.some((f) => f.id === "mobile-farm-realtime-v2")).toBe(true);
  });

  it("provides 5 distinct layout-direction variants sharing canonical mock data", () => {
    expect(MOBILE_FARM_PREVIEW_VARIANTS.map((v) => v.id)).toEqual(["V1", "V2", "V3", "V4", "V5"]);
    const axes = new Set(MOBILE_FARM_PREVIEW_VARIANTS.map((v) => v.layoutAxis));
    expect(axes.size).toBe(5);
    expect(MOCK_DEVICES).toHaveLength(5);
    expect(MOCK_CARRIER_LANES).toHaveLength(4);
    expect(MOCK_DAEMONS).toHaveLength(8);
    expect(MOCK_LIVE_EVENTS.length).toBeGreaterThanOrEqual(5);
  });
});
