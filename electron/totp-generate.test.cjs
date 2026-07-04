const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { generateTotp, base32Decode } = require("./lib/totp-generate.cjs");

describe("totp-generate", () => {
  it("decodes base32 to correct byte length", () => {
    const decoded = base32Decode("JBSWY3DPEHPK3PXP");
    assert.equal(decoded.length, 10);
  });

  it("generates 6-digit code", () => {
    const code = generateTotp("JBSWY3DPEHPK3PXP");
    assert.equal(code.length, 6);
    assert.ok(/^\d{6}$/.test(code), `Expected 6 digits, got: ${code}`);
  });

  it("generates deterministic code for fixed timestamp", () => {
    const code = generateTotp("JBSWY3DPEHPK3PXP", { timestamp: 1704067200000 });
    assert.equal(code.length, 6);
    assert.ok(/^\d{6}$/.test(code));
    const code2 = generateTotp("JBSWY3DPEHPK3PXP", { timestamp: 1704067200000 });
    assert.equal(code, code2, "Same timestamp should produce same code");
  });

  it("handles real-world base32 secret", () => {
    const code = generateTotp("3KU2HTW7S2BWOYPTKY4JU26GO7ZS6UTQ");
    assert.equal(code.length, 6);
    assert.ok(/^\d{6}$/.test(code));
  });
});
