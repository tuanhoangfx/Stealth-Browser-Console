import { describe, expect, it } from "vitest";
import { DEFAULT_WORKFLOWS } from "../features/workflows/workflow-defaults";
import {
  formatRunHistoryPrimaryLabel,
  resolveWorkflowRunLabel,
} from "../features/workflows/resolve-workflow-run-label";
import { humanizeWorkflowSlug, shortRunRef } from "./run-display";

describe("run-display", () => {
  it("humanizeWorkflowSlug title-cases kebab segments", () => {
    expect(humanizeWorkflowSlug("gmail-login")).toBe("Gmail Login");
    expect(humanizeWorkflowSlug("higgsfield-change-password")).toBe("Higgsfield Change Password");
  });

  it("shortRunRef keeps short ids and truncates long UUIDs to last 6 chars", () => {
    expect(shortRunRef("run-a8f3c2e1-4b5d-6789-0abc-def123456789")).toBe("456789");
    expect(shortRunRef("abc123")).toBe("abc123");
  });
});

describe("resolve-workflow-run-label", () => {
  it("resolveWorkflowRunLabel prefers registry name over slug", () => {
    expect(resolveWorkflowRunLabel("gmail-login", DEFAULT_WORKFLOWS)).toBe("Gmail Login");
    expect(resolveWorkflowRunLabel("higgsfield-change-password", DEFAULT_WORKFLOWS)).toBe(
      "Higgsfield Change Password",
    );
  });

  it("resolveWorkflowRunLabel falls back to humanized slug for unknown ids", () => {
    expect(resolveWorkflowRunLabel("custom-task", [])).toBe("Custom Task");
  });

  it("formatRunHistoryPrimaryLabel joins profile id, browser name, registry task", () => {
    expect(
      formatRunHistoryPrimaryLabel(
        {
          profileId: "0004",
          profileName: "Google",
          workflow: "gmail-login",
        },
        DEFAULT_WORKFLOWS,
      ),
    ).toBe("0004 Google Gmail Login");
  });
});
