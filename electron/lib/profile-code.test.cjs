const {
  PROFILE_CODE_MIN,
  PROFILE_CODE_MAX,
  parseProfileCode,
  normalizeProfileNameOrThrow,
  extractFourDigitCode,
  extractProfileCode,
  badgeLast3,
  badgeThousands,
  digitHexForCode,
  digitGapForIcoSize,
  digitGapsCsvForSizes,
  BADGE_DIGIT_GAP_BY_MAX_SIZE,
} = require("./profile-code.cjs");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("profile-code", () => {
  it("normalizes 1–4 digit names to 0000–9999", () => {
    assert.equal(normalizeProfileNameOrThrow("1"), "0001");
    assert.equal(normalizeProfileNameOrThrow("385"), "0385");
    assert.equal(normalizeProfileNameOrThrow("9999"), "9999");
  });

  it("rejects non-numeric and out-of-range names", () => {
    assert.equal(parseProfileCode("Lucy").ok, false);
    assert.equal(parseProfileCode("10000").ok, false);
    assert.equal(parseProfileCode("").ok, false);
  });

  it("badge last3 + digit hue (Design V4)", () => {
    assert.equal(badgeLast3("0385"), "385");
    assert.equal(badgeLast3("0001"), "001");
    assert.equal(badgeLast3("1125"), "125");
    assert.equal(badgeLast3("0125"), "125");
    assert.equal(badgeThousands("0385"), 0);
    assert.equal(badgeThousands("0125"), 0);
    assert.equal(badgeThousands("1125"), 1);
    assert.equal(badgeThousands("1731"), 1);
    assert.equal(badgeThousands("3145"), 3);
    assert.notEqual(digitHexForCode("0125"), digitHexForCode("1125"));
    assert.equal(digitHexForCode("0125"), "#ffffff");
    assert.equal(digitHexForCode("1125"), "#00c8ff");
    assert.notEqual(digitHexForCode("1125"), digitHexForCode("2125"));
    assert.equal(digitHexForCode("2125"), "#2bff66");
    assert.equal(digitHexForCode("9990"), "#c8ff00");
  });

  it("extractProfileCode aliases extractFourDigitCode", () => {
    assert.equal(extractProfileCode("Profile 0006", "x"), "0006");
    assert.equal(extractProfileCode("1731"), extractFourDigitCode("1731"));
  });

  it("extractFourDigitCode prefers trailing 4 digits", () => {
    assert.equal(extractFourDigitCode("1731"), "1731");
    assert.equal(extractFourDigitCode("0009"), "0009");
  });

  it("digit gap SSOT (+10% vs spaced7)", () => {
    assert.equal(digitGapForIcoSize(16), 3.5);
    assert.equal(digitGapForIcoSize(48), 7.4);
    assert.equal(digitGapForIcoSize(64), 10);
    assert.equal(BADGE_DIGIT_GAP_BY_MAX_SIZE.length, 5);
    assert.equal(digitGapsCsvForSizes([48, 32]), "48:7.4,32:6.2");
  });

  it("range constants", () => {
    assert.equal(PROFILE_CODE_MIN, 0);
    assert.equal(PROFILE_CODE_MAX, 9999);
  });
});
