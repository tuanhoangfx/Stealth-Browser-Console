import { describe, expect, it } from "vitest";
import {
  HUB_IDENTITY_BRIDGE_MESSAGE_TYPE,
  HUB_IDENTITY_BRIDGE_PATH,
} from "./hub-identity-cross-origin";
import { HUB_DEV_ORIGIN, HUB_PRODUCTION_ORIGIN } from "./hub-identity-urls";

describe("hub-identity-cross-origin constants", () => {
  it("exports stable bridge contract", () => {
    expect(HUB_IDENTITY_BRIDGE_MESSAGE_TYPE).toBe("x1z10:hub-identity-bridge-v1");
    expect(HUB_IDENTITY_BRIDGE_PATH).toBe("/hub-identity-bridge.html");
    expect(HUB_DEV_ORIGIN).toContain("5176");
    expect(HUB_PRODUCTION_ORIGIN).toContain("infi.io.vn");
  });
});
