/** Hub-integrated tools with workspace login (identity DB SSOT). */
export const HUB_INTEGRATED_LOGIN_TOOL_CODES = ["P0003", "P0004", "P0016", "P0020"] as const;

export type HubIntegratedLoginToolCode = (typeof HUB_INTEGRATED_LOGIN_TOOL_CODES)[number];

export type HubIntegratedToolRole = "admin" | "manager" | "user" | "employee";

export type HubIntegratedToolStatus = HubIntegratedToolRole | "none";

export const HUB_INTEGRATED_LOGIN_TOOLS: ReadonlyArray<{
  code: HubIntegratedLoginToolCode;
  label: string;
  inheritedRole: boolean;
}> = [
  { code: "P0003", label: "P0003", inheritedRole: false },
  { code: "P0004", label: "P0004", inheritedRole: true },
  { code: "P0016", label: "P0016", inheritedRole: true },
  { code: "P0020", label: "P0020", inheritedRole: true },
] as const;

export function isHubIntegratedLoginTool(toolCode: string): toolCode is HubIntegratedLoginToolCode {
  return (HUB_INTEGRATED_LOGIN_TOOL_CODES as readonly string[]).includes(toolCode.trim());
}

export function isP0004HubLogin(toolCode: string): boolean {
  return toolCode.trim() === "P0004";
}

export type HubIntegratedLoginUserContext = {
  role: string;
  toolCodes: readonly string[];
  toolRoles?: Readonly<Record<string, string>>;
};

function isGrantedLevel(level: string | null | undefined): boolean {
  const v = String(level ?? "").trim().toLowerCase();
  return v !== "" && v !== "none";
}

export function integratedToolLevel(
  user: HubIntegratedLoginUserContext,
  code: HubIntegratedLoginToolCode,
): string {
  const explicit = user.toolRoles?.[code];
  if (explicit) return explicit;
  const hubRole = user.role;
  if (user.role === "admin") return hubRole;
  if (isP0004HubLogin(code)) return hubRole;
  if (user.toolCodes.includes(code)) return hubRole;
  return "none";
}

export function hasIntegratedLoginToolAccess(
  user: HubIntegratedLoginUserContext,
  code: HubIntegratedLoginToolCode,
): boolean {
  if (user.role === "admin") return true;
  if (code === "P0004") return true;
  return isGrantedLevel(integratedToolLevel(user, code));
}

export function getIntegratedLoginToolStatus(
  user: HubIntegratedLoginUserContext,
  code: HubIntegratedLoginToolCode,
): HubIntegratedToolStatus {
  const level = integratedToolLevel(user, code);
  if (!isGrantedLevel(level)) return "none";
  if (level === "granted") return (user.toolRoles?.[code] as HubIntegratedToolRole) ?? (user.role as HubIntegratedToolRole);
  return level as HubIntegratedToolStatus;
}

export function integratedLoginToolStatusLabel(status: HubIntegratedToolStatus): string {
  if (status === "admin") return "Admin";
  if (status === "manager") return "Manager";
  if (status === "user" || status === "employee") return "User";
  return "No access";
}

export function integratedLoginRoleTitle(
  code: HubIntegratedLoginToolCode,
  status: HubIntegratedToolStatus,
  inheritedRole = true,
): string {
  const base = `${code} tool role: ${integratedLoginToolStatusLabel(status)}`;
  return inheritedRole && status !== "none" ? `${base} (inherited from Hub role)` : base;
}
