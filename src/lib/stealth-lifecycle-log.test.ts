import { describe, expect, it } from "vitest";
import { formatStealthLifecycleLogLine } from "./stealth-lifecycle-log";

describe("formatStealthLifecycleLogLine", () => {
  it("formats boot rows", () => {
    const line = formatStealthLifecycleLogLine({
      at: "2026-08-29T09:37:21.000Z",
      kind: "boot",
      version: "6.1.1",
      apiPort: 6003,
    });
    expect(line).toContain("Boot v6.1.1");
    expect(line).toContain(":6003");
  });

  it("formats shutdown rows with update metadata", () => {
    const line = formatStealthLifecycleLogLine({
      at: "2026-08-29T09:35:41.000Z",
      kind: "shutdown",
      reason: "update-quit-auto",
      runningProfiles: 2,
      updateVersion: "6.1.1",
      updateState: "downloaded",
    });
    expect(line).toContain("Shutdown: update-quit-auto");
    expect(line).toContain("profiles=2");
    expect(line).toContain("update=6.1.1");
    expect(line).toContain("state=downloaded");
  });
});
