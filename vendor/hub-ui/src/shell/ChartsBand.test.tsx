import { describe, expect, it } from "vitest";
import { resolveChartsBandCount } from "./ChartsBand";
import { MAX_VISIBLE_CHART } from "../display-prefs/chart-visible";

describe("resolveChartsBandCount", () => {
  it("returns 0 when node is empty", () => {
    expect(resolveChartsBandCount(null)).toBe(0);
  });

  it("respects override count", () => {
    expect(resolveChartsBandCount(<span />, 3)).toBe(3);
  });

  it("clamps auto-count to MAX_VISIBLE_CHART", () => {
    expect(
      resolveChartsBandCount(
        <>
          <span />
          <span />
          <span />
          <span />
          <span />
        </>,
      ),
    ).toBe(MAX_VISIBLE_CHART);
  });
});
