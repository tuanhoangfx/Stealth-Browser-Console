import { describe, expect, it, vi } from "vitest";
import { bindSupabaseAuthListener } from "./workspace-auth-session";

/**
 * A failed token refresh must not look like a sign-out.
 *
 * Supabase emits a null-session event when a refresh fails, and a network blip is enough to
 * cause one. Treating every null session as a sign-out dropped the user to the login screen
 * with a valid refresh token — repeatedly in P0020, whose vault pull issues dozens of requests
 * over minutes, so a refresh racing that traffic fails often.
 */
function harness(opts: { getSessionReturns: unknown }) {
  let handler: ((event: string, session: unknown) => void) | null = null;
  const onSession = vi.fn();
  const client = {
    auth: {
      onAuthStateChange: (fn: (event: string, session: unknown) => void) => {
        handler = fn;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: async () => ({ data: { session: opts.getSessionReturns } }),
    },
  };
  bindSupabaseAuthListener({
    isConfigured: () => true,
    client: client as never,
    onSession,
  } as never);
  return { fire: (event: string, session: unknown) => handler?.(event, session), onSession };
}

describe("bindSupabaseAuthListener — null session events", () => {
  it("signs out on an explicit SIGNED_OUT", async () => {
    const h = harness({ getSessionReturns: null });
    h.fire("SIGNED_OUT", null);
    expect(h.onSession).toHaveBeenCalledWith(null);
  });

  it("keeps the session when a refresh blip reports null but the client still has one", async () => {
    const live = { user: { id: "u1" }, access_token: "tok" };
    const h = harness({ getSessionReturns: live });
    h.fire("TOKEN_REFRESHED", null);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.onSession).not.toHaveBeenCalledWith(null);
    expect(h.onSession).toHaveBeenCalledWith(live);
  });

  it("still signs out when the client confirms there is no session", async () => {
    const h = harness({ getSessionReturns: null });
    h.fire("TOKEN_REFRESHED", null);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.onSession).toHaveBeenCalledWith(null);
  });

  it("ignores INITIAL_SESSION null — hub-cache may not have set the session yet", () => {
    const h = harness({ getSessionReturns: null });
    h.fire("INITIAL_SESSION", null);
    expect(h.onSession).not.toHaveBeenCalled();
  });
});
