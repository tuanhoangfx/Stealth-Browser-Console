import { describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { runWorkspaceDualSignIn } from "./workspace-dual-sign-in";

function mockSession(label: string, email = `${label}@infix1.io.vn`): Session {
  return {
    access_token: `${label}-token`,
    refresh_token: `${label}-refresh`,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: `${label}-id`, email } as Session["user"],
  } as Session;
}

describe("runWorkspaceDualSignIn parallel planes", () => {
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
    ).rejects.toMatchObject({ message: "Invalid login credentials" });

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
    ).rejects.toMatchObject({ message: "Invalid login credentials" });

    // Data Box accepted a password Hub refused (drift) — that JWT must not survive.
    expect(plane.revokeSpeculativeSession).toHaveBeenCalledWith(dataSession);
    vi.unstubAllGlobals();
  });
});
