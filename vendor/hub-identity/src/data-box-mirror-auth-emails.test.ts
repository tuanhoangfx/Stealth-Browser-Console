import { describe, expect, it } from "vitest";
import { resolveDataBoxMirrorAuthEmails } from "./data-box-mirror-auth-emails";

describe("resolveDataBoxMirrorAuthEmails", () => {
  it("uses Hub opaque only — never invents @infix1", () => {
    expect(
      resolveDataBoxMirrorAuthEmails({
        loginInput: "duyceo01",
        mirrorEmail: "u_12770af0-93b5-429e-85f1-9ecb4f66e9b5@auth.infi.internal",
      }),
    ).toEqual(["u_12770af0-93b5-429e-85f1-9ecb4f66e9b5@auth.infi.internal"]);
  });

  it("rejects leftover @infix1 mirror emails", () => {
    expect(
      resolveDataBoxMirrorAuthEmails({
        loginInput: "duyceo01",
        mirrorEmail: "duyceo01@infix1.io.vn",
      }),
    ).toEqual([]);
  });

  it("returns empty when username has no Hub opaque yet", () => {
    expect(resolveDataBoxMirrorAuthEmails({ loginInput: "alice", mirrorEmail: "" })).toEqual([]);
  });
});
