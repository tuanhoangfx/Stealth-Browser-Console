import { describe, expect, it, vi } from "vitest";
import { createDataBoxDualAuthGateSubmit } from "./create-data-box-dual-auth-gate-submit";
import { HUB_SIGNUP_FAILED_MESSAGE } from "./extract-auth-error-text";
import { HUB_MIRROR_PASSWORD_DRIFT_MESSAGE } from "./hub-mirror-sign-in-error";
import { HUB_USERNAME_WRONG_PASSWORD_MESSAGE } from "./hub-auth-submit";

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

  it("rewrites misleading Hub wrong-password copy when Hub ok but data failed", async () => {
    const onSubmit = createDataBoxDualAuthGateSubmit({
      signInWorkspaceDual: vi.fn(async () => ({
        identitySession: { user: { id: "hub" } } as never,
        dataSession: null,
        dataError: HUB_USERNAME_WRONG_PASSWORD_MESSAGE,
        twofaSession: null,
        twofaError: null,
      })),
      adoptSession: vi.fn(),
      dataPlaneLabel: "workspace",
    });
    await expect(onSubmit("haikd01", "pw", "signin")).resolves.toMatchObject({
      error: HUB_MIRROR_PASSWORD_DRIFT_MESSAGE,
    });
  });

  it("maps AbortError copy to a retryable timeout", async () => {
    const abort = Object.assign(new Error("signal is aborted without reason"), { name: "AbortError" });
    const onSubmit = createDataBoxDualAuthGateSubmit({
      signInWorkspaceDual: vi.fn(async () => {
        throw abort;
      }),
      adoptSession: vi.fn(),
      dataPlaneLabel: "Performance",
    });
    await expect(onSubmit("duyceo01", "pw", "signin")).resolves.toMatchObject({
      error: expect.stringContaining("timed out"),
    });
  });

  it("maps empty GoTrue {} on Sign Up to English copy", async () => {
    const onSubmit = createDataBoxDualAuthGateSubmit({
      signInWorkspaceDual: vi.fn(async () => {
        throw new Error("{}");
      }),
      adoptSession: vi.fn(),
      dataPlaneLabel: "Data Box",
    });
    await expect(onSubmit("CS00962", "pw", "signup")).resolves.toMatchObject({
      error: HUB_SIGNUP_FAILED_MESSAGE,
    });
  });

  it("treats dataError {} as missing detail on Sign Up", async () => {
    const onSubmit = createDataBoxDualAuthGateSubmit({
      signInWorkspaceDual: vi.fn(async () => ({
        identitySession: null,
        dataSession: null,
        dataError: "{}",
        twofaSession: null,
        twofaError: null,
      })),
      adoptSession: vi.fn(),
      dataPlaneLabel: "Data Box",
    });
    await expect(onSubmit("CS00962", "pw", "signup")).resolves.toMatchObject({
      error: expect.stringMatching(/sign-up failed on tool hub/i),
    });
  });
});
