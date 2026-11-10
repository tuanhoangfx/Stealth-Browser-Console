import { describe, expect, it } from "vitest";
import {
  buildWorkflowKpiItems,
  computeWorkflowKpiNumbers,
  resolveWorkflowKpiVisibleKeys,
} from "./workflow-kpi-items";
import type { WorkflowConfig } from "./workflow-types";

function wf(patch: Partial<WorkflowConfig> & Pick<WorkflowConfig, "id">): WorkflowConfig {
  return {
    name: patch.id,
    description: "",
    icon: "play",
    group: "Core",
    platform: "web",
    action: "open-url",
    targetUrl: "https://example.com",
    takeScreenshot: false,
    closeWhenDone: false,
    inspectMode: false,
    concurrency: 1,
    steps: [],
    ...patch,
  };
}

describe("computeWorkflowKpiNumbers", () => {
  const now = new Date(2026, 7, 23, 15, 0, 0);
  const today = new Date(2026, 7, 23, 8, 0, 0).toISOString();

  it("rolls catalog counts like P0005 Service tiles", () => {
    const rows = [
      wf({
        id: "a",
        createdAt: today,
        updatedAt: today,
        lastRunAt: today,
        steps: [{ id: "s", kind: "navigate", name: "Go", enabled: true }],
      }),
      wf({ id: "b" }),
    ];
    expect(computeWorkflowKpiNumbers(rows, now)).toEqual({
      total: 2,
      createToday: 1,
      createWeek: 1,
      updateToday: 1,
      ranToday: 1,
      withSteps: 1,
      idle: 1,
      empty: 1,
    });
  });
});

describe("buildWorkflowKpiItems", () => {
  it("uses Scripts · Create today · Create This Week · Update today labels", () => {
    const items = buildWorkflowKpiItems({
      total: 4,
      createToday: 1,
      createWeek: 2,
      updateToday: 2,
      ranToday: 0,
      withSteps: 3,
      idle: 3,
      empty: 1,
    });
    expect(items.map((item) => item.prefKey)).toEqual([
      "total",
      "create_today",
      "create_week",
      "update_today",
      "ran_today",
      "with_steps",
      "idle",
      "empty",
    ]);
    expect(items[0]).toMatchObject({ label: "Scripts", value: 4, tone: "indigo" });
    expect(items[1]).toMatchObject({ label: "Create today", value: 1 });
    expect(items[2]).toMatchObject({ label: "Create This Week", value: 2 });
  });
});

describe("resolveWorkflowKpiVisibleKeys", () => {
  it("falls back when URL still has Profile or legacy Scripts keys", () => {
    expect([...resolveWorkflowKpiVisibleKeys(null)]).toHaveLength(8);
    expect([...resolveWorkflowKpiVisibleKeys(new Set(["total", "running", "failed", "ready"]))]).toHaveLength(8);
    expect([...resolveWorkflowKpiVisibleKeys(new Set(["total", "selected", "steps"]))]).toHaveLength(8);
    expect(resolveWorkflowKpiVisibleKeys(new Set(["total", "idle"]))).toEqual(new Set(["total", "idle"]));
  });
});
