import { describe, expect, it } from "vitest";
import {
  HUB_AUTH_FETCH_TIMEOUT_MESSAGE,
  HUB_GOTRUE_FETCH_TIMEOUT_MS,
  isTransientAuthFetchError,
  normalizeAuthFetchError,
} from "./hub-auth-fetch";

describe("GoTrue grant timeout", () => {
  it("outlives a 5–8s Home Server password grant (7s used to abort login)", () => {
    expect(HUB_GOTRUE_FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(16_000);
  });
});

describe("normalizeAuthFetchError", () => {
  it("maps AbortError to a retryable timeout", () => {
    const err = Object.assign(new Error("signal is aborted without reason"), { name: "AbortError" });
    expect(isTransientAuthFetchError(err)).toBe(true);
    expect(normalizeAuthFetchError(err).message).toBe(HUB_AUTH_FETCH_TIMEOUT_MESSAGE);
  });
});
