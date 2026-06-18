import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CHART_OTHERS_LABEL } from "../chart-items";
import { CHART_OTHERS_BAR_COLOR, CHART_RANK_COLORS } from "../lib/chart-palette";
import { MiniBarChart } from "./MiniBarChart";

function browserColor(hex: string): string {
  const el = document.createElement("div");
  el.style.backgroundColor = hex;
  return el.style.backgroundColor.replace(/\s/g, "");
}

describe("MiniBarChart golden contract", () => {
  it("renders top-3 + Others with rank bar colors", () => {
    const items = [
      { label: "Ready", value: 8 },
      { label: "Needs review", value: 4 },
      { label: "Active", value: 3 },
      { label: "Draft", value: 2 },
    ];
    const { container } = render(<MiniBarChart title="By Health" items={items} />);

    expect(container.querySelectorAll(".hub-chart-row").length).toBe(4);
    expect(container.querySelector(".hub-analytics-caption")?.textContent).toBe("By Health");

    const fills = [...container.querySelectorAll(".hub-chart-row > div.relative > div")].map(
      (el) => (el as HTMLElement).style.backgroundColor,
    );
    const expected = [...CHART_RANK_COLORS, CHART_OTHERS_BAR_COLOR].map(browserColor);
    expect(fills.map((c) => c.replace(/\s/g, ""))).toEqual(expected);
    expect(container.textContent).toContain(CHART_OTHERS_LABEL);
  });

  it("uses neutral Others bar without glow", () => {
    const items = [
      { label: "A", value: 5 },
      { label: "B", value: 3 },
      { label: "C", value: 2 },
      { label: "D", value: 1 },
    ];
    const { container } = render(<MiniBarChart title="By Role" items={items} />);
    const fills = [...container.querySelectorAll(".hub-chart-row > div.relative > div")];
    const othersFill = fills[3] as HTMLElement | undefined;
    expect(othersFill?.style.backgroundColor.replace(/\s/g, "")).toBe(browserColor(CHART_OTHERS_BAR_COLOR));
    expect(othersFill?.style.boxShadow).toBe("");
  });

  it("right-aligns numeric values via hub-chart-row__value", () => {
    const { container } = render(<MiniBarChart title="By Activity" items={[{ label: "Online", value: 12 }]} />);
    expect(container.querySelectorAll(".hub-chart-row__value").length).toBeGreaterThan(0);
  });
});
