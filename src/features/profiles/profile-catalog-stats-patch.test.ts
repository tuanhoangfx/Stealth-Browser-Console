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

  it("startup-reconciled decrements active buckets like closed", () => {
    const active = { ...base, closed: 6, opening: 1, running: 2, failed: 1 };
    const stats = patchCatalogStatsForSessionEvent(active, "startup-reconciled");
    expect(stats.running).toBe(1);
    expect(stats.closed).toBe(7);
  });

  it("maps Waiting (ready) KPI directly from deferred agent headless queue count", () => {
    const drifted = { ...base, total: 4999, closed: 5000, opening: 0, running: 0, failed: 0, deferred: 12 };
    const stats = catalogStatsToKpiNumbers(drifted);
    expect(stats.total).toBe(4999);
    expect(stats.ready).toBe(12);
  });

  it("counts opening toward running KPI and excludes headless sessions from running KPI", () => {
    const stats = catalogStatsToKpiNumbers({ ...base, opening: 2, running: 1, deferred: 4 });
    expect(stats.running).toBe(3);
    expect(stats.ready).toBe(4);
    expect(stats.total).toBe(10);

    const withHeadless = catalogStatsToKpiNumbers(
      { ...base, total: 7117, closed: 7091, opening: 0, running: 22, failed: 4, deferred: 7 },
      21,
    );
    expect(withHeadless.running).toBe(1);
    expect(withHeadless.headless).toBe(21);
    expect(withHeadless.ready).toBe(7);

    // When backend supplies exact headedRunning=0, transient opening=1 from an AI Agent headless launch never jumps Running KPI to 1
    const agentHeadlessOpening = catalogStatsToKpiNumbers(
      { ...base, total: 9974, closed: 9967, opening: 1, running: 6, failed: 0, headedRunning: 0, deferred: 19 },
      6,
    );
    expect(agentHeadlessOpening.running).toBe(0);
    expect(agentHeadlessOpening.headless).toBe(6);
    expect(agentHeadlessOpening.ready).toBe(19);
  });

  it("decrements running on profile_close and window-closed events", () => {
    const active = { ...base, closed: 7, opening: 0, running: 2, failed: 1 };
    const afterProfileClose = patchCatalogStatsForSessionEvent(active, "profile_close");
    expect(afterProfileClose.running).toBe(1);
    expect(afterProfileClose.closed).toBe(8);
    const afterWinClose = patchCatalogStatsForSessionEvent(afterProfileClose, "window-closed");
    expect(afterWinClose.running).toBe(0);
    expect(afterWinClose.closed).toBe(9);
  });
});
