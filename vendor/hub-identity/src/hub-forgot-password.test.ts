import { describe, expect, it, vi } from "vitest";
import { createHubForgotPasswordHandler } from "./hub-forgot-password";

describe("createHubForgotPasswordHandler", () => {
  it("returns synthetic hint for user id login", async () => {
    const handler = createHubForgotPasswordHandler({
      isHubConfigured: () => true,
      resetPasswordForEmail: vi.fn(),
    });
    const result = await handler("alice");
    expect(result).toMatch(/Link email on Tool Hub/i);
  });

  it("sends reset email for linked address", async () => {
    const reset = vi.fn().mockResolvedValue({ error: null });
    const handler = createHubForgotPasswordHandler({
      isHubConfigured: () => true,
      resetPasswordForEmail: reset,
      redirectOrigin: "https://example.test",
      successMessage: "Sent.",
    });
    const result = await handler("ops@gmail.com");
    expect(reset).toHaveBeenCalledWith("ops@gmail.com", "https://example.test/");
    expect(result).toBe("Sent.");
  });
});
