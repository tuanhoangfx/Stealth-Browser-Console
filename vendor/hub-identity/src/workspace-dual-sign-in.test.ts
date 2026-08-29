import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { HUB_UNKNOWN_USER_ID_MESSAGE } from "./hub-auth-submit";
import { runWorkspaceDualSignIn, shouldRetrySpeculativePlane } from "./workspace-dual-sign-in";
import { clearHubResolveLoginPrefetch } from "./hub-resolve-login-client";

function mockSession(label: string, email = `u_${label}@auth.infi.internal`): Session {
  return {
    access_token: `${label}-token`,
    refresh_token: `${label}-refresh`,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: `${label}-id`, email } as Session["user"],
  } as Session;
}

describe("shouldRetrySpeculativePlane", () => {
  it("retries only the empty-email no-op", () => {
    expect(shouldRetrySpeculativePlane(undefined)).toBe(true);
    expect(shouldRetrySpeculativePlane({ session: null, error: null })).toBe(true);
    expect(
      shouldRetrySpeculativePlane({
        session: null,
        error: "Workspace data identity missing (Hub opaque required).",
      }),
    ).toBe(true);
    expect(
      shouldRetrySpeculativePlane({
        session: null,
        error: "Workspace data sign-in timed out. Please try again.",
      }),
    ).toBe(false);
    expect(
      shouldRetrySpeculativePlane({ session: mockSession("data"), error: null }),
    ).toBe(false);
    expect(
      shouldRetrySpeculativePlane({ session: null, error: "shared-data-plane" }),
    ).toBe(false);
  });
});

describe("runWorkspaceDualSignIn parallel planes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    clearHubResolveLoginPrefetch();
  });

  it("authenticates data planes in parallel", async () => {
    const delayMs = 40;
    const started: number[] = [];

    const slowPlane = (tag: string) =>
      vi.fn(async () => {
        started.push(Date.now());
        await new Promise((r) => setTimeout(r, delayMs));
        return { session: mockSession(tag), error: null };
      });

    const planeA = slowPlane("a");
    const planeB = slowPlane("b");

    // Username sign-in is resolve-login only — never invents loginId@brand.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          authEmails: ["u_hub-id@auth.infi.internal"],
        }),
      })),
    );

    const hub = {
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: mockSession("hub") },
          error: null,
        })),
      },
      from: vi.fn(() => ({
        update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
      })),
    };

    const t0 = Date.now();
    try {
      const result = await runWorkspaceDualSignIn("czpgo", "secret", "signin", {
        getHubClient: () => hub as never,
        cacheHubIdentityFromSession: vi.fn(),
        planes: [{ authenticate: planeA }, { authenticate: planeB }],
      });
      const elapsed = Date.now() - t0;

      expect(result.planes).toHaveLength(2);
      expect(planeA).toHaveBeenCalledOnce();
      expect(planeB).toHaveBeenCalledOnce();
      expect(started).toHaveLength(2);
      expect(Math.abs(started[0] - started[1])).toBeLessThan(delayMs);
      expect(elapsed).toBeLessThan(delayMs * 2);
      expect(hub.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "u_hub-id@auth.infi.internal",
        password: "secret",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never touches a data plane when the Hub password grant fails", async () => {
    const plane = vi.fn(async () => ({ session: mockSession("data"), error: null }));
    const cacheHubIdentityFromSession = vi.fn();
    // Resolve User ID → real auth email so the rejection is a credential deny, not a lookup outage.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, authEmails: ["czpgo@outlook.com"] }),
      })),
    );
    const hub = {
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: null },
          error: { message: "Invalid login credentials" },
        })),
      },
    };

    await expect(
      runWorkspaceDualSignIn("czpgo", "wrong-password", "signin", {
        getHubClient: () => hub as never,
        cacheHubIdentityFromSession,
        planes: [{ authenticate: plane }],
      }),
    ).rejects.toMatchObject({
      message:
        "Incorrect password for this username. If you recently changed your Tool Hub password, use the new one.",
    });

    // A mirror sign-in here would leave a Data JWT for an identity Hub just rejected.
    expect(plane).not.toHaveBeenCalled();
    expect(cacheHubIdentityFromSession).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("runs a revocable plane alongside the Hub grant instead of after it", async () => {
    const grantMs = 60;
    const startedAt: Record<string, number> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, authEmails: ["u_hub-id@auth.infi.internal"] }),
      })),
    );
    const hub = {
      auth: {
        signInWithPassword: vi.fn(async () => {
          startedAt.hub = Date.now();
          await new Promise((r) => setTimeout(r, grantMs));
          return {
            data: { session: mockSession("hub", "u_hub-id@auth.infi.internal") },
            error: null,
          };
        }),
      },
    };
    const plane = {
      authenticate: vi.fn(async () => {
        startedAt.plane = Date.now();
        await new Promise((r) => setTimeout(r, grantMs));
        return { session: mockSession("data"), error: null };
      }),
      revokeSpeculativeSession: vi.fn(),
    };

    const t0 = Date.now();
    const result = await runWorkspaceDualSignIn("czpgo", "secret", "signin", {
      getHubClient: () => hub as never,
      cacheHubIdentityFromSession: vi.fn(),
      planes: [plane],
    });

    expect(result.planes[0]?.session).toBeTruthy();
    expect(plane.authenticate).toHaveBeenCalledOnce();
    expect(plane.revokeSpeculativeSession).not.toHaveBeenCalled();
    expect(Math.abs(startedAt.hub - startedAt.plane)).toBeLessThan(grantMs);
    expect(Date.now() - t0).toBeLessThan(grantMs * 2);
    expect(result.timings.parallel).toBe(true);
    expect(result.timings.hubMs).toBeGreaterThanOrEqual(grantMs - 20);
    expect(result.timings.planes[0]?.speculative).toBe(true);
    expect(result.timings.totalMs).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("invokes onTimings with parallel plane measurements", async () => {
    const grantMs = 30;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, authEmails: ["u_hub-id@auth.infi.internal"] }),
      })),
    );
    const hub = {
      auth: {
        signInWithPassword: vi.fn(async () => {
          await new Promise((r) => setTimeout(r, grantMs));
          return {
            data: { session: mockSession("hub", "u_hub-id@auth.infi.internal") },
            error: null,
          };
        }),
      },
    };
    const plane = {
      authenticate: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, grantMs));
        return { session: mockSession("data"), error: null };
      }),
      revokeSpeculativeSession: vi.fn(),
    };
    const onTimings = vi.fn();

    await runWorkspaceDualSignIn("czpgo", "secret", "signin", {
      getHubClient: () => hub as never,
      cacheHubIdentityFromSession: vi.fn(),
      planes: [plane],
      onTimings,
    });

    expect(onTimings).toHaveBeenCalledOnce();
    const timings = onTimings.mock.calls[0][0];
    expect(timings.parallel).toBe(true);
    expect(timings.hubMs).toBeGreaterThan(0);
    expect(timings.planes).toHaveLength(1);
    expect(timings.planes[0].ok).toBe(true);
    expect(timings.totalMs).toBeGreaterThanOrEqual(timings.hubMs);
    vi.unstubAllGlobals();
  });

  it("revokes the parallel plane session when Hub rejects the password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, authEmails: ["u_hub-id@auth.infi.internal"] }),
      })),
    );
    const dataSession = mockSession("data");
    const plane = {
      authenticate: vi.fn(async () => ({ session: dataSession, error: null })),
      revokeSpeculativeSession: vi.fn(),
    };
    const hub = {
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: null },
          error: { message: "Invalid login credentials" },
        })),
      },
    };

    await expect(
      runWorkspaceDualSignIn("czpgo", "wrong-password", "signin", {
        getHubClient: () => hub as never,
        cacheHubIdentityFromSession: vi.fn(),
        planes: [plane],
      }),
    ).rejects.toMatchObject({
      message:
        "Incorrect password for this username. If you recently changed your Tool Hub password, use the new one.",
    });

    // Data Box accepted a password Hub refused (drift) — that JWT must not survive.
    expect(plane.revokeSpeculativeSession).toHaveBeenCalledWith(dataSession);
    vi.unstubAllGlobals();
  });

  it("overlaps Hub and Data Box even when resolve-login returns two emails", async () => {
    const grantMs = 50;
    const startedAt: Record<string, number> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          authEmails: ["u_hub-id@auth.infi.internal"],
        }),
      })),
    );
    const hub = {
      auth: {
        signInWithPassword: vi.fn(async () => {
          startedAt.hub = Date.now();
          await new Promise((r) => setTimeout(r, grantMs));
          return {
            data: { session: mockSession("hub", "u_hub-id@auth.infi.internal") },
            error: null,
          };
        }),
      },
    };
    const plane = {
      authenticate: vi.fn(async () => {
        startedAt.plane = Date.now();
        await new Promise((r) => setTimeout(r, grantMs));
        return { session: mockSession("data", "u_hub-id@auth.infi.internal"), error: null };
      }),
      revokeSpeculativeSession: vi.fn(),
    };

    const t0 = Date.now();
    const result = await runWorkspaceDualSignIn("duyceo01", "secret", "signin", {
      getHubClient: () => hub as never,
      cacheHubIdentityFromSession: vi.fn(),
      planes: [plane],
    });

    expect(result.planes[0]?.session?.user?.email).toBe("u_hub-id@auth.infi.internal");
    expect(plane.revokeSpeculativeSession).not.toHaveBeenCalled();
    expect(plane.authenticate).toHaveBeenCalledOnce();
    expect(plane.authenticate.mock.calls[0]?.[0]?.mirrorEmail).toBe("u_hub-id@auth.infi.internal");
    expect(Math.abs(startedAt.hub - startedAt.plane)).toBeLessThan(grantMs);
    expect(Date.now() - t0).toBeLessThan(grantMs * 2);
    expect(result.timings.parallel).toBe(true);
    vi.unstubAllGlobals();
  });

  it("does not speculative-start a vault plane without revoke — waits for Hub email", async () => {
    const grantMs = 40;
    let vaultMirrorEmail = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, authEmails: ["u_hub-id@auth.infi.internal"] }),
      })),
    );
    const hub = {
      auth: {
        signInWithPassword: vi.fn(async () => {
          await new Promise((r) => setTimeout(r, grantMs));
          return {
            data: { session: mockSession("hub", "u_hub-id@auth.infi.internal") },
            error: null,
          };
        }),
      },
    };
    const dataPlane = {
      authenticate: vi.fn(async () => ({ session: mockSession("data"), error: null })),
      revokeSpeculativeSession: vi.fn(),
    };
    const vaultPlane = {
      authenticate: vi.fn(async ({ mirrorEmail }: { mirrorEmail: string }) => {
        vaultMirrorEmail = mirrorEmail;
        return { session: mockSession("vault"), error: null };
      }),
    };

    const result = await runWorkspaceDualSignIn("czpgo", "secret", "signin", {
      getHubClient: () => hub as never,
      cacheHubIdentityFromSession: vi.fn(),
      planes: [dataPlane, vaultPlane],
    });

    expect(result.planes[1]?.session).toBeTruthy();
    expect(vaultMirrorEmail).toBe("u_hub-id@auth.infi.internal");
    expect(vaultPlane.authenticate).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("recovers Hub session when resolve-login is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      })),
    );
    const hub = {
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: null },
          error: { message: "should not grant without resolve" },
        })),
      },
    };
    const recovered = mockSession("recovered", "cs00616@outlook.com");
    const recoverHubSession = vi.fn(async () => ({ identitySession: recovered }));
    const plane = vi.fn(async () => ({ session: mockSession("data"), error: null }));

    const result = await runWorkspaceDualSignIn("cs00616", "secret", "signin", {
      getHubClient: () => hub as never,
      cacheHubIdentityFromSession: vi.fn(),
      recoverHubSession,
      planes: [{ authenticate: plane }],
    });

    expect(recoverHubSession).toHaveBeenCalledOnce();
    expect(result.identitySession).toBe(recovered);
    expect(hub.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("does not re-run a speculative plane that already timed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, authEmails: ["czpgo@outlook.com"] }),
      })),
    );
    const hub = {
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: mockSession("hub", "czpgo@outlook.com") },
          error: null,
        })),
      },
    };
    const plane = {
      authenticate: vi.fn(async () => ({
        session: null,
        error: "Workspace data sign-in timed out. Please try again.",
      })),
      revokeSpeculativeSession: vi.fn(),
    };

    const result = await runWorkspaceDualSignIn("czpgo", "secret", "signin", {
      getHubClient: () => hub as never,
      cacheHubIdentityFromSession: vi.fn(),
      planes: [plane],
    });

    expect(plane.authenticate).toHaveBeenCalledOnce();
    expect(result.planes[0]?.error).toMatch(/timed out/i);
    vi.unstubAllGlobals();
  });

  it("retries a speculative no-op after Hub returns the real email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, authEmails: ["czpgo@outlook.com"] }),
      })),
    );
    const hub = {
      auth: {
        signInWithPassword: vi.fn(async () => ({
          data: { session: mockSession("hub", "czpgo@outlook.com") },
          error: null,
        })),
      },
    };
    const plane = {
      authenticate: vi
        .fn()
        .mockResolvedValueOnce({
          session: null,
          error: "Workspace data identity missing (Hub opaque required).",
        })
        .mockResolvedValueOnce({ session: mockSession("data"), error: null }),
      revokeSpeculativeSession: vi.fn(),
    };

    const result = await runWorkspaceDualSignIn("czpgo", "secret", "signin", {
      getHubClient: () => hub as never,
      cacheHubIdentityFromSession: vi.fn(),
      planes: [plane],
    });

    expect(plane.authenticate).toHaveBeenCalledTimes(2);
    expect(result.planes[0]?.session).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("does not recover when resolve-login finds no user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, authEmails: [] }),
      })),
    );
    const recoverHubSession = vi.fn();

    await expect(
      runWorkspaceDualSignIn("nouser99", "secret", "signin", {
        getHubClient: () =>
          ({
            auth: { signInWithPassword: vi.fn() },
          }) as never,
        cacheHubIdentityFromSession: vi.fn(),
        recoverHubSession,
        planes: [{ authenticate: vi.fn() }],
      }),
    ).rejects.toMatchObject({ message: HUB_UNKNOWN_USER_ID_MESSAGE });

    expect(recoverHubSession).not.toHaveBeenCalled();
  });
});
