// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HUB_IDENTITY_EVENT,
  HUB_IDENTITY_STORAGE_KEY,
  cacheHubIdentity,
  clearHubIdentity,
  readHubIdentity,
  subscribeHubIdentity,
} from "./hub-identity-cache";

const BASE = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  expires_at: 9_999_999_999,
  user_id: "user-1",
  user_email: "a@corp.com",
  supabase_url: "https://hub.example.co",
  supabase_anon_key: "anon-key",
};

describe("hub-identity-cache", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores snapshot in localStorage", () => {
    cacheHubIdentity(BASE, "test");
    expect(readHubIdentity()?.access_token).toBe("access-1");
    expect(localStorage.getItem(HUB_IDENTITY_STORAGE_KEY)).toBeTruthy();
  });

  it("skips broadcast when tokens unchanged", () => {
    const handler = vi.fn();
    subscribeHubIdentity(handler);
    cacheHubIdentity(BASE, "a");
    cacheHubIdentity(BASE, "b");
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("migrates legacy sessionStorage key", () => {
    sessionStorage.setItem(
      "p0016:hub-identity-v1",
      JSON.stringify({ ...BASE, cached_at: Date.now() }),
    );
    const snap = readHubIdentity();
    expect(snap?.access_token).toBe("access-1");
    expect(sessionStorage.getItem("p0016:hub-identity-v1")).toBeNull();
  });

  it("notifies subscribers on clear", () => {
    cacheHubIdentity(BASE);
    const handler = vi.fn();
    subscribeHubIdentity(handler);
    clearHubIdentity("signout");
    expect(readHubIdentity()).toBeNull();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: "cleared" }));
  });

  it("dispatches canonical hub identity event", () => {
    const onEvent = vi.fn();
    window.addEventListener(HUB_IDENTITY_EVENT, onEvent);
    cacheHubIdentity(BASE, "evt");
    expect(onEvent).toHaveBeenCalled();
    window.removeEventListener(HUB_IDENTITY_EVENT, onEvent);
  });
});
