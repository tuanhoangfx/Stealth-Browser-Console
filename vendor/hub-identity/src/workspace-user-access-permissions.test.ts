import { describe, expect, it } from "vitest";
import { resolveHubScopedUserAccessPermissions } from "./workspace-user-access-permissions";

describe("resolveHubScopedUserAccessPermissions", () => {
  it("allows scoped Team/Position for a tool admin without Profile or Role authority", () => {
    expect(
      resolveHubScopedUserAccessPermissions({
        actor: { role: "user", jobTitle: "employee", toolRoles: { P0015: "admin" } },
        scopedToolCode: "P0015",
      }),
    ).toEqual({
      canEditRole: false,
      canDelete: false,
      canCreateScopedUser: false,
      canRemoveFromTool: false,
      canEditProfile: false,
      canEditScopedOrg: true,
    });
  });

  it("keeps CEO delegation inside the selected tool", () => {
    expect(
      resolveHubScopedUserAccessPermissions({
        actor: { role: "user", jobTitle: "ceo", toolRoles: {} },
        scopedToolCode: null,
      }),
    ).toMatchObject({ canEditProfile: false, canEditScopedOrg: false });
  });

  it("does not treat another tool's CEO as CEO here (P0015 ≠ P0012)", () => {
    expect(
      resolveHubScopedUserAccessPermissions({
        actor: { role: "user", jobTitle: "ceo", toolRoles: { P0015: "user" } },
        targetRole: "user",
        scopedToolCode: "P0012",
      }),
    ).toEqual({
      canEditRole: false,
      canDelete: false,
      canCreateScopedUser: false,
      canRemoveFromTool: false,
      canEditProfile: false,
      canEditScopedOrg: false,
    });
  });

  it("never lets a delegated CEO edit an Admin account", () => {
    expect(
      resolveHubScopedUserAccessPermissions({
        actor: { role: "user", jobTitle: "ceo", toolRoles: { P0015: "user" } },
        targetRole: "admin",
        scopedToolCode: "P0015",
      }),
    ).toEqual({
      canEditRole: false,
      canDelete: false,
      canCreateScopedUser: true,
      canRemoveFromTool: false,
      canEditProfile: false,
      canEditScopedOrg: false,
    });
  });

  it("gives Hub Admin Delete without needing Position CEO", () => {
    expect(
      resolveHubScopedUserAccessPermissions({
        actor: { role: "admin", jobTitle: "employee", toolRoles: { P0012: "admin" } },
        targetRole: "user",
        scopedToolCode: "P0012",
      }),
    ).toMatchObject({
      canEditRole: true,
      canDelete: true,
      canRemoveFromTool: true,
      canCreateScopedUser: true,
    });
  });

  it("lets Position CEO mutate a non-Admin teammate (duyceo01 → regular user)", () => {
    expect(
      resolveHubScopedUserAccessPermissions({
        actor: { role: "user", jobTitle: "ceo", toolRoles: { P0015: "user" } },
        targetRole: "user",
        scopedToolCode: "P0015",
      }),
    ).toEqual({
      canEditRole: false,
      canDelete: false,
      canCreateScopedUser: true,
      canRemoveFromTool: true,
      canEditProfile: true,
      canEditScopedOrg: true,
    });
  });

  it("keeps Admin readonly for a non-CEO employee (phuongkd01 → Admin)", () => {
    expect(
      resolveHubScopedUserAccessPermissions({
        actor: { role: "user", jobTitle: "employee", toolRoles: { P0015: "user" } },
        targetRole: "admin",
        scopedToolCode: "P0015",
      }),
    ).toMatchObject({
      canEditProfile: false,
      canEditScopedOrg: false,
      canEditRole: false,
    });
  });
});
