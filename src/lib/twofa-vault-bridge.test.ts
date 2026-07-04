import { describe, expect, it } from "vitest";

const { normalizeBrowserCode } = require("../../electron/lib/twofa-vault-bridge.cjs");

describe("twofa-vault-bridge", () => {
  it("normalizes browser codes to 4 digits", () => {
    expect(normalizeBrowserCode("98")).toBe("0098");
    expect(normalizeBrowserCode("0098")).toBe("0098");
    expect(normalizeBrowserCode("1001")).toBe("1001");
  });
});
