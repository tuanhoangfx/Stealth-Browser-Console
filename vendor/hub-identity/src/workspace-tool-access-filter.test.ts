import { describe, expect, it } from "vitest";
import {
  canManageToolAccess,
  filterUsersByToolCode,
  toolRoleGrantsAccess,
  userHasToolAccess,
} from "./workspace-tool-access-filter";

describe("workspace-tool-access-filter", () => {
  it("treats none as no grant", () => {
    expect(toolRoleGrantsAccess("none")).toBe(false);
    expect(toolRoleGrantsAccess("")).toBe(false);
    expect(toolRoleGrantsAccess("admin")).toBe(true);
  });

  it("includes Hub admins and explicit P0012 grants", () => {
    expect(userHasToolAccess({ role: "admin", toolCodes: [] }, "P0012")).toBe(true);
    expect(userHasToolAccess({ role: "user", toolCodes: ["P0012"] }, "P0012")).toBe(true);
    expect(userHasToolAccess({ role: "user", toolRoles: { P0012: "manager" } }, "P0012")).toBe(true);
    expect(userHasToolAccess({ role: "user", toolCodes: ["P0016"] }, "P0012")).toBe(false);
  });

  it("scopes P0015 grants independently from P0012", () => {
    expect(userHasToolAccess({ role: "admin", toolCodes: [] }, "P0015")).toBe(true);
    expect(userHasToolAccess({ role: "user", toolCodes: ["P0015"] }, "P0015")).toBe(true);
    expect(userHasToolAccess({ role: "user", toolRoles: { P0015: "manager" } }, "P0015")).toBe(true);
    expect(userHasToolAccess({ role: "user", toolCodes: ["P0012"] }, "P0015")).toBe(false);
    expect(canManageToolAccess({ role: "user", toolRoles: { P0015: "admin" } }, "P0015")).toBe(true);
    expect(canManageToolAccess({ role: "user", toolRoles: { P0015: "user" } }, "P0015")).toBe(false);
  });

  it("does not treat default tools as P0012 access", () => {
    expect(userHasToolAccess({ role: "user", toolCodes: ["P0016", "P0020"] }, "P0012")).toBe(false);
  });

  it("filters a roster to one tool", () => {
    const rows = [
      { id: "a", role: "admin", toolCodes: [] },
      { id: "b", role: "user", toolCodes: ["P0012"] },
      { id: "c", role: "user", toolCodes: ["P0016"] },
    ];
    expect(filterUsersByToolCode(rows, "P0012").map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("lets Hub admin/manager or tool admin manage grants", () => {
    expect(canManageToolAccess({ role: "admin" }, "P0012")).toBe(true);
    expect(canManageToolAccess({ role: "manager" }, "P0012")).toBe(true);
    expect(canManageToolAccess({ role: "user", toolRoles: { P0012: "admin" } }, "P0012")).toBe(true);
    expect(canManageToolAccess({ role: "user", toolRoles: { P0012: "user" } }, "P0012")).toBe(false);
  });
});
