import { describe, expect, it } from "vitest";
import { kpiTilesSignature, chartKeysSignature, barChartSeriesSignature } from "./directory-band-sync";

describe("directory-band-sync", () => {
  it("builds kpi signature from pref keys and hints", () => {
    const sig = kpiTilesSignature([
      { label: "Shown", prefKey: "shown", value: 2, hint: "4 total" },
      { label: "Total", prefKey: "total", value: 4 },
    ]);
    expect(sig).toBe("shown:2:4 total|total:4:");
  });

  it("orders chart keys by definition list", () => {
    const visible = new Set(["usage_bar", "service_bar"]);
    expect(chartKeysSignature(visible, ["service_bar", "identity_bar", "usage_bar"])).toBe(
      "service_bar,usage_bar",
    );
  });

  it("fingerprints bar series values", () => {
    expect(
      barChartSeriesSignature([
        { label: "Gmail", value: 1 },
        { label: "Other", value: 2 },
      ]),
    ).toBe("Gmail:1,Other:2");
  });
});
