import { describe, expect, it } from "vitest";
import { isWorkspaceAuthToolCode, resolveWorkspaceAuthToolCode } from "./workspace-auth-tool-code";

describe("resolveWorkspaceAuthToolCode", () => {
  it("keeps standalone product fallback when host override is empty", () => {
    expect(resolveWorkspaceAuthToolCode({ hostCode: null, fallback: "P0012" })).toBe("P0012");
    expect(resolveWorkspaceAuthToolCode({ hostCode: " ", fallback: "P0003" })).toBe("P0003");
  });

  it("prefers embed host override for grant checks", () => {
    expect(resolveWorkspaceAuthToolCode({ hostCode: "p0015", fallback: "P0012" })).toBe("P0015");
  });

  it("ignores unknown host codes", () => {
    expect(resolveWorkspaceAuthToolCode({ hostCode: "P9999", fallback: "P0012" })).toBe("P0012");
    expect(isWorkspaceAuthToolCode("P0015")).toBe(true);
    expect(isWorkspaceAuthToolCode("P9999")).toBe(false);
  });
});
