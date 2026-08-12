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
});
