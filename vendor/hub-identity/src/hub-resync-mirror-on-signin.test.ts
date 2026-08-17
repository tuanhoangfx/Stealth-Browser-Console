import { describe, expect, it, vi } from "vitest";
import { HUB_MIRROR_PASSWORD_DRIFT_MESSAGE } from "./hub-mirror-sign-in-error";
import { resyncMirrorPasswordThenRetrySignIn } from "./hub-resync-mirror-on-signin";

describe("resyncMirrorPasswordThenRetrySignIn", () => {
  it("retries sign-in after a successful mirror password sync", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, via: "password_sync", authEmail: "u@auth.infi.internal" }),
      })),
    );
    const retrySignIn = vi.fn(async () => ({
      session: { id: "ok" },
      error: null,
    }));

    try {
      const result = await resyncMirrorPasswordThenRetrySignIn({
        mirrorEmail: "u@auth.infi.internal",
        password: "123123",
        loginInput: "phuongkd01",
        retrySignIn,
      });
      expect(result.session).toEqual({ id: "ok" });
      expect(result.error).toBeNull();
      expect(result.via).toBe("password_sync");
      expect(retrySignIn).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns drift copy when sync API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ ok: false, error: "sync failed" }),
      })),
    );
    const retrySignIn = vi.fn(async () => ({ session: { id: "x" }, error: null }));

    try {
      const result = await resyncMirrorPasswordThenRetrySignIn({
        mirrorEmail: "u@auth.infi.internal",
        password: "123123",
        retrySignIn,
      });
      expect(result.session).toBeNull();
      expect(result.error).toBe("sync failed");
      expect(retrySignIn).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns drift copy when mirror email is empty", async () => {
    const result = await resyncMirrorPasswordThenRetrySignIn({
      mirrorEmail: "  ",
      password: "123123",
      retrySignIn: async () => ({ session: { id: "x" }, error: null }),
    });
    expect(result.session).toBeNull();
    expect(result.error).toBe(HUB_MIRROR_PASSWORD_DRIFT_MESSAGE);
  });
});
