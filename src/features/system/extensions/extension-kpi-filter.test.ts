import { describe, expect, it } from "vitest";
import {
  applyExtensionKpiFilterPatch,
  extensionKpiFilterPatch,
  isExtensionKpiFilterActive,
  withExtensionHeaderStatFilterClicks,
} from "./extension-kpi-filter";

describe("extensionKpiFilterPatch", () => {
  it("Store sets Kind store and toggles off", () => {
    expect(extensionKpiFilterPatch("store", [])).toEqual({ kind: ["store"] });
    expect(extensionKpiFilterPatch("store", ["store"])).toEqual({ kind: [] });
  });

  it("Cached clears Kind when any active", () => {
    expect(extensionKpiFilterPatch("cached", ["store"])).toEqual({ kind: [] });
    expect(extensionKpiFilterPatch("cached", [])).toBeNull();
  });

  it("marks Store active", () => {
    expect(isExtensionKpiFilterActive("store", ["store"])).toBe(true);
    expect(isExtensionKpiFilterActive("cached", ["store"])).toBe(false);
  });

  it("applies Kind state for directory chrome", () => {
    expect(applyExtensionKpiFilterPatch("store", [])).toEqual(["store"]);
    expect(applyExtensionKpiFilterPatch("cached", [])).toBeNull();
  });

  it("wires header stats to the same Kind patch as KPI tiles", () => {
    const applied: string[][] = [];
    const [stat] = withExtensionHeaderStatFilterClicks(
      [{ key: "store", label: "Store", value: 4, toneClass: "" }],
      [],
      (next) => applied.push(next),
    );
    expect(stat.active).toBe(false);
    stat.onClick?.();
    expect(applied).toEqual([["store"]]);
  });
});
