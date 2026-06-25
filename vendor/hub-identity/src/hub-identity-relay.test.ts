import { describe, expect, it } from "vitest";
import {
  HUB_IDENTITY_RELAY_MESSAGE_TYPE,
  buildHubIdentityRelayMessage,
  isWorkspaceToolOrigin,
  parseHubIdentityRelayMessage,
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
});
