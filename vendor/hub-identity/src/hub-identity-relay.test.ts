import { describe, expect, it, vi } from "vitest";
import {
  HUB_IDENTITY_RELAY_MESSAGE_TYPE,
  HUB_IDENTITY_RELAY_REQUEST_TYPE,
  buildHubIdentityRelayMessage,
  isWorkspaceToolOrigin,
  parseHubIdentityRelayMessage,
  requestHubIdentityFromHost,
} from "./hub-identity-relay";

const SESSION = {
  access_token: "access",
  refresh_token: "refresh",
  expires_at: 123,
  token_type: "bearer",
  user: { id: "u1", email: "a@corp.com" },
} as const;

describe("hub-identity-relay", () => {
  it("builds and parses relay message", () => {
    const msg = buildHubIdentityRelayMessage(SESSION, "https://hub.example.co", "anon");
    expect(msg.type).toBe(HUB_IDENTITY_RELAY_MESSAGE_TYPE);
    const snap = parseHubIdentityRelayMessage(msg);
    expect(snap?.access_token).toBe("access");
    expect(snap?.supabase_url).toBe("https://hub.example.co");
  });

  it("rejects incomplete relay payload", () => {
    expect(parseHubIdentityRelayMessage({ type: HUB_IDENTITY_RELAY_MESSAGE_TYPE })).toBeNull();
    expect(parseHubIdentityRelayMessage(null)).toBeNull();
  });

  it("accepts workspace tool origins for relay respond", () => {
    expect(isWorkspaceToolOrigin("http://127.0.0.1:5175")).toBe(true);
    expect(isWorkspaceToolOrigin("https://evil.example")).toBe(false);
  });

  it("asks an iframe parent host, not only a popup opener", () => {
    const posts: unknown[] = [];
    const parent = { postMessage: (data: unknown) => posts.push(data) } as unknown as Window;
    const original = globalThis.window;
    globalThis.window = { opener: null, parent } as unknown as Window & typeof globalThis;
    try {
      expect(requestHubIdentityFromHost()).toBe(true);
    } finally {
      globalThis.window = original;
    }
    expect(posts).toEqual([{ type: HUB_IDENTITY_RELAY_REQUEST_TYPE }]);
  });

  it("drops relay payloads after explicit Sign Out opt-out", async () => {
    const { optOutDevAutoLogin, DEV_AUTO_LOGIN_SESSION_KEY } = await import("./dev-auto-login");
    const { createHubIdentityRelayMessageHandler } = await import("./hub-identity-relay");
    window.sessionStorage.clear();
    const onReceived = vi.fn();
    const handler = createHubIdentityRelayMessageHandler(() => true, onReceived);
    const msg = buildHubIdentityRelayMessage(SESSION, "https://hub.example.co", "anon");
    handler({ origin: "https://hub.example.co", data: msg } as MessageEvent);
    expect(onReceived).toHaveBeenCalledTimes(1);
    optOutDevAutoLogin();
    expect(window.sessionStorage.getItem(DEV_AUTO_LOGIN_SESSION_KEY)).toBe("off");
    handler({ origin: "https://hub.example.co", data: msg } as MessageEvent);
    expect(onReceived).toHaveBeenCalledTimes(1);
  });

  it("reports no host when the tool is top-level", () => {
    const original = globalThis.window;
    const self = {} as Record<string, unknown>;
    self.opener = null;
    self.parent = self;
    globalThis.window = self as unknown as Window & typeof globalThis;
    try {
      expect(requestHubIdentityFromHost()).toBe(false);
    } finally {
      globalThis.window = original;
    }
  });
});
