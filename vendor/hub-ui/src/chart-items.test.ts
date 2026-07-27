import { describe, expect, it } from "vitest";
import { CHART_OTHERS_LABEL, CHART_TOP_N, prepareChartItems, topChartItems, withChartLegendIcon } from "./chart-items";

describe("topChartItems", () => {
  it("omits Other when every bucket fits in top N", () => {
    const items = [
      { label: "System", value: 6 },
      { label: "Hub", value: 2 },
      { label: "Users", value: 1 },
    ];
    const rows = topChartItems(items);
    expect(rows).toHaveLength(CHART_TOP_N);
    expect(rows.map((r) => r.label)).toEqual(["System", "Hub", "Users"]);
  });

  it("rolls overflow into Other", () => {
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

  it("pins an explicit Other bucket to the final row", () => {
    const rows = topChartItems(
      [
        { label: "Other", value: 99 },
        { label: "A", value: 10 },
        { label: "B", value: 8 },
        { label: "C", value: 5 },
      ],
      4,
    );
    expect(rows.map((row) => row.label)).toEqual(["A", "B", "C", CHART_OTHERS_LABEL]);
  });

  it("prepareChartItems respects topN (slot / price bands)", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ label: `B${i}`, value: 10 - i, color: "#f00" }));
    expect(prepareChartItems(items, { topN: 8 })).toHaveLength(7);
    expect(prepareChartItems(items, { topN: 3 })).toHaveLength(4);
  });

  it("preserveOrder keeps fixed-bucket sequence", () => {
    const items = [
      { label: "Need notify", value: 1 },
      { label: "Notified today", value: 0 },
      { label: "Action", value: 9 },
      { label: "Waiting", value: 3 },
    ];
    expect(prepareChartItems(items, { topN: 4, preserveOrder: true }).map((r) => r.label)).toEqual([
      "Need notify",
      "Notified today",
      "Action",
      "Waiting",
    ]);
  });

  it("keeps heat color rows free of Lucide legend injection", () => {
    const row = withChartLegendIcon({ label: "Full", value: 57, color: "#f43f5e" });
    expect(row.color).toBe("#f43f5e");
    expect(row.iconMeta).toBeNull();
  });
});
