// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  HUB_IDENTITY_RELAY_MESSAGE_TYPE,
  HUB_IDENTITY_RELAY_REQUEST_TYPE,
  buildHubIdentityRelayMessage,
  createHubIdentityRelayRespondHandler,
  createHubIdentityRelayMessageHandler,
  requestHubIdentityFromHost,
} from "./hub-identity-relay";

const SESSION = {
  access_token: "access-relay",
  refresh_token: "refresh-relay",
  expires_at: 999,
  token_type: "bearer",
  user: { id: "u-relay", email: "relay@corp.com" },
} as const;

describe("hub-identity-relay integration", () => {
  it("delivers snapshot via postMessage handler", () => {
    const onReceived = vi.fn();
    const handler = createHubIdentityRelayMessageHandler(() => true, onReceived);
    const message = buildHubIdentityRelayMessage(SESSION, "https://hub.example.co", "anon-key");

    handler({ origin: "https://infi.io.vn", data: message } as MessageEvent);

    expect(onReceived).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: "access-relay",
        supabase_url: "https://hub.example.co",
      }),
    );
  });

  it("rejects wrong origin", () => {
    const onReceived = vi.fn();
    const handler = createHubIdentityRelayMessageHandler(
      (origin) => origin === "https://infi.io.vn",
      onReceived,
    );
    const message = buildHubIdentityRelayMessage(SESSION, "https://hub.example.co", "anon-key");

    handler({ origin: "https://evil.example", data: message } as MessageEvent);

    expect(onReceived).not.toHaveBeenCalled();
  });

  it("round-trips build → parse", () => {
    const message = buildHubIdentityRelayMessage(SESSION, "https://hub.example.co", "anon-key");
    expect(message.type).toBe(HUB_IDENTITY_RELAY_MESSAGE_TYPE);
    const handler = createHubIdentityRelayMessageHandler(() => true, (snap) => {
      expect(snap.access_token).toBe("access-relay");
      expect(snap.user_email).toBe("relay@corp.com");
    });
    handler({ origin: "https://infi.io.vn", data: message } as MessageEvent);
  });

  it("relays a missing Todo Hub JWT through its ENZY iframe parent", () => {
    const received = vi.fn();
    const childReceive = createHubIdentityRelayMessageHandler(
      (origin) => origin === "http://127.0.0.1:3026",
      received,
    );
    const todoWindow = {
      postMessage: vi.fn((data: unknown) => {
        childReceive({ origin: "http://127.0.0.1:3026", data } as MessageEvent);
      }),
    } as unknown as Window;
    const hostWindow = { postMessage: vi.fn() } as unknown as Window;
    const hostRespond = createHubIdentityRelayRespondHandler(
      () => SESSION,
      "https://hub.example.co",
      "anon-key",
      (origin) => origin === "http://127.0.0.1:3012",
    );
    const original = globalThis.window;
    globalThis.window = { opener: null, parent: hostWindow } as unknown as Window & typeof globalThis;

    try {
      expect(requestHubIdentityFromHost()).toBe(true);
    } finally {
      globalThis.window = original;
    }

    const [request, targetOrigin] = vi.mocked(hostWindow.postMessage).mock.calls[0] ?? [];
    expect(request).toEqual({ type: HUB_IDENTITY_RELAY_REQUEST_TYPE });
    expect(targetOrigin).toBe("*");
    hostRespond({
      data: request,
      origin: "http://127.0.0.1:3012",
      source: todoWindow,
    } as MessageEvent);
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        access_token: "access-relay",
        user_email: "relay@corp.com",
      }),
    );
  });
});
