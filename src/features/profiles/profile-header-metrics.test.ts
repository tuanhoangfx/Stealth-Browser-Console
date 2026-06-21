import { describe, expect, it } from "vitest";
import { buildProfileHeaderStats } from "./profile-header-metrics";

describe("buildProfileHeaderStats", () => {
  const counts = { total: 100, ready: 90, running: 5, failed: 2 };

  it("builds visible header stats from known keys", () => {
    const stats = buildProfileHeaderStats(new Set(["running", "ready", "total"]), counts);
    expect(stats.map((item) => item.key)).toEqual(["running", "ready", "total"]);
    expect(stats.map((item) => item.label)).toEqual(["Running", "Ready", "Profiles"]);
    expect(stats[0]?.toneClass).toBe("text-emerald-400");
  });

  it("ignores retired failed key without throwing", () => {
    const stats = buildProfileHeaderStats(new Set(["failed", "running"]), counts);
    expect(stats.map((item) => item.key)).toEqual(["running"]);
  });
});
