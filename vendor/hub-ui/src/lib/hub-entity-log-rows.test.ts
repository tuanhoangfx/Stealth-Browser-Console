import { describe, expect, it } from "vitest";
import {
  flattenHubEntityLog,
  formatHubEntityLogActionLabel,
  resolveHubEntityLogEntryChanges,
} from "./hub-entity-log-rows";
import type { HubEntityLogEntry } from "./hub-entity-log";

/**
 * Golden SSOT for every tool's change-log rail (P0005 HubChangeLogList,
 * P0020 TwofaChangeLogList, …). A regression here breaks all of them.
 */
const parseMessage = (message: string) => {
  const map: Record<string, string> = { Password: "password", Account: "account", Note: "note" };
  const out: { field: string; before?: string; after?: string }[] = [];
  for (const part of message.split(" · ").map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(.+?):\s*(.+?)\s*→\s*(.+)$/);
    if (!m) continue;
    const field = map[m[1].trim()];
    if (!field) continue;
    out.push({ field, before: m[2].trim(), after: m[3].trim() });
  }
  return out;
};

describe("resolveHubEntityLogEntryChanges", () => {
  it("prefers structured changes and drops no-ops", () => {
    const entry: HubEntityLogEntry = {
      at: "2026-06-23T00:00:00.000Z",
      message: "x",
      changes: [
        { field: "note", before: "a", after: "b" },
        { field: "tier", before: "gold", after: "gold" },
      ],
    };
    expect(resolveHubEntityLogEntryChanges(entry)).toEqual([{ field: "note", before: "a", after: "b" }]);
  });

  it("falls back to parsed legacy message when no structured changes", () => {
    const entry: HubEntityLogEntry = { at: "2026-06-23T00:00:00.000Z", message: "Password: 1 → 2" };
    expect(resolveHubEntityLogEntryChanges(entry, { parseMessage })).toEqual([
      { field: "password", before: "1", after: "2" },
    ]);
  });

  it("returns [] for event-only messages without an arrow", () => {
    expect(
      resolveHubEntityLogEntryChanges({ at: "2026-06-23T00:00:00.000Z", message: "Account imported" }, { parseMessage }),
    ).toEqual([]);
  });

  it("drops whitespace-only diffs via the default isNoOpChange (trimmed compare)", () => {
    const entry: HubEntityLogEntry = {
      at: "2026-06-23T00:00:00.000Z",
      message: "x",
      changes: [{ field: "note", before: " a ", after: "a" }],
    };
    expect(resolveHubEntityLogEntryChanges(entry)).toEqual([]);
  });
});

describe("flattenHubEntityLog", () => {
  it("splits a multi-field legacy message into one row per change with fieldLabel", () => {
    const rows = flattenHubEntityLog(
      [{ at: "2026-06-23T00:00:00.000Z", message: "Account: a → b · Password: 1 → 2" }],
      { parseMessage, labelFor: (c) => (c.field === "password" ? "Password" : "Account") },
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.change?.field).toBe("account");
    expect(rows[0]?.fieldLabel).toBe("Account");
    expect(rows[1]?.change?.field).toBe("password");
    expect(rows[1]?.fieldLabel).toBe("Password");
    expect(rows.map((r) => r.key)).toEqual([
      "2026-06-23T00:00:00.000Z-0-account-0",
      "2026-06-23T00:00:00.000Z-0-password-1",
    ]);
  });

  it("keeps plain event messages as message rows (no change)", () => {
    const rows = flattenHubEntityLog([{ at: "2026-06-23T00:00:00.000Z", message: "Account imported" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.message).toBe("Account imported");
    expect(rows[0]?.change).toBeUndefined();
    expect(rows[0]?.key).toBe("2026-06-23T00:00:00.000Z-0-msg");
  });

  it("cycles dotIndex 0..2 per entry", () => {
    const entries: HubEntityLogEntry[] = Array.from({ length: 4 }, (_, i) => ({
      at: `2026-06-2${i}T00:00:00.000Z`,
      message: `Event ${i}`,
    }));
    expect(flattenHubEntityLog(entries).map((r) => r.dotIndex)).toEqual([0, 1, 2, 0]);
  });
});

describe("formatHubEntityLogActionLabel", () => {
  it("updated when both sides present", () => {
    expect(
      formatHubEntityLogActionLabel({ change: { field: "password", before: "a", after: "b" }, fieldLabel: "Password" }),
    ).toBe("Password updated");
  });

  it("added when value first set", () => {
    expect(
      formatHubEntityLogActionLabel({ change: { field: "password", before: "", after: "secret" }, fieldLabel: "Password" }),
    ).toBe("Password added");
  });

  it("removed when value cleared", () => {
    expect(
      formatHubEntityLogActionLabel({ change: { field: "password", before: "secret", after: "" }, fieldLabel: "Password" }),
    ).toBe("Password removed");
  });

  it("falls back to field name when no label", () => {
    expect(formatHubEntityLogActionLabel({ change: { field: "tier", before: "a", after: "b" } })).toBe("tier updated");
  });

  it("returns the raw message for event rows, honouring the fallback", () => {
    expect(formatHubEntityLogActionLabel({ message: "Account imported" })).toBe("Account imported");
    expect(formatHubEntityLogActionLabel({})).toBe("Updated");
    expect(formatHubEntityLogActionLabel({}, "Account updated")).toBe("Account updated");
  });
});
