import { describe, expect, it } from "vitest";
import { CHART_OTHERS_LABEL, CHART_TOP_N, prepareChartItems, topChartItems } from "./chart-items";

describe("topChartItems", () => {
  it("always appends Others after top N (even when Others is zero)", () => {
    const items = [
      { label: "System", value: 6 },
      { label: "Hub", value: 2 },
      { label: "Users", value: 1 },
    ];
    const rows = topChartItems(items);
    expect(rows).toHaveLength(CHART_TOP_N + 1);
    expect(rows.slice(0, 3).map((r) => r.label)).toEqual(["System", "Hub", "Users"]);
    expect(rows[3]).toMatchObject({ label: CHART_OTHERS_LABEL, value: 0 });
  });

  it("rolls overflow into Others", () => {
    const items = [
      { label: "A", value: 10 },
      { label: "B", value: 8 },
      { label: "C", value: 5 },
      { label: "D", value: 3 },
      { label: "E", value: 1 },
    ];
    const rows = topChartItems(items);
    expect(rows).toHaveLength(4);
    expect(rows[3]).toMatchObject({ label: CHART_OTHERS_LABEL, value: 4 });
  });

  it("prepareChartItems delegates to topChartItems", () => {
    expect(prepareChartItems([{ label: "Only", value: 1 }])).toHaveLength(2);
  });

  it("assigns golden rank colors (green, purple, blue, neutral Others)", () => {
    const items = [
      { label: "A", value: 10 },
      { label: "B", value: 8 },
      { label: "C", value: 5 },
      { label: "D", value: 3 },
    ];
    const rows = prepareChartItems(items);
    expect(rows.map((r) => r.color)).toEqual(["#22c55e", "#a855f7", "#60a5fa", "#64748b"]);
    expect(rows[3]).toMatchObject({ label: CHART_OTHERS_LABEL, value: 3 });
  });
});
