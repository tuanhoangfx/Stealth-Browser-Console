import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HUB_PHONE_WRONG_PASSWORD_MESSAGE,
  HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE,
  HUB_UNKNOWN_PHONE_MESSAGE,
  HUB_UNKNOWN_USER_ID_MESSAGE,
  HUB_USERNAME_WRONG_PASSWORD_MESSAGE,
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

  it("returns username wrong-password hint when resolve finds email but password wrong", async () => {
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
    expect(result.error?.message).toBe(HUB_USERNAME_WRONG_PASSWORD_MESSAGE);
    // Resolved account only — skip synthetic @infix1 / legacy retries (slow GoTrue).
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith("czpgo@outlook.com");
  });

  it("skips synthetic fallbacks once resolve-login returns opaque auth email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          authEmails: ["u_12770af0-93b5-429e-85f1-9ecb4f66e9b5@auth.infi.internal"],
        }),
      }),
    );

    const attempt = vi.fn().mockResolvedValue({
      data: { session: null },
      error: new Error("Invalid login credentials"),
    });

    const result = await signInWithHubPassword("duyceo01", attempt, "signin");
    expect(result.error?.message).toBe(HUB_USERNAME_WRONG_PASSWORD_MESSAGE);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith(
      "u_12770af0-93b5-429e-85f1-9ecb4f66e9b5@auth.infi.internal",
    );
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

  it("returns phone-linked wrong-password hint when resolve finds email but password wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, authEmails: ["008@inp"] }),
      }),
    );

    const attempt = vi.fn().mockResolvedValue({
      data: { session: null },
      error: new Error("Invalid login credentials"),
    });

    const result = await signInWithHubPassword("0825846888", attempt, "signin");
    expect(result.error?.message).toBe(HUB_PHONE_WRONG_PASSWORD_MESSAGE);
    expect(result.authEmail).toBe("008@inp");
    expect(attempt).toHaveBeenCalledWith("008@inp");
  });
});
