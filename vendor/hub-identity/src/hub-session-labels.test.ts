import { describe, expect, it } from "vitest";
import { hubSignedInAsLabel } from "./hub-session-labels";

describe("hubSignedInAsLabel", () => {
  it("never paints technical Data Box session email", () => {
    expect(
      hubSignedInAsLabel({
        user: {
          email: "u_12770af0-93b5-429e-85f1-9ecb4f66e9b5@auth.infi.internal",
          user_metadata: { login_id: "duyceo01" },
        },
      }),
    ).toBe("duyceo01");
  });

  it("prefers Hub contact email over opaque Data Box auth email", () => {
    expect(
      hubSignedInAsLabel(
        {
          user: {
            email: "u_12770af0-93b5-429e-85f1-9ecb4f66e9b5@auth.infi.internal",
            user_metadata: { login_id: "duyceo01" },
          },
        },
        "kinhdoanh@enzyvina.com",
      ),
    ).toBe("kinhdoanh@enzyvina.com");
  });
});
