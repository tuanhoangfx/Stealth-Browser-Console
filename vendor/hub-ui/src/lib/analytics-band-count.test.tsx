import { Fragment } from "react";
import { describe, expect, it } from "vitest";
import {
  ANALYTICS_BAND_MAX,
  clampBandSlotCount,
  countAnalyticsBandSlots,
} from "./analytics-band-count";

describe("ANALYTICS_BAND_MAX", () => {
  it("caps KPI at 8 and Charts at 4", () => {
    expect(ANALYTICS_BAND_MAX.kpi).toBe(8);
    expect(ANALYTICS_BAND_MAX.chart).toBe(4);
  });
});

describe("clampBandSlotCount", () => {
  it("returns 0 for non-positive counts", () => {
    expect(clampBandSlotCount(0, 8)).toBe(0);
    expect(clampBandSlotCount(-1, 4)).toBe(0);
  });

  it("clamps to 1…max", () => {
    expect(clampBandSlotCount(3, 4)).toBe(3);
    expect(clampBandSlotCount(9, 8)).toBe(8);
    expect(clampBandSlotCount(1, 4)).toBe(1);
  });
});

describe("countAnalyticsBandSlots", () => {
  it("returns 0 for empty input", () => {
    expect(countAnalyticsBandSlots(null)).toBe(0);
    expect(countAnalyticsBandSlots(undefined)).toBe(0);
    expect(countAnalyticsBandSlots(false)).toBe(0);
  });

  it("counts a single element", () => {
    expect(countAnalyticsBandSlots(<span />)).toBe(1);
  });

  it("counts fragment children and skips null/false", () => {
    expect(
      countAnalyticsBandSlots(
        <>
          <span />
          {null}
          {false}
          <span />
          <span />
        </>,
      ),
    ).toBe(3);
  });

  it("counts nested fragments", () => {
    expect(
      countAnalyticsBandSlots(
        <>
          <Fragment>
            <span />
            <span />
          </Fragment>
          <span />
        </>,
      ),
    ).toBe(3);
  });

  it("counts array children", () => {
    expect(countAnalyticsBandSlots([<span key="a" />, <span key="b" />])).toBe(2);
  });
});
