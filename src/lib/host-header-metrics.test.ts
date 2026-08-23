import { describe, expect, it } from "vitest";
import type { HostMetrics } from "../types";
import {
  buildHostHeaderStats,
  formatGib,
  formatHostCpuValue,
  formatHostRamValue,
  hostLoadTone,
  resolveHostHeaderVisibleKeys,
} from "./host-header-metrics";

const SAMPLE: HostMetrics = {
  ok: true,
  cpuPercent: 24.4,
  cpuReady: true,
  ramUsedBytes: 18.2 * 1024 ** 3,
  ramTotalBytes: 32 * 1024 ** 3,
  ramPercent: 56.9,
  sampledAt: 1,
};

describe("host header metrics", () => {
  it("formats CPU and RAM for the header chip", () => {
    expect(formatHostCpuValue(SAMPLE)).toBe("24%");
    expect(formatHostRamValue(SAMPLE, true)).toBe("18.2 / 32 GB · 57%");
    expect(formatHostRamValue(SAMPLE, false)).toBe("18 GB · 57%");
    expect(formatHostCpuValue({ ...SAMPLE, cpuReady: false })).toBe("—");
    expect(formatGib(31.92 * 1024 ** 3, true)).toBe("32");
  });

  it("tones by load", () => {
    expect(hostLoadTone(10)).toBe("text-emerald-300");
    expect(hostLoadTone(75)).toBe("text-amber-300");
    expect(hostLoadTone(95)).toBe("text-rose-300");
    expect(hostLoadTone(null)).toBe("text-slate-400");
  });

  it("ignores stale Running/Failed Display prefs", () => {
    expect([...resolveHostHeaderVisibleKeys(new Set(["running", "failed"]), new Set(["cpu", "ram"]))]).toEqual([
      "cpu",
      "ram",
    ]);
    expect([...resolveHostHeaderVisibleKeys(new Set(["ram"]), new Set(["cpu", "ram"]))]).toEqual(["ram"]);
  });

  it("builds visible CPU/RAM chips without profile-count keys", () => {
    const stats = buildHostHeaderStats(new Set(["cpu", "ram"]), SAMPLE);
    expect(stats.map((item) => item.key)).toEqual(["cpu", "ram"]);
    expect(stats.map((item) => item.value)).toEqual(["24%", "18.2 / 32 GB · 57%"]);
    expect(stats.some((item) => item.key === "running")).toBe(false);
  });

  it("compacts RAM on a narrow header", () => {
    const stats = buildHostHeaderStats(new Set(["ram"]), SAMPLE, { wide: false });
    expect(stats[0]?.value).toBe("18 GB · 57%");
  });
});
