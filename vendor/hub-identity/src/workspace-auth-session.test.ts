import { describe, expect, it } from "vitest";
import {
  isSessionNearExpiry,
  isSessionStillWriteable,
  readJwtExpSeconds,
  resolveSessionExpiresAtSeconds,
} from "./workspace-auth-session";

function jwtWithExp(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("session expiry helpers", () => {
  it("reads JWT exp when expires_at is missing", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    expect(readJwtExpSeconds(jwtWithExp(exp))).toBe(exp);
    expect(resolveSessionExpiresAtSeconds({ access_token: jwtWithExp(exp) })).toBe(exp);
  });

  it("prefers stamped expires_at over JWT exp", () => {
    expect(
      resolveSessionExpiresAtSeconds({
        expires_at: 111,
        access_token: jwtWithExp(999),
      }),
    ).toBe(111);
  });

  it("does not treat a missing clock as near-expiry", () => {
    expect(isSessionNearExpiry({ access_token: "not-a-jwt", expires_at: null }, 120_000)).toBe(false);
    expect(isSessionStillWriteable({ access_token: "not-a-jwt" })).toBe(true);
  });

  it("flags a token inside the refresh window", () => {
    const exp = Math.floor(Date.now() / 1000) + 30;
    expect(isSessionNearExpiry({ expires_at: exp, access_token: "x" }, 120_000)).toBe(true);
    expect(isSessionStillWriteable({ expires_at: exp, access_token: "x" })).toBe(true);
  });

  it("rejects a hard-expired token", () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    expect(isSessionStillWriteable({ expires_at: exp, access_token: "x" })).toBe(false);
  });
});
