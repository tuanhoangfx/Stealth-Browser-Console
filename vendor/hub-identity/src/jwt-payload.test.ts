import { describe, expect, it } from "vitest";
import { decodeJwtPayloadBase64, parseJwtPayload } from "./jwt-payload";

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

describe("decodeJwtPayloadBase64 / parseJwtPayload", () => {
  it("keeps Vietnamese full_name (no atob mojibake)", () => {
    const payload = {
      sub: "user-1",
      user_metadata: { full_name: "Trần Hiệp", login_id: "cs00966" },
    };
    const token = `hdr.${b64urlJson(payload)}.sig`;
    const parsed = parseJwtPayload(token);
    expect(parsed?.user_metadata).toEqual({
      full_name: "Trần Hiệp",
      login_id: "cs00966",
    });
  });

  it("matches Node Buffer utf8 for the same segment", () => {
    const segment = b64urlJson({ full_name: "Nguyễn Văn A" });
    const viaHelper = decodeJwtPayloadBase64(segment);
    const viaBuffer = Buffer.from(
      segment.replace(/-/g, "+").replace(/_/g, "/") + "==",
      "base64",
    ).toString("utf8");
    expect(JSON.parse(viaHelper)).toEqual(JSON.parse(viaBuffer));
  });

  it("returns null for malformed tokens", () => {
    expect(parseJwtPayload("not-a.jwt")).toBeNull();
    expect(parseJwtPayload("")).toBeNull();
  });
});
