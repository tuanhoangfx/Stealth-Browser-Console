/** Tools every workspace user may use without admin approval. */
export const HUB_DEFAULT_USER_TOOL_CODES = ["P0016", "P0020"] as const;

export type HubDefaultUserToolCode = (typeof HUB_DEFAULT_USER_TOOL_CODES)[number];

export function isHubDefaultUserTool(toolCode: string): boolean {
  const code = toolCode.trim();
  return (HUB_DEFAULT_USER_TOOL_CODES as readonly string[]).includes(code);
}

export function mergeDefaultUserToolCodes(codes: Iterable<string>): string[] {
  const set = new Set([...codes].map((c) => c.trim()).filter(Boolean));
  for (const code of HUB_DEFAULT_USER_TOOL_CODES) set.add(code);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function hasEffectiveHubToolAccess(
  role: string,
  toolCode: string,
  grantedCodes: Iterable<string>,
): boolean {
  const r = role.trim().toLowerCase();
  if (r === "admin") return true;
  const code = toolCode.trim();
  if (isHubDefaultUserTool(code)) return true;
  return [...grantedCodes].some((g) => g.trim() === code);
}

export function applyDefaultToolsToUserRow<T extends { role: string; toolCodes: string[]; toolCount: number }>(
  row: T,
): T {
  if (row.role === "admin") return row;
  const toolCodes = mergeDefaultUserToolCodes(row.toolCodes);
  return { ...row, toolCodes, toolCount: toolCodes.length };
}
