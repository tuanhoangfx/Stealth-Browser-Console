import { describe, expect, it } from "vitest";
import {
  extractAuthErrorText,
  fallbackAuthErrorText,
  HUB_SIGNUP_FAILED_MESSAGE,
  isEmptyAuthErrorText,
} from "./extract-auth-error-text";

describe("extractAuthErrorText", () => {
  it("treats empty JSON leftovers as blank", () => {
    expect(extractAuthErrorText("{}")).toBe("");
    expect(extractAuthErrorText("[]")).toBe("");
    expect(extractAuthErrorText("[object Object]")).toBe("");
    expect(extractAuthErrorText({})).toBe("");
    expect(extractAuthErrorText({ error: {} })).toBe("");
    expect(extractAuthErrorText(new Error("{}"))).toBe("");
    expect(isEmptyAuthErrorText("{}")).toBe(true);
  });

  it("prefers error_description over a code object", () => {
    expect(
      extractAuthErrorText({
        error: {},
        error_description: "User already registered",
      }),
    ).toBe("User already registered");
  });

  it("falls back to signup copy when the body is empty", () => {
    expect(fallbackAuthErrorText("{}", "signup")).toBe(HUB_SIGNUP_FAILED_MESSAGE);
    expect(fallbackAuthErrorText(new Error(""), "signup")).toBe(HUB_SIGNUP_FAILED_MESSAGE);
  });
});
