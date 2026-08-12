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
    user_metadata: {},
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
    expect(localStorage.getItem("p:test-session-v2")).toBeTruthy();
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
