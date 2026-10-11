// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createToolSessionCache, normalizeToolSession } from "./tool-session-cache";

const SESSION = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  expires_at: 9_999_999_999,
  token_type: "bearer",
  user: {
    id: "user-1",
    email: "a@corp.com",
    app_metadata: {},
    user_metadata: { login_id: "cs01290" },
    aud: "authenticated",
    created_at: "",
  },
} as const;

describe("tool-session-cache", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("stores in localStorage", () => {
    const cache = createToolSessionCache({
      storageKey: "p:test-session-v2",
      eventName: "p:test-session",
    });
    cache.cache(SESSION);
    expect(cache.read()?.access_token).toBe("access-1");
    expect(cache.read()?.login_id).toBe("cs01290");
    expect(localStorage.getItem("p:test-session-v2")).toBeTruthy();
  });

  it("restores login_id into user_metadata (opaque Store buyer paint)", () => {
    const cache = createToolSessionCache({
      storageKey: "p:test-session-v2",
      eventName: "p:test-session",
    });
    cache.cache({
      ...SESSION,
      user: {
        ...SESSION.user,
        email: "u_65f9ae5b-302a-4275-8b03-f600ea613fa2@auth.infi.internal",
        user_metadata: { login_id: "cs01290", full_name: "Hiệu Nguyễn" },
      },
    } as typeof SESSION);
    const restored = cache.sessionFromSnapshot(cache.read());
    expect(restored?.user.email).toMatch(/^u_/);
    expect(restored?.user.user_metadata?.login_id).toBe("cs01290");
  });

  it("backfills login_id when tokens unchanged but snapshot lacked it", () => {
    const cache = createToolSessionCache({
      storageKey: "p:test-session-v2",
      eventName: "p:test-session",
    });
    localStorage.setItem(
      "p:test-session-v2",
      JSON.stringify({
        access_token: "access-1",
        refresh_token: "refresh-1",
        user_id: "user-1",
        user_email: "u_x@auth.infi.internal",
        cached_at: Date.now(),
      }),
    );
    cache.cache(SESSION);
    expect(cache.read()?.login_id).toBe("cs01290");
  });

  it("normalizeToolSession rejects orphan session", () => {
    expect(
      normalizeToolSession({
        access_token: "x",
        refresh_token: "r",
        token_type: "bearer",
        user: { id: "", email: "", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" },
      }),
    ).toBeNull();
  });

  it("rejects snapshot with token but no user_id (post-signout orphan)", () => {
    const cache = createToolSessionCache({
      storageKey: "p:test-session-v2",
      eventName: "p:test-session",
    });
    localStorage.setItem(
      "p:test-session-v2",
      JSON.stringify({
        access_token: "orphan",
        refresh_token: "r",
        user_id: null,
        user_email: null,
        cached_at: Date.now(),
      }),
    );
    expect(cache.sessionFromSnapshot(cache.read())).toBeNull();
  });

  it("migrates legacy sessionStorage key", () => {
    sessionStorage.setItem(
      "p:test-session-v1",
      JSON.stringify({
        access_token: "legacy",
        refresh_token: "r",
        user_id: "u",
        user_email: "a@corp.com",
        cached_at: Date.now(),
      }),
    );
    const cache = createToolSessionCache({
      storageKey: "p:test-session-v2",
      eventName: "p:test-session",
      legacySessionStorageKeys: ["p:test-session-v1"],
    });
    expect(cache.read()?.access_token).toBe("legacy");
    expect(sessionStorage.getItem("p:test-session-v1")).toBeNull();
  });
});
