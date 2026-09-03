import { hasEffectiveHubToolAccess } from "./hub-default-tool-access";

export const HUB_TOOL_ROLE_NONE = "none";

export type HubToolAccessSubject = {
  role?: string | null;
  toolCodes?: readonly string[] | null;
  toolRoles?: Readonly<Record<string, string>> | null;
  loginId?: string | null;
};

export function toolRoleGrantsAccess(role: string | null | undefined): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return Boolean(r) && r !== HUB_TOOL_ROLE_NONE;
}

/** Effective access: explicit tool_role, granted tool_codes, Hub-admin, or default tools. */
export function userHasToolAccess(subject: HubToolAccessSubject, toolCode: string): boolean {
  const code = toolCode.trim();
  if (!code) return false;
  if (toolRoleGrantsAccess(subject.toolRoles?.[code])) return true;
  return hasEffectiveHubToolAccess(String(subject.role ?? ""), code, subject.toolCodes ?? [], {
    loginId: subject.loginId,
  });
}

export function filterUsersByToolCode<T extends HubToolAccessSubject>(
  users: readonly T[],
  toolCode: string,
): T[] {
  return users.filter((user) => userHasToolAccess(user, toolCode));
}

/** Hub admin, Hub manager (except P0004 grants), or tool_role admin for `toolCode` may grant/revoke that tool. */
export function canManageToolAccess(subject: HubToolAccessSubject, toolCode: string): boolean {
  const hubRole = String(subject.role ?? "").trim().toLowerCase();
  const code = toolCode.trim();
  if (hubRole === "admin") return true;
  if (hubRole === "manager" && code !== "P0004") return true;
  return String(subject.toolRoles?.[code] ?? "").trim().toLowerCase() === "admin";
}
