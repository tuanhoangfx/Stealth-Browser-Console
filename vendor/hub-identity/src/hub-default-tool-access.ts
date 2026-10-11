import { isHubCsBuyerLoginId } from "./hub-cs-buyer-login";

/** Tools auto-granted only for CS store buyers (see `isHubCsBuyerLoginId`). */
export const HUB_DEFAULT_USER_TOOL_CODES = ["E0001", "P0022"] as const;

export type HubDefaultUserToolCode = (typeof HUB_DEFAULT_USER_TOOL_CODES)[number];

export { isHubCsBuyerLoginId } from "./hub-cs-buyer-login";

export function isHubDefaultUserTool(toolCode: string): boolean {
  const code = toolCode.trim();
  return (HUB_DEFAULT_USER_TOOL_CODES as readonly string[]).includes(code);
}

export function mergeDefaultUserToolCodes(codes: Iterable<string>, loginId?: string | null): string[] {
  if (!isHubCsBuyerLoginId(loginId)) {
    return [...codes].map((c) => c.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }
  const set = new Set([...codes].map((c) => c.trim()).filter(Boolean));
  for (const code of HUB_DEFAULT_USER_TOOL_CODES) set.add(code);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export type HubDefaultToolAccessContext = {
  loginId?: string | null;
  /** Explicit Denied tool codes (manager default Access can be overridden). */
  deniedCodes?: Iterable<string> | null;
};

function deniedCodeSet(deniedCodes: Iterable<string> | null | undefined): Set<string> {
  return new Set(
    [...(deniedCodes ?? [])]
      .map((code) => code.trim())
      .filter(Boolean),
  );
}

export function hasEffectiveHubToolAccess(
  role: string,
  toolCode: string,
  grantedCodes: Iterable<string>,
  context: HubDefaultToolAccessContext = {},
): boolean {
  const r = role.trim().toLowerCase();
  const code = toolCode.trim();
  if (r === "admin") return true;
  if (deniedCodeSet(context.deniedCodes).has(code)) return false;
  if (r === "manager" && code !== "P0004") return true;
  if (isHubDefaultUserTool(code)) {
    return isHubCsBuyerLoginId(context.loginId);
  }
  return [...grantedCodes].some((g) => g.trim() === code);
}

export function isHubLockedDefaultGrantTool(
  toolCode: string,
  loginId?: string | null,
  hubRole?: string | null,
): boolean {
  const role = String(hubRole ?? "").trim().toLowerCase();
  if (role === "admin" || role === "manager") return false;
  if (!isHubDefaultUserTool(toolCode)) return false;
  return isHubCsBuyerLoginId(loginId);
}

/** Directory / modal display — implicit grants for Hub Admin + Manager (Manager excludes P0004). */
export function resolveEffectiveHubUserToolCodes(
  user: {
    role: string;
    toolCodes: readonly string[];
    loginId?: string | null;
    toolRoles?: Readonly<Record<string, string>> | null;
    deniedToolCodes?: readonly string[] | null;
  },
  catalogCodes?: readonly string[],
): string[] {
  const catalog = [
    ...new Set(
      (catalogCodes ?? [])
        .map((code) => code.trim().toUpperCase())
        .filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const denied = deniedCodeSet([
    ...(user.deniedToolCodes ?? []),
    ...Object.entries(user.toolRoles ?? {})
      .filter(([, role]) => String(role ?? "").trim().toLowerCase() === "none")
      .map(([code]) => code),
  ]);
  if (user.role === "admin") {
    if (catalog.length) return catalog;
    return [...user.toolCodes].map((code) => code.trim().toUpperCase()).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }
  if (user.role === "manager") {
    const pool = catalog.length
      ? catalog
      : [...user.toolCodes].map((code) => code.trim().toUpperCase()).filter(Boolean);
    return pool.filter((code) => code !== "P0004" && !denied.has(code)).sort((a, b) => a.localeCompare(b));
  }
  return mergeDefaultUserToolCodes(user.toolCodes, user.loginId).filter((code) => !denied.has(code));
}

export function applyDefaultToolsToUserRow<
  T extends { role: string; toolCodes: string[]; toolCount: number; loginId?: string },
>(row: T): T {
  if (row.role === "admin" || row.role === "manager") return row;
  if (!isHubCsBuyerLoginId(row.loginId)) {
    const toolCodes = row.toolCodes.filter((code) => !isHubDefaultUserTool(code));
    return { ...row, toolCodes, toolCount: toolCodes.length };
  }
  const toolCodes = mergeDefaultUserToolCodes(row.toolCodes, row.loginId);
  return { ...row, toolCodes, toolCount: toolCodes.length };
}
