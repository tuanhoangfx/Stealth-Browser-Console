import type { WorkspaceAuthToolCode } from "./workspace-auth-gate-preset";

const WORKSPACE_AUTH_TOOL_CODES = new Set<string>([
  "P0001",
  "P0003",
  "P0004",
  "P0005",
  "P0006",
  "P0012",
  "P0013",
  "P0015",
  "P0016",
  "P0020",
  "P0021",
  "P0022",
]);

export function isWorkspaceAuthToolCode(value: string | null | undefined): value is WorkspaceAuthToolCode {
  const code = String(value ?? "")
    .trim()
    .toUpperCase();
  return WORKSPACE_AUTH_TOOL_CODES.has(code);
}

/**
 * Resolve which Hub `tool_access` code a dual-plane shell must check.
 * Embed hosts (P0015 Enzy) pass `hostCode` from `setHubHostCodeOverride` / `?hostCode=`;
 * standalone tools pass null and keep their product fallback (P0012, P0003, …).
 */
export function resolveWorkspaceAuthToolCode(input: {
  hostCode?: string | null;
  fallback: WorkspaceAuthToolCode;
}): WorkspaceAuthToolCode {
  const host = String(input.hostCode ?? "")
    .trim()
    .toUpperCase();
  if (isWorkspaceAuthToolCode(host)) return host;
  return input.fallback;
}
