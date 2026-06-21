import { describe, expect, it } from "vitest";
import {
  validateCreateProfilePayload,
  validateOpenUrlPayload,
  validateTargetUrl
} from "../electron/ipc-contracts.cjs";

describe("ipc-contracts", () => {
  it("validates target URL", () => {
    expect(validateTargetUrl("https://example.com")).toBe("https://example.com/");
    expect(() => validateTargetUrl("ftp://x.com")).toThrow();
  });

  it("validates create profile payload", () => {
    expect(validateCreateProfilePayload({ name: "Test" }).name).toBe("Test");
    expect(() => validateCreateProfilePayload({ name: "  " })).toThrow();
  });

  it("validates open url payload", () => {
    const payload = validateOpenUrlPayload({
      profileId: "abc",
      targetUrl: "https://chatgpt.com"
    });
    expect(payload.profileId).toBe("abc");
    expect(payload.screenshot).toBe(true);
  });

  it("validates open url payload with workflow steps", () => {
    const payload = validateOpenUrlPayload({
      profileId: "abc",
      targetUrl: "https://forms.gle/test",
      workflowAction: "google-form-ag-appeal",
      workflowId: "ag-appeal-form",
      steps: [{ kind: "navigate", value: "https://forms.gle/test" }]
    });
    expect(payload.workflowAction).toBe("google-form-ag-appeal");
    expect(payload.steps).toHaveLength(1);
  });
});
