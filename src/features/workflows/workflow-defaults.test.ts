import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStep, hydrateWorkflowSteps, workflowStepsForRun } from "./workflow-defaults";
import type { WorkflowConfig } from "./workflow-types";

describe("workflow defaults", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: () => "generated-id" });
  });

  it("hydrates imported workflow steps with ids, enabled state, and clamped timeout", () => {
    const hydrated = hydrateWorkflowSteps(
      [{ id: "", kind: "wait", name: "Wait", enabled: false, timeoutMs: 999999 }],
      [createStep("navigate", { value: "https://example.com" })],
      "https://example.com"
    );

    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]).toMatchObject({ id: "generated-id", enabled: false, timeoutMs: 120000 });
  });

  it("syncs first default navigate step to the runtime target URL", () => {
    const workflow: WorkflowConfig = {
      id: "custom",
      name: "Custom",
      description: "test",
      icon: "play",
      group: "Core",
      platform: "Generic",
      action: "open-url",
      targetUrl: "https://old.example",
      takeScreenshot: false,
      closeWhenDone: false,
      inspectMode: false,
      concurrency: 1,
      steps: [createStep("navigate", { value: "{{targetUrl}}" })]
    };

    expect(workflowStepsForRun(workflow, "https://new.example")[0].value).toBe("https://new.example");
  });
});
