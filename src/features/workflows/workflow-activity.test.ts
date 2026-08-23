import { describe, expect, it } from "vitest";
import { matchesWorkflowActivity } from "./workflow-activity";
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

describe("matchesWorkflowActivity", () => {
  const now = new Date(2026, 7, 23, 15, 0, 0);
  const today = new Date(2026, 7, 23, 10, 0, 0).toISOString();
  const yesterday = new Date(2026, 7, 22, 10, 0, 0).toISOString();

  it("matches create / update / ran today and idle / empty", () => {
    const created = wf({
      id: "c",
      createdAt: today,
      lastRunAt: yesterday,
      steps: [{ id: "1", kind: "navigate", name: "Go", enabled: true }],
    });
    const idleEmpty = wf({ id: "i" });
    expect(matchesWorkflowActivity(created, "create_today", now)).toBe(true);
    expect(matchesWorkflowActivity(created, "ran_today", now)).toBe(false);
    expect(matchesWorkflowActivity(idleEmpty, "idle", now)).toBe(true);
    expect(matchesWorkflowActivity(idleEmpty, "empty", now)).toBe(true);
    expect(matchesWorkflowActivity(created, "empty", now)).toBe(false);
    expect(matchesWorkflowActivity(created, null, now)).toBe(true);
  });
});
