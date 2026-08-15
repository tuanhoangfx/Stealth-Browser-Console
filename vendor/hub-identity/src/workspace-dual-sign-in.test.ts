import { describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { runWorkspaceDualSignIn } from "./workspace-dual-sign-in";

function mockSession(label: string): Session {
  return {
    access_token: `${label}-token`,
    refresh_token: `${label}-refresh`,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: `${label}-id`, email: `${label}@infix1.io.vn` } as Session["user"],
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
});
