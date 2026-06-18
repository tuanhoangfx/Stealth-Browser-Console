import { describe, expect, it } from "vitest";
import { DEFAULT_BROWSER_HOME_URL } from "../../lib/startup-url";
import { resolveWorkflowRunUrl } from "./resolve-workflow-run-url";
import type { WorkflowConfig } from "./workflow-types";
import type { ProfileRow } from "../../types";

const baseWorkflow = (patch: Partial<WorkflowConfig> = {}): WorkflowConfig =>
  ({
    id: "wf-1",
    name: "Test",
    action: "open-url",
    targetUrl: "",
    steps: [],
    ...patch
  }) as WorkflowConfig;

const baseProfile = (patch: Partial<ProfileRow> = {}): ProfileRow =>
  ({
    id: "p-1",
    name: "Profile",
    startupUrl: "",
    ...patch
  }) as ProfileRow;

describe("resolveWorkflowRunUrl", () => {
  it("prefers workflow targetUrl when set", () => {
    expect(resolveWorkflowRunUrl(baseWorkflow({ targetUrl: "https://example.com" }), baseProfile())).toBe(
      "https://example.com"
    );
  });

  it("falls back to profile startup for open-url when targetUrl empty", () => {
    expect(
      resolveWorkflowRunUrl(baseWorkflow({ targetUrl: "" }), baseProfile({ startupUrl: "https://github.com" }))
    ).toBe("https://github.com/");
  });

  it("uses browser home when both workflow and profile URLs empty", () => {
    expect(resolveWorkflowRunUrl(baseWorkflow({ targetUrl: "" }), baseProfile({ startupUrl: "" }))).toBe(
      DEFAULT_BROWSER_HOME_URL
    );
  });

  it("does not fall back for non open-url actions", () => {
    expect(
      resolveWorkflowRunUrl(
        baseWorkflow({ action: "google-form-ag-appeal", targetUrl: "" }),
        baseProfile({ startupUrl: "https://github.com" })
      )
    ).toBe("");
  });
});
