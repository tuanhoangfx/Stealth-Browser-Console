import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE,
  HUB_UNKNOWN_USER_ID_MESSAGE,
  signInWithHubPassword,
} from "./hub-auth-submit";

describe("signInWithHubPassword", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns unknown user ID hint when resolve-login finds no profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, authEmails: [] }),
      }),
    );

    const attempt = vi.fn().mockResolvedValue({
      data: { session: null },
      error: new Error("Invalid login credentials"),
    });

    const result = await signInWithHubPassword("notauser", attempt, "signin");
    expect(result.error?.message).toBe(HUB_UNKNOWN_USER_ID_MESSAGE);
  });

  it("returns service unavailable when resolve-login API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 405,
        json: async () => ({}),
      }),
    );

    const attempt = vi.fn().mockResolvedValue({
      data: { session: null },
      error: new Error("Invalid login credentials"),
    });

    const result = await signInWithHubPassword("czpgo", attempt, "signin");
    expect(result.error?.message).toBe(HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE);
  });

  it("returns invalid login when resolve finds email but password wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, authEmails: ["czpgo@outlook.com"] }),
      }),
    );

    const attempt = vi.fn().mockResolvedValue({
      data: { session: null },
      error: new Error("Invalid login credentials"),
    });

    const result = await signInWithHubPassword("czpgo", attempt, "signin");
    expect(result.error?.message).toBe("Invalid login credentials");
  });
});
