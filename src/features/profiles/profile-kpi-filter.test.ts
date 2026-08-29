import { describe, expect, it } from "vitest";
import {
  applyProfileKpiFilterPatch,
  isProfileKpiFilterActive,
  profileKpiFilterPatch,
  withProfileHeaderStatFilterClicks,
} from "./profile-kpi-filter";

describe("profileKpiFilterPatch", () => {
  it("sets Ready → closed status", () => {
    expect(profileKpiFilterPatch("ready", {})).toEqual({ status: ["closed"] });
  });

  it("toggles clear when already active", () => {
    expect(profileKpiFilterPatch("running", { status: ["running", "opening"] })).toEqual({});
  });

  it("clears all filters on total when any active", () => {
    expect(profileKpiFilterPatch("total", { status: ["failed"], group: ["g1"] })).toEqual({});
    expect(profileKpiFilterPatch("total", {})).toBeNull();
    expect(profileKpiFilterPatch("total", { status: [], group: [] })).toBeNull();
  });

  it("marks active when status matches", () => {
    expect(isProfileKpiFilterActive("failed", { status: ["failed"] })).toBe(true);
    expect(isProfileKpiFilterActive("ready", { status: ["failed"] })).toBe(false);
    expect(isProfileKpiFilterActive("total", { status: ["failed"] })).toBe(false);
  });

  it("wires header stats to the same patch as KPI tiles", () => {
    const applied: Array<{ groupIds: string[]; statuses: string[] }> = [];
    const [stat] = withProfileHeaderStatFilterClicks(
      [{ key: "running", label: "Running", value: 2, toneClass: "" }],
      [],
      [],
      (next) => applied.push(next),
    );
    expect(stat.active).toBe(false);
    stat.onClick?.();
    expect(applied).toEqual([{ groupIds: [], statuses: ["running", "opening"] }]);
  });

  it("sets Running filter to running + opening", () => {
    expect(profileKpiFilterPatch("running", {})).toEqual({ status: ["running", "opening"] });
  });

  it("applies state setters for directory chrome", () => {
    expect(applyProfileKpiFilterPatch("running", ["g1"], [])).toEqual({
      groupIds: ["g1"],
      statuses: ["running", "opening"],
    });
    expect(applyProfileKpiFilterPatch("total", ["g1"], ["running"])).toEqual({
      groupIds: [],
      statuses: [],
    });
  });
});
