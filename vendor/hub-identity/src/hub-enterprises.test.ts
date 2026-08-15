import { describe, expect, it } from "vitest";
import {
  HUB_ENTERPRISE_FIELD_EMOJI,
  hubEnterpriseEmoji,
  hubEnterpriseName,
  resolveToolEnterpriseSlug,
} from "./hub-enterprises";

describe("resolveToolEnterpriseSlug", () => {
  it("uses static map then Infi default", () => {
    expect(resolveToolEnterpriseSlug("P0009")).toBe("mie");
    expect(resolveToolEnterpriseSlug("P0014")).toBe("mie");
    expect(resolveToolEnterpriseSlug("P0015")).toBe("enzy");
    expect(resolveToolEnterpriseSlug("P0004")).toBe("infi");
  });

  it("lets hub_enterprise_tools catalog override the static map", () => {
    expect(resolveToolEnterpriseSlug("P0004", { P0004: "enzy" })).toBe("enzy");
    expect(resolveToolEnterpriseSlug("P0009", { P0009: "infi" })).toBe("infi");
  });
});

describe("hub enterprise display SSOT", () => {
  it("keeps P0004 field glyph and Enzy brand sticker", () => {
    expect(HUB_ENTERPRISE_FIELD_EMOJI).toBe("🏢");
    expect(hubEnterpriseName("enzy")).toBe("Enzy");
    expect(hubEnterpriseEmoji("enzy")).toBe("⚡");
  });
});
