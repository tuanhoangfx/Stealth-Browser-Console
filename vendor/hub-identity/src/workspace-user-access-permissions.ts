import { canManageToolAccess, toolRoleGrantsAccess } from "./workspace-tool-access-filter";
import { cleanHubJobTitleSlug } from "./hub-job-titles";

export type HubScopedUserAccessActor = {
  role?: string | null;
  jobTitle?: string | null;
  toolRoles?: Readonly<Record<string, string>> | null;
};

export type HubScopedUserAccessPermissions = {
  canEditRole: boolean;
  canDelete: boolean;
  /** Create a regular account and grant it only to the selected child tool. */
  canCreateScopedUser: boolean;
  /** Revoke a non-Admin member's grant from the selected child tool. */
  canRemoveFromTool: boolean;
  canEditProfile: boolean;
  canEditScopedOrg: boolean;
};

/**
 * Shared User Detail permission matrix for scoped workspace embeds.
 * Position CEO is per-tool: `job_title=ceo` plus an explicit grant on
 * `scopedToolCode`. Enzy CEO is not Performance CEO.
 * A tool admin can only manage that tool's Team/Position grants.
 */
export function resolveHubScopedUserAccessPermissions(input: {
  actor?: HubScopedUserAccessActor | null;
  /** A non-Admin actor must never mutate an Admin account. */
  targetRole?: string | null;
  scopedToolCode?: string | null;
}): HubScopedUserAccessPermissions {
  const scopedCode = input.scopedToolCode?.trim().toUpperCase() || null;
  const role = String(input.actor?.role ?? "").trim().toLowerCase();
  const hubAdmin = role === "admin";
  const hubManager = role === "manager";
  const targetIsAdmin = String(input.targetRole ?? "").trim().toLowerCase() === "admin";
  const hasThisToolGrant = Boolean(
    scopedCode && toolRoleGrantsAccess(input.actor?.toolRoles?.[scopedCode]),
  );
  const scopedCeo = hasThisToolGrant && cleanHubJobTitleSlug(input.actor?.jobTitle) === "ceo";
  const toolAdmin = Boolean(scopedCode && canManageToolAccess(input.actor ?? {}, scopedCode));
  const canMutateTarget = hubAdmin || !targetIsAdmin;
  const canManageScopedMembership = Boolean(scopedCode) && (hubAdmin || scopedCeo);

  return {
    canEditRole: hubAdmin,
    canDelete: hubAdmin,
    canCreateScopedUser: canManageScopedMembership,
    canRemoveFromTool: canManageScopedMembership && canMutateTarget,
    canEditProfile: canMutateTarget && (hubAdmin || scopedCeo),
    canEditScopedOrg: canMutateTarget && (hubAdmin || hubManager || toolAdmin || scopedCeo),
  };
}
