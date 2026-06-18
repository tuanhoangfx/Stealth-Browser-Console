import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  defaultKpiKeysFromDefs,
  enforceKpiMaxOnAdd,
  MAX_VISIBLE_KPI,
  resolveVisibleKpiKeys,
  useResolvedVisibleKpiKeys,
} from "./kpi-visible";
import { visibleKpiKeysSignature } from "../directory-band/directory-band-sync";

const KPI_DEFS = [
  { key: "total", label: "Total" },
  { key: "shown", label: "Shown" },
  { key: "ready", label: "Ready" },
  { key: "used", label: "Used" },
];

const DEFAULT_KEYS = defaultKpiKeysFromDefs(KPI_DEFS);

describe("visibleKpiKeysSignature", () => {
  it("is stable for the same Set reference", () => {
    const stored = new Set(["total", "shown"]);
    expect(visibleKpiKeysSignature(stored)).toBe(visibleKpiKeysSignature(stored));
  });

  it("changes when stored keys change", () => {
    expect(visibleKpiKeysSignature(new Set(["total"]))).not.toBe(
      visibleKpiKeysSignature(new Set(["total", "shown"])),
    );
  });
});

describe("enforceKpiMaxOnAdd", () => {
  const defs = [
    { key: "a", label: "A" },
    { key: "b", label: "B" },
    { key: "c", label: "C" },
    { key: "d", label: "D" },
    { key: "e", label: "E" },
    { key: "f", label: "F" },
    { key: "g", label: "G" },
    { key: "h", label: "H" },
  ];

  it("allows up to MAX_VISIBLE_KPI selections", () => {
    const visible = new Set(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(enforceKpiMaxOnAdd(visible, defs, "h").size).toBe(MAX_VISIBLE_KPI);
  });

  it("drops earliest keys in pref order when exceeding max", () => {
    const visible = new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
    const next = enforceKpiMaxOnAdd(visible, defs, "i");
    expect([...next]).toEqual(["b", "c", "d", "e", "f", "g", "h", "i"]);
  });
});

describe("useResolvedVisibleKpiKeys", () => {
  it("returns a stable Set reference across rerenders when prefs unchanged", () => {
    const stored = new Set(["total", "shown", "ready", "used"]);
    const { result, rerender } = renderHook(
      ({ value }: { value: Set<string> | null }) => useResolvedVisibleKpiKeys(value, DEFAULT_KEYS, KPI_DEFS),
      { initialProps: { value: stored } },
    );

    const first = result.current;
    rerender({ value: stored });
    expect(result.current).toBe(first);
    expect([...result.current]).toEqual([...resolveVisibleKpiKeys(stored, DEFAULT_KEYS, KPI_DEFS)]);
  });

  it("updates when stored keys change", () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: Set<string> | null }) => useResolvedVisibleKpiKeys(value, DEFAULT_KEYS, KPI_DEFS),
      { initialProps: { value: new Set(["total", "shown"]) } },
    );

    const first = result.current;
    rerender({ value: new Set(["total", "shown", "ready"]) });
    expect(result.current).not.toBe(first);
    expect(result.current.has("ready")).toBe(true);
  });
});
