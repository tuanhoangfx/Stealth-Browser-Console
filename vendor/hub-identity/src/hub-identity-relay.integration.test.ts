// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  HUB_IDENTITY_RELAY_MESSAGE_TYPE,
  buildHubIdentityRelayMessage,
  createHubIdentityRelayMessageHandler,
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
});
