import { describe, expect, it } from "vitest";
import { splitChartLegendGlyph } from "./chart-legend-glyphs";

describe("splitChartLegendGlyph", () => {
  it("splits leading emoji from sheet status labels", () => {
    expect(splitChartLegendGlyph("✔️ Completed")).toEqual({ glyph: "✔️", text: "Completed" });
    expect(splitChartLegendGlyph("💲 Paid")).toEqual({ glyph: "💲", text: "Paid" });
  });

  it("returns plain text when no emoji", () => {
    expect(splitChartLegendGlyph("iOS Clone App 3y")).toEqual({ glyph: "", text: "iOS Clone App 3y" });
  });
});
