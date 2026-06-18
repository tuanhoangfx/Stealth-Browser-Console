import { describe, expect, it } from "vitest";
import { MAX_VISIBLE_KPI } from "../display-prefs/kpi-visible";
import { resolveKpiStripCount } from "./KpiStrip";

describe("resolveKpiStripCount", () => {
  it("returns 0 for empty strip", () => {
    expect(resolveKpiStripCount(0)).toBe(0);
    expect(resolveKpiStripCount(-1)).toBe(0);
  });

  it("passes through counts up to MAX_VISIBLE_KPI", () => {
    expect(resolveKpiStripCount(3)).toBe(3);
    expect(resolveKpiStripCount(MAX_VISIBLE_KPI)).toBe(MAX_VISIBLE_KPI);
  });

  it("clamps when screens pass more than MAX_VISIBLE_KPI tiles", () => {
    expect(resolveKpiStripCount(12)).toBe(MAX_VISIBLE_KPI);
    expect(resolveKpiStripCount(99)).toBe(8);
  });
});
