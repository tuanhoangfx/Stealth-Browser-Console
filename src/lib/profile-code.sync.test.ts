import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  digitGapForIcoSize,
  digitGapsCsvForSizes,
  extractFourDigitCode,
  extractProfileCode,
  normalizeProfileName,
  parseProfileCode,
  PROFILE_CODE_MAX,
  PROFILE_CODE_MIN,
} from "./profile-code";

const require = createRequire(import.meta.url);
const cjs = require("../../electron/lib/profile-code.cjs") as typeof import("../../electron/lib/profile-code.cjs");

const VECTORS: Array<[name: string, id: string]> = [
  ["1731", ""],
  ["0009", "x"],
  ["Profile 0006", "abc"],
  ["Lucy 0385", ""],
  ["385", ""],
  ["9999", ""],
  ["1", ""],
  ["", "a1b2c3d4-e5f6"],
  ["0125", ""],
  ["1125", ""],
];

describe("profile-code CJS/TS sync", () => {
  it("range constants match", () => {
    expect(PROFILE_CODE_MIN).toBe(cjs.PROFILE_CODE_MIN);
    expect(PROFILE_CODE_MAX).toBe(cjs.PROFILE_CODE_MAX);
  });

  for (const [name, id] of VECTORS) {
    it(`extractFourDigitCode(${JSON.stringify(name)}, ${JSON.stringify(id)})`, () => {
      expect(extractFourDigitCode(name, id)).toBe(cjs.extractFourDigitCode(name, id));
      expect(extractProfileCode(name, id)).toBe(cjs.extractProfileCode(name, id));
    });
  }

  it("parseProfileCode parity", () => {
    for (const raw of ["", "Lucy", "10000", "385", "9999"]) {
      const ts = parseProfileCode(raw);
      const cj = cjs.parseProfileCode(raw);
      expect(ts.ok).toBe(cj.ok);
      if (ts.ok && cj.ok) {
        expect(ts.code).toBe(cj.code);
        expect(ts.n).toBe(cj.n);
      }
    }
  });

  it("digitGapForIcoSize parity", () => {
    for (const size of [16, 20, 24, 32, 48, 64]) {
      expect(digitGapForIcoSize(size)).toBe(cjs.digitGapForIcoSize(size));
    }
    expect(digitGapsCsvForSizes([48, 32])).toBe(cjs.digitGapsCsvForSizes([48, 32]));
  });

  it("normalizeProfileName mirrors normalizeProfileNameOrThrow", () => {
    expect(normalizeProfileName("385")).toBe(cjs.normalizeProfileNameOrThrow("385"));
    expect(normalizeProfileName("Lucy")).toBeNull();
  });
});
