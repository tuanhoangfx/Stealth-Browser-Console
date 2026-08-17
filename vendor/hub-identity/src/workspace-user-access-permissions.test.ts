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
