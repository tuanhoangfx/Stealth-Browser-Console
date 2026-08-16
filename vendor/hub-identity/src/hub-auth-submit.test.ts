import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE,
  HUB_UNKNOWN_PHONE_MESSAGE,
  HUB_UNKNOWN_USER_ID_MESSAGE,
  signInWithHubPassword,
} from "./hub-auth-submit";

describe("signInWithHubPassword", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns unknown username hint when resolve-login finds no profile", async () => {
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

  it("returns unknown phone hint when resolve-login finds no profile", async () => {
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

    const result = await signInWithHubPassword("0901999888", attempt, "signin");
    expect(result.error?.message).toBe(HUB_UNKNOWN_PHONE_MESSAGE);
    expect(attempt).not.toHaveBeenCalled();
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

  it("tries resolved auth email for phone before failing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, authEmails: ["user@corp.com"] }),
      }),
    );

    const attempt = vi.fn().mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });

    const result = await signInWithHubPassword("0901234567", attempt, "signin");
    expect(result.error).toBeNull();
    expect(result.authEmail).toBe("user@corp.com");
    expect(attempt).toHaveBeenCalledWith("user@corp.com");
  });
});
