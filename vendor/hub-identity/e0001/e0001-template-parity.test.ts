import { describe, expect, it } from "vitest";
import {
  hubAccountEmailLabel,
  hubAuthEmailFromLoginOrEmail,
  hubDisplayEmail,
  hubWorkspaceIdentityLabel,
} from "./hub-login.template.js";

describe("E0001 hub-login template — P0004 display/signup parity", () => {
  it("never paints leftover @infix1 or opaque auth as Email", () => {
    expect(
      hubDisplayEmail({
        authEmail: "cs00962@infix1.io.vn",
        contactEmail: null,
        profileEmail: null,
      }),
    ).toBe("");
    expect(hubAccountEmailLabel({ authEmail: "cs00962@infix1.io.vn" })).toBe("Not linked");
    expect(
      hubDisplayEmail({
        authEmail: "u_12770af0-93b5-429e-85f1-9ecb4f06e9b5@auth.infi.internal",
        profileEmail: "cs00962@corp.com",
      }),
    ).toBe("cs00962@corp.com");
  });

  it("header label uses User ID, not @infix1.io.vn", () => {
    expect(hubWorkspaceIdentityLabel({ authEmail: "cs00962@infix1.io.vn" })).toBe("cs00962");
    expect(hubWorkspaceIdentityLabel({ loginId: "cs00962", authEmail: "cs00962@infix1.io.vn" })).toBe(
      "cs00962",
    );
    expect(
      hubWorkspaceIdentityLabel({
        authEmail: "u_12770af0-93b5-429e-85f1-9ecb4f06e9b5@auth.infi.internal",
      }),
    ).toBe("");
  });

  it("username-only create uses pending@auth.infi.internal", () => {
    const resolved = hubAuthEmailFromLoginOrEmail({ loginId: "cs00962" });
    expect(resolved).toMatchObject({ loginId: "cs00962", contactEmail: null });
    expect("authEmail" in resolved && resolved.authEmail.startsWith("pending_cs00962_")).toBe(true);
    expect("authEmail" in resolved && resolved.authEmail.endsWith("@auth.infi.internal")).toBe(true);
  });
});
