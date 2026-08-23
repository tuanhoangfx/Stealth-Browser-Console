import { describe, expect, it } from "vitest";
import {
  buildWorkflowStoreKpiItems,
  computeWorkflowStoreKpiNumbers,
  matchesStoreActivity,
  resolveWorkflowStoreKpiVisibleKeys,
} from "./workflow-store-kpi-items";
import type { WorkflowStoreEntry } from "./workflow-store-types";

function entry(patch: Partial<WorkflowStoreEntry> & Pick<WorkflowStoreEntry, "id">): WorkflowStoreEntry {
  return {
    name: patch.id,
    description: "",
    version: "1.0.0",
    platform: "web",
    group: "Core",
    source: "supabase",
    sortOrder: 0,
    ...patch,
  };
}

describe("computeWorkflowStoreKpiNumbers", () => {
  const now = new Date(2026, 7, 23, 15, 0, 0);
  const today = new Date(2026, 7, 23, 8, 0, 0).toISOString();

  it("splits Local vs catalog Installed vs Available", () => {
    const rows = [
      entry({ id: "local", createdAt: today, updatedAt: today }),
      entry({ id: "remote" }),
      entry({ id: "installed" }),
    ];
    expect(
      computeWorkflowStoreKpiNumbers(rows, new Set(["local"]), new Set(["installed"]), 2, now),
    ).toEqual({
      total: 3,
      createToday: 1,
      updateToday: 1,
      local: 1,
      installed: 1,
      available: 1,
      selected: 2,
    });
  });
});

describe("matchesStoreActivity", () => {
  it("keeps Local and Installed mutually exclusive; Selected is not a row filter", () => {
    const local = entry({ id: "local" });
    const available = entry({ id: "open" });
    const localIds = new Set(["local"]);
    const installedIds = new Set<string>();
    expect(matchesStoreActivity(local, "local", localIds, installedIds)).toBe(true);
    expect(matchesStoreActivity(local, "installed", localIds, installedIds)).toBe(false);
    expect(matchesStoreActivity(available, "available", localIds, installedIds)).toBe(true);
    expect(matchesStoreActivity(available, "selected", localIds, installedIds)).toBe(true);
  });
});

describe("buildWorkflowStoreKpiItems", () => {
  it("uses Store · Local · Installed labels", () => {
    const items = buildWorkflowStoreKpiItems({
      total: 5,
      createToday: 1,
      updateToday: 1,
      local: 1,
      installed: 2,
      available: 3,
      selected: 0,
    });
    expect(items.map((item) => [item.prefKey, item.label])).toEqual([
      ["total", "Store"],
      ["create_today", "Create today"],
      ["update_today", "Update today"],
      ["local", "Local"],
      ["installed", "Installed"],
      ["available", "Available"],
      ["selected", "Selected"],
    ]);
  });
});

describe("resolveWorkflowStoreKpiVisibleKeys", () => {
  it("ignores Profile URL keys and upgrades the merged Installed strip", () => {
    expect([...resolveWorkflowStoreKpiVisibleKeys(new Set(["total", "running"]))]).toHaveLength(7);
    expect(
      resolveWorkflowStoreKpiVisibleKeys(
        new Set(["total", "create_today", "update_today", "installed", "available", "selected"]),
      ),
    ).toEqual(new Set(["total", "create_today", "update_today", "local", "installed", "available", "selected"]));
    expect(resolveWorkflowStoreKpiVisibleKeys(new Set(["total", "available"]))).toEqual(
      new Set(["total", "available"]),
    );
  });
});
