import { describe, expect, it } from "vitest";
import {
  canonicalizeHubEntityLogAt,
  mergeHubEntityAuditLogs,
  normalizeHubEntityLog,
} from "./hub-entity-log";

describe("canonicalizeHubEntityLogAt", () => {
  it("normalizes +00:00 to Z", () => {
    expect(canonicalizeHubEntityLogAt("2026-07-24T08:47:20.427+00:00")).toBe(
      "2026-07-24T08:47:20.427Z",
    );
  });
});

describe("normalizeHubEntityLog / mergeHubEntityAuditLogs twins", () => {
  it("collapses Z vs +00:00 twins", () => {
    const log = normalizeHubEntityLog([
      {
        at: "2026-07-24T08:47:20.427Z",
        message: "Price: 1 → 2",
        changes: [{ field: "price", before: "1", after: "2" }],
      },
      {
        at: "2026-07-24T08:47:20.427+00:00",
        message: "Price: 1 → 2",
        changes: [{ field: "price", before: "1", after: "2" }],
      },
    ]);
    expect(log).toHaveLength(1);
    expect(log[0]?.at).toBe("2026-07-24T08:47:20.427Z");
  });

  it("merge collapses Z vs +00:00 across local/remote", () => {
    const merged = mergeHubEntityAuditLogs(
      [{ at: "2026-07-24T06:25:55.135Z", message: "Note: a → b" }],
      [{ at: "2026-07-24T06:25:55.135+00:00", message: "Note: a → b" }],
    );
    expect(merged).toHaveLength(1);
  });
});
