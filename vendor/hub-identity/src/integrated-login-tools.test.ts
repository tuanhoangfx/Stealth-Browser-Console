import { describe, expect, it } from "vitest";
import {
  HUB_INTEGRATED_LOGIN_TOOL_CODES,
  HUB_INTEGRATED_LOGIN_TOOLS,
  hasIntegratedLoginToolAccess,
  isHubIntegratedLoginTool,
} from "./integrated-login-tools";

describe("integrated-login-tools", () => {
  it("includes P0012 as an explicit-grant tool", () => {
    expect(HUB_INTEGRATED_LOGIN_TOOL_CODES).toContain("P0012");
    expect(isHubIntegratedLoginTool("P0012")).toBe(true);
    const p0012 = HUB_INTEGRATED_LOGIN_TOOLS.find((tool) => tool.code === "P0012");
    expect(p0012?.inheritedRole).toBe(false);
  });

  it("includes P0015 as an explicit-grant tool", () => {
    expect(HUB_INTEGRATED_LOGIN_TOOL_CODES).toContain("P0015");
    expect(isHubIntegratedLoginTool("P0015")).toBe(true);
    const p0015 = HUB_INTEGRATED_LOGIN_TOOLS.find((tool) => tool.code === "P0015");
    expect(p0015?.inheritedRole).toBe(false);
  });

  it("gives Hub admins P0012 access without an explicit row", () => {
    expect(hasIntegratedLoginToolAccess({ role: "admin", toolCodes: [] }, "P0012")).toBe(true);
    expect(hasIntegratedLoginToolAccess({ role: "user", toolCodes: [] }, "P0012")).toBe(false);
    expect(hasIntegratedLoginToolAccess({ role: "user", toolCodes: ["P0012"] }, "P0012")).toBe(true);
  });

  it("gives Hub admins P0015 access without an explicit row", () => {
    expect(hasIntegratedLoginToolAccess({ role: "admin", toolCodes: [] }, "P0015")).toBe(true);
    expect(hasIntegratedLoginToolAccess({ role: "user", toolCodes: [] }, "P0015")).toBe(false);
    expect(hasIntegratedLoginToolAccess({ role: "user", toolCodes: ["P0015"] }, "P0015")).toBe(true);
    expect(hasIntegratedLoginToolAccess({ role: "user", toolRoles: { P0015: "manager" } }, "P0015")).toBe(true);
  });
});
