import { describe, expect, it } from "vitest";
import { normalizeHubCountryCode, resolveHubCountry } from "./country-catalog";
import { flagsApiUrl } from "./locale-flag";

describe("country-catalog", () => {
  it("normalizes common aliases to ISO alpha-2", () => {
    expect(normalizeHubCountryCode("United States")).toBe("US");
    expect(normalizeHubCountryCode("usa")).toBe("US");
    expect(normalizeHubCountryCode("VN")).toBe("VN");
    expect(normalizeHubCountryCode("Viet Nam")).toBe("VN");
    expect(normalizeHubCountryCode("UK")).toBe("GB");
  });

  it("resolves canonical English label from code", () => {
    expect(resolveHubCountry("US")).toEqual({
      code: "US",
      label: "United States",
      raw: "US",
    });
  });

  it("builds flagsapi.com URLs", () => {
    expect(flagsApiUrl("vn", "flat", 24)).toBe("https://flagsapi.com/VN/flat/24.png");
  });
});
