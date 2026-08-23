import { afterEach, describe, expect, it, vi } from "vitest";
import { HUB_SIGNUP_FAILED_MESSAGE } from "./extract-auth-error-text";
import { HUB_AUTH_FETCH_TIMEOUT_MESSAGE } from "./hub-auth-fetch";
import {
  HUB_PHONE_WRONG_PASSWORD_MESSAGE,
  HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE,
  HUB_UNKNOWN_PHONE_MESSAGE,
  HUB_UNKNOWN_USER_ID_MESSAGE,
  HUB_USERNAME_WRONG_PASSWORD_MESSAGE,
  isHubIdentityTransientFailure,
  signInWithHubPassword,
} from "./hub-auth-submit";
import { clearHubResolveLoginPrefetch } from "./hub-resolve-login-client";

describe("signInWithHubPassword", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearHubResolveLoginPrefetch();
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

  it("skips synthetic fallbacks when caller already provided extraAuthEmails", async () => {
    const attempt = vi.fn().mockResolvedValue({
      data: { session: null },
      error: new Error("Invalid login credentials"),
    });

    const result = await signInWithHubPassword("duyceo01", attempt, "signin", {
      extraAuthEmails: ["u_12770af0-93b5-429e-85f1-9ecb4f66e9b5@auth.infi.internal"],
    });
    expect(result.error?.message).toBe(HUB_USERNAME_WRONG_PASSWORD_MESSAGE);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith(
      "u_12770af0-93b5-429e-85f1-9ecb4f66e9b5@auth.infi.internal",
    );
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

  it("uses a provisional opaque email for username Sign Up (no resolve-login)", async () => {
    const attempt = vi.fn().mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });

    const result = await signInWithHubPassword("CS01333", attempt, "signup");
    expect(result.error).toBeNull();
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt.mock.calls[0][0]).toMatch(/^pending_cs01333_[a-z0-9]+@auth\.infi\.internal$/);
  });

  it("does not treat a filled username Sign Up as an empty login", async () => {
    const attempt = vi.fn().mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });

    const result = await signInWithHubPassword("CS01333", attempt, "signup");
    expect(result.error?.message ?? "").not.toMatch(/Enter your username, email, or phone/i);
    expect(attempt).toHaveBeenCalled();
  });

  it("replaces empty GoTrue {} on username Sign Up with English copy", async () => {
    const attempt = vi.fn().mockResolvedValue({
      data: { session: null },
      error: new Error("{}"),
    });

    const result = await signInWithHubPassword("CS00962", attempt, "signup");
    expect(result.error?.message).toBe(HUB_SIGNUP_FAILED_MESSAGE);
    expect(result.error?.message).not.toBe("{}");
  });

  it("skips a second resolve-login when the caller already looked up unavailable", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const attempt = vi.fn();

    const result = await signInWithHubPassword("czpgo", attempt, "signin", {
      resolveLookup: "unavailable",
    });

    expect(result.error?.message).toBe(HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(attempt).not.toHaveBeenCalled();
  });
});

describe("isHubIdentityTransientFailure", () => {
  it("matches resolve-login outage and fetch timeout only", () => {
    expect(isHubIdentityTransientFailure(HUB_RESOLVE_LOGIN_UNAVAILABLE_MESSAGE)).toBe(true);
    expect(isHubIdentityTransientFailure(HUB_AUTH_FETCH_TIMEOUT_MESSAGE)).toBe(true);
    expect(isHubIdentityTransientFailure("The operation was aborted")).toBe(true);
    expect(isHubIdentityTransientFailure(HUB_UNKNOWN_USER_ID_MESSAGE)).toBe(false);
    expect(isHubIdentityTransientFailure(HUB_USERNAME_WRONG_PASSWORD_MESSAGE)).toBe(false);
    expect(isHubIdentityTransientFailure("")).toBe(false);
  });
});
