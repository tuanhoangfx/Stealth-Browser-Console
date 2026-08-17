import { describe, expect, it } from "vitest";
import {
  classifyHubLoginIdentifier,
  hubAccountEmailLabel,
  hubAuthEmailFromLogin,
  hubAuthEmailFromLoginOrEmail,
  hubAuthEmailsForSignIn,
  hubAuthEmailsFromLogin,
  hubDisplayEmail,
  hubDisplayLoginId,
  hubOpaqueAuthEmailFromUserId,
  isHubOpaqueAuthEmail,
  isHubSyntheticEmail,
  isHubTechnicalAuthEmail,
  looksLikePhoneLogin,
  normalizeHubPhoneForLookup,
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

  it("aliases enzyadmin → enzy.admin auth email", () => {
    const r = resolveHubLogin("enzyadmin");
    expect(r.authEmail).toBe("enzy.admin@infix1.io.vn");
    expect(r.loginId).toBe("enzy.admin");
    expect(hubAuthEmailsForSignIn("enzyadmin")[0]).toBe("enzy.admin@infix1.io.vn");
  });

  it("aliases crpgo → czpgo auth email", () => {
    expect(resolveHubLogin("crpgo").loginId).toBe("czpgo");
    expect(hubAuthEmailsForSignIn("crpgo")[0]).toBe("czpgo@infix1.io.vn");
  });

  it("aliases phuongkt01 → phuongkd01 for resolve-login username", () => {
    expect(classifyHubLoginIdentifier("phuongkt01")).toEqual({
      kind: "username",
      sanitized: "phuongkt01",
      loginId: "phuongkd01",
      phoneNormalized: null,
    });
    expect(resolveHubLogin("phuongkt01").loginId).toBe("phuongkd01");
  });

  it("keys the opaque auth email on the immutable user id", () => {
    const userId = "7C9E6679-7425-40DE-944B-E07FC1F90AE7";
    expect(hubOpaqueAuthEmailFromUserId(userId)).toBe(
      "u_7c9e6679-7425-40de-944b-e07fc1f90ae7@auth.infi.internal",
    );
    expect(isHubOpaqueAuthEmail(hubOpaqueAuthEmailFromUserId(userId))).toBe(true);
    expect(isHubSyntheticEmail(hubOpaqueAuthEmailFromUserId(userId))).toBe(false);
    expect(isHubTechnicalAuthEmail(hubOpaqueAuthEmailFromUserId(userId))).toBe(true);
    expect(() => hubOpaqueAuthEmailFromUserId("  ")).toThrow(/Invalid Hub user id/);
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

  it("classifies phone identifiers and normalizes VN local numbers", () => {
    expect(classifyHubLoginIdentifier("+84 901 234 567")).toMatchObject({
      kind: "phone",
      phoneNormalized: "84901234567",
    });
    expect(normalizeHubPhoneForLookup("0901 234 567")).toBe("84901234567");
    expect(looksLikePhoneLogin("0901234567")).toBe(true);
    expect(hubAuthEmailsForSignIn("0901234567")).toEqual([]);
    expect(resolveHubLogin("0901234567")).toMatchObject({
      kind: "phone",
      authEmail: "",
      isEmailLogin: false,
    });
  });

  it("keeps alphanumeric usernames out of the phone path", () => {
    expect(classifyHubLoginIdentifier("oi0906029").kind).toBe("username");
    expect(looksLikePhoneLogin("oi0906029")).toBe(false);
  });

  it("rejects malformed short digit strings as phone", () => {
    expect(normalizeHubPhoneForLookup("12345")).toBeNull();
    expect(looksLikePhoneLogin("12345")).toBe(false);
  });

  it("OI0906029 normalizes to oi0906029 without digit corruption", () => {
    expect(resolveHubLogin("OI0906029")).toMatchObject({
      authEmail: "oi0906029@infix1.io.vn",
      loginId: "oi0906029",
      isEmailLogin: false,
    });
    expect(resolveHubLogin("oi0906029").loginId).toBe("oi0906029");
    expect(resolveHubLogin("OI0906029").loginId).not.toBe("oi09006029");
  });

  it("derives login_id from real email on create", () => {
    expect(hubAuthEmailFromLoginOrEmail({ email: "alice@corp.com" })).toEqual({
      authEmail: "alice@corp.com",
      loginId: "alice",
      contactEmail: "alice@corp.com",
    });
  });

  it("shows synthetic @infix1.io.vn in directory email until contact is linked", () => {
    expect(
      hubDisplayEmail({
        authEmail: "oi0906029@infix1.io.vn",
        contactEmail: null,
        profileEmail: null,
      }),
    ).toBe("oi0906029@infix1.io.vn");
    expect(
      hubDisplayEmail({
        authEmail: "oi0906029@infix1.io.vn",
        contactEmail: "real@corp.com",
      }),
    ).toBe("real@corp.com");
  });

  it("never surfaces opaque Hub auth email; account label uses profiles.email SSOT", () => {
    const opaque = "u_fa7950dc-3153-479e-b4b1-6a357bcf656b@auth.infi.internal";
    expect(hubDisplayEmail({ authEmail: opaque })).toBe("");
    expect(hubAccountEmailLabel({ authEmail: opaque })).toBe("Not linked");
    expect(
      hubAccountEmailLabel({
        authEmail: opaque,
        profileEmail: "kinhdoanh03@enzyvina.com",
      }),
    ).toBe("kinhdoanh03@enzyvina.com");
  });

  it("account label never paints synthetic @infix1.io.vn — profiles.email only", () => {
    expect(
      hubAccountEmailLabel({
        authEmail: "duyceo01@infix1.io.vn",
        profileEmail: null,
        contactEmail: null,
      }),
    ).toBe("Not linked");
    expect(
      hubAccountEmailLabel({
        authEmail: "duyceo01@infix1.io.vn",
        profileEmail: "kinhdoanh@enzyvina.com",
      }),
    ).toBe("kinhdoanh@enzyvina.com");
  });
});
