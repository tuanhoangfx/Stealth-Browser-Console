import { describe, expect, it } from "vitest";
import { chartPanelTitleFromDefs, GOLDEN_CHART_PANEL_TITLES } from "./chart-panel-titles";

describe("chartPanelTitleFromDefs", () => {
  it("uses golden title map before display-prefs label", () => {
    const defs = [{ key: "health_bar" as const, label: "By Health (bar)" }];
    expect(chartPanelTitleFromDefs(defs, "health_bar")).toBe(GOLDEN_CHART_PANEL_TITLES.health_bar);
    expect(chartPanelTitleFromDefs(defs, "role_bar")).toBe("By Role");
  });

  it("falls back to stripped pref label for unknown keys", () => {
    const defs = [{ key: "custom_bar" as const, label: "Custom metric (bar)" }];
    expect(chartPanelTitleFromDefs(defs, "custom_bar")).toBe("Custom metric");
  });
});
