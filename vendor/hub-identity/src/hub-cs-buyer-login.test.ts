import { describe, expect, it } from "vitest";
import { isHubCsBuyerLoginId } from "./hub-cs-buyer-login";

describe("hub-cs-buyer-login", () => {
  it("matches CS00001 … CS01500 login ids", () => {
    expect(isHubCsBuyerLoginId("cs00001")).toBe(true);
    expect(isHubCsBuyerLoginId("CS01500")).toBe(true);
    expect(isHubCsBuyerLoginId("cs01501")).toBe(false);
    expect(isHubCsBuyerLoginId("duyceo01")).toBe(false);
    expect(isHubCsBuyerLoginId("")).toBe(false);
  });
});
