import { describe, expect, it } from "vitest";
import {
  CATALOG_STATS_FOCUS_RECONCILE_MS,
  shouldReconcileCatalogStatsOnFocus,
} from "./useCatalogStatsFocusReconcile";

describe("shouldReconcileCatalogStatsOnFocus", () => {
  it("runs on first focus", () => {
    expect(shouldReconcileCatalogStatsOnFocus(0, 1000)).toBe(true);
  });

  it("throttles within interval", () => {
    const t = 10_000;
    expect(
      shouldReconcileCatalogStatsOnFocus(t, t + CATALOG_STATS_FOCUS_RECONCILE_MS - 1),
    ).toBe(false);
    expect(shouldReconcileCatalogStatsOnFocus(t, t + CATALOG_STATS_FOCUS_RECONCILE_MS)).toBe(true);
  });
});
