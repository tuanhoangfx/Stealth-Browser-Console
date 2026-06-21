import { describe, expect, it } from "vitest";
import {
  catalogStatsToKpiNumbers,
  patchCatalogStatsForSessionEvent,
  patchCatalogStatsForStatusChange,
} from "./profile-catalog-stats-patch";
import type { ProfileCatalogStats } from "../../types";

const base: ProfileCatalogStats = {
  total: 10,
  closed: 8,
  opening: 0,
  running: 1,
  failed: 1,
  groupCounts: {},
};

describe("profile-catalog-stats-patch", () => {
  it("transitions closed → opening → running", () => {
    let stats = patchCatalogStatsForStatusChange(base, "closed", "opening");
    expect(stats.closed).toBe(7);
    expect(stats.opening).toBe(1);
    stats = patchCatalogStatsForStatusChange(stats, "opening", "running");
    expect(stats.opening).toBe(0);
    expect(stats.running).toBe(2);
  });

  it("patches from session event when row is off-page", () => {
    const stats = patchCatalogStatsForSessionEvent(base, "opening");
    expect(stats.closed).toBe(7);
    expect(stats.opening).toBe(1);
  });

  it("reconciles patch drift so ready never exceeds total", () => {
    const drifted = { ...base, total: 4999, closed: 5000, opening: 0, running: 0, failed: 0 };
    const stats = catalogStatsToKpiNumbers(drifted);
    expect(stats.total).toBe(4999);
    expect(stats.ready).toBe(4999);
  });

  it("counts opening toward running KPI", () => {
    const stats = catalogStatsToKpiNumbers({ ...base, opening: 2, running: 1 });
    expect(stats.running).toBe(3);
    expect(stats.ready).toBe(6);
    expect(stats.total).toBe(10);
  });
});
