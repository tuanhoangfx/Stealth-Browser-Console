import { describe, expect, it } from "vitest";
import { enrichFilterDefs } from "./filter-option-counts";
import type { FilterDef, FilterValues } from "../shell/FilterBar";

type Item = { id: string; color: string; size: string };

const DEFS: FilterDef[] = [
  {
    key: "color",
    label: "Color",
    options: [
      { value: "red", label: "Red" },
      { value: "blue", label: "Blue" },
    ],
  },
  {
    key: "size",
    label: "Size",
    options: [
      { value: "s", label: "S" },
      { value: "l", label: "L" },
    ],
  },
];

const ITEMS: Item[] = [
  { id: "1", color: "red", size: "s" },
  { id: "2", color: "red", size: "l" },
  { id: "3", color: "blue", size: "s" },
];

function matches(item: Item, query: string, filters: FilterValues): boolean {
  if (query && !item.id.includes(query)) return false;
  const colors = filters.color ?? [];
  const sizes = filters.size ?? [];
  if (colors.length && !colors.includes(item.color)) return false;
  if (sizes.length && !sizes.includes(item.size)) return false;
  return true;
}

function matchesOption(item: Item, key: string, value: string): boolean {
  if (key === "color") return item.color === value;
  if (key === "size") return item.size === value;
  return false;
}

describe("enrichFilterDefs", () => {
  it("counts options with faceted exclusion of active dimension", () => {
    const defs = enrichFilterDefs(ITEMS, DEFS, "", {}, matches, matchesOption);
    const color = defs.find((d) => d.key === "color");
    const size = defs.find((d) => d.key === "size");
    expect(color?.totalCount).toBe(3);
    expect(color?.options.find((o) => o.value === "red")?.count).toBe(2);
    expect(size?.options.find((o) => o.value === "s")?.count).toBe(2);
  });

  it("respects active filter on other dimensions", () => {
    const defs = enrichFilterDefs(ITEMS, DEFS, "", { color: ["red"] }, matches, matchesOption);
    const size = defs.find((d) => d.key === "size");
    expect(size?.totalCount).toBe(2);
    expect(size?.options.find((o) => o.value === "l")?.count).toBe(1);
  });
});
