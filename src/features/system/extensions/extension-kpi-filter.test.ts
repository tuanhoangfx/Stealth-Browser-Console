import { describe, expect, it } from "vitest";
import {
  applyExtensionKpiFilterPatch,
  extensionKpiFilterPatch,
  isExtensionKpiFilterActive,
  matchesExtensionKpiFilter,
  withExtensionHeaderStatFilterClicks,
  withExtensionKpiFilterClicks,
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

  it("marks Store and activity KPIs active", () => {
    expect(isExtensionKpiFilterActive("store", ["store"])).toBe(true);
    expect(isExtensionKpiFilterActive("cached", ["store"])).toBe(false);
    expect(isExtensionKpiFilterActive("local", [], "local")).toBe(true);
    expect(isExtensionKpiFilterActive("pinned", [], "pinned")).toBe(true);
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

  it("toggles activity KPI tiles and filters extension rows", () => {
    let activeKpi: string | null = null;
    let kinds: Array<"store"> = ["store"];
    const tiles = withExtensionKpiFilterClicks(
      [
        { prefKey: "local", label: "Local Operator", value: 1 },
        { prefKey: "pinned", label: "Auto-Pinned", value: 2 },
      ],
      kinds,
      (next) => {
        kinds = next;
      },
      activeKpi,
      (next) => {
        activeKpi = next;
      },
    );
    tiles[0].onClick?.();
    expect(kinds).toEqual([]);
    expect(activeKpi).toBe("local");
    expect(
      matchesExtensionKpiFilter(
        { kind: "local", localKey: "e0002-browser-operator", name: "Operator", unpackedPath: "E:/x" },
        activeKpi,
      ),
    ).toBe(true);
  });
});
