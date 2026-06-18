import { describe, expect, it } from "vitest";
import {
  hubAuthEmailFromLogin,
  hubAuthEmailsForSignIn,
  hubAuthEmailsFromLogin,
  hubDisplayLoginId,
  isHubSyntheticEmail,
  resolveHubLogin,
  sanitizeHubLoginInput,
} from "./hub-login";

describe("hub-login", () => {
  it("resolves user ID to canonical infix1 synthetic email", () => {
    const r = resolveHubLogin("alice");
    expect(r.authEmail).toBe("alice@infix1.io.vn");
    expect(r.loginId).toBe("alice");
    expect(r.isEmailLogin).toBe(false);
  });

  it("keeps real email logins unchanged", () => {
    const r = resolveHubLogin("a@corp.com");
    expect(r.authEmail).toBe("a@corp.com");
    expect(r.isEmailLogin).toBe(true);
  });

  it("recognizes legacy and new synthetic domains", () => {
    expect(isHubSyntheticEmail("bob@id.hub.x1z10.local")).toBe(true);
    expect(isHubSyntheticEmail("bob@infix1.io.vn")).toBe(true);
    expect(isHubSyntheticEmail("bob@corp.com")).toBe(false);
  });

  it("displays login id from either synthetic domain", () => {
    expect(
      hubDisplayLoginId({
        authEmail: "x@infix1.io.vn",
      }),
    ).toBe("x");
    expect(hubDisplayLoginId({ authEmail: "x@id.hub.x1z10.local" })).toBe("x");
  });

  it("returns primary + legacy auth emails for user IDs", () => {
    expect(hubAuthEmailFromLogin("abc")).toBe("abc@infix1.io.vn");
    expect(hubAuthEmailsFromLogin("abc")).toEqual([
      "abc@infix1.io.vn",
      "abc@id.hub.x1z10.local",
    ]);
  });

  it("CS00761 resolves same emails as explicit synthetic address", () => {
    expect(hubAuthEmailsForSignIn("CS00761")).toEqual([
      "cs00761@infix1.io.vn",
      "cs00761@id.hub.x1z10.local",
    ]);
    expect(hubAuthEmailsForSignIn("CS00761@infix1.io.vn")).toEqual([
      "cs00761@infix1.io.vn",
      "cs00761@id.hub.x1z10.local",
    ]);
  });

  it("sanitizes invisible characters from login input", () => {
    expect(sanitizeHubLoginInput(" CS00761\u200B ")).toBe("CS00761");
  });
});
