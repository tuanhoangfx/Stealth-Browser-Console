import { describe, expect, it, vi } from "vitest";
import { createDataBoxDualAuthGateSubmit } from "./create-data-box-dual-auth-gate-submit";

describe("createDataBoxDualAuthGateSubmit", () => {
  it("adopts data session and relays when dual succeeds", async () => {
    const identity = { user: { id: "hub" } } as never;
    const data = { user: { id: "data" } } as never;
    const adoptSession = vi.fn();
    const relaySessions = vi.fn();
    const afterAdopt = vi.fn(async () => undefined);
    const onSubmit = createDataBoxDualAuthGateSubmit({
      signInWorkspaceDual: vi.fn(async () => ({
        identitySession: identity,
        dataSession: data,
        dataError: null,
        twofaSession: null,
        twofaError: null,
      })),
      adoptSession,
      dataPlaneLabel: "Performance",
      relaySessions,
      afterAdopt,
    });

    const result = await onSubmit("czpgo", "pw", "signin");
    expect(result).toBeUndefined();
    expect(adoptSession).toHaveBeenCalledWith(data);
    expect(relaySessions).toHaveBeenCalledWith(identity, data);
    expect(afterAdopt).toHaveBeenCalledOnce();
  });

  it("returns Hub failure copy when both planes miss", async () => {
    const onSubmit = createDataBoxDualAuthGateSubmit({
      signInWorkspaceDual: vi.fn(async () => ({
        identitySession: null,
        dataSession: null,
        dataError: null,
        twofaSession: null,
        twofaError: null,
      })),
      adoptSession: vi.fn(),
      dataPlaneLabel: "Data Box",
    });
    await expect(onSubmit("x", "y", "signin")).resolves.toMatchObject({
      error: "Sign-in failed on Tool Hub. Check User ID/email and password.",
    });
  });

  it("returns data-plane hint when Hub ok but data missing", async () => {
    const onSubmit = createDataBoxDualAuthGateSubmit({
      signInWorkspaceDual: vi.fn(async () => ({
        identitySession: { user: { id: "hub" } } as never,
        dataSession: null,
        dataError: null,
        twofaSession: null,
        twofaError: null,
      })),
      adoptSession: vi.fn(),
      dataPlaneLabel: "Performance",
    });
    await expect(onSubmit("x", "y", "signin")).resolves.toMatchObject({
      error: expect.stringContaining("Performance"),
    });
  });
});
