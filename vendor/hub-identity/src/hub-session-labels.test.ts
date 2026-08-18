import { describe, expect, it } from "vitest";
import { hubSignedInAsLabel } from "./hub-session-labels";

describe("hubSignedInAsLabel", () => {
  it("never paints leftover @infix1.io.vn from the data-plane session", () => {
    expect(
      hubSignedInAsLabel({
        user: {
          email: "duyceo01@infix1.io.vn",
          user_metadata: { login_id: "duyceo01" },
        },
      }),
    ).toBe("duyceo01");
  });

  it("prefers Hub contact email over synthetic Data Box auth email", () => {
    expect(
      hubSignedInAsLabel(
        {
          user: {
            email: "duyceo01@infix1.io.vn",
            user_metadata: { login_id: "duyceo01" },
          },
        },
        "kinhdoanh@enzyvina.com",
      ),
    ).toBe("kinhdoanh@enzyvina.com");
  });
});
