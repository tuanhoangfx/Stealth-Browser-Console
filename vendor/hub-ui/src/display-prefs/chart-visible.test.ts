import { describe, expect, it } from "vitest";
import {
  MAX_VISIBLE_CHART,
  defaultChartKeysFromDefs,
  enforceChartMaxOnAdd,
  resolveVisibleChartKeys,
} from "./chart-visible";

const DEFS = [
  { key: "a", label: "A" },
  { key: "b", label: "B" },
  { key: "c", label: "C" },
  { key: "d", label: "D" },
  { key: "e", label: "E" },
];

describe("chart-visible", () => {
  it("defaults to first four chart keys", () => {
    expect([...defaultChartKeysFromDefs(DEFS)]).toEqual(["a", "b", "c", "d"]);
  });

  it("caps resolved visible charts at max", () => {
    const stored = new Set(["a", "b", "c", "d", "e"]);
    expect([...resolveVisibleChartKeys(stored, defaultChartKeysFromDefs(DEFS), DEFS)]).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("enforceChartMaxOnAdd drops earliest keys", () => {
    const visible = new Set(["a", "b", "c", "d", "e"]);
    expect([...enforceChartMaxOnAdd(visible, DEFS, "e")]).toEqual(["b", "c", "d", "e"]);
    expect(MAX_VISIBLE_CHART).toBe(4);
  });
});
