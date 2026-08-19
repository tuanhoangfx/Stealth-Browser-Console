/**
 * Dual-plane hosts that embed Hub Users/Org (P0012, P0015).
 * Workspace data-plane persistSession can look signed-in while Hub JWT is dead —
 * Users then RPC-fails `workspace_user_directory` as "not authenticated".
 *
 * P0020 Notes / P0005 CRM: product data session alone is valid — do not
 * force Login when Hub JWT is missing. Names: `_cards/hub-auth-planes.md`.
 */

export const WORKSPACE_REAUTH_REQUIRED_EVENT = "x1z10:workspace-reauth-required";

/** Hydrate then Sign Out if Hub JWT is still missing (avoid 1.2s Login flicker). */
export const DUAL_PLANE_HUB_JWT_FORCE_LOGIN_MS = 8_000;

export function dispatchWorkspaceReauthRequired(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WORKSPACE_REAUTH_REQUIRED_EVENT));
}

export function subscribeWorkspaceReauthRequired(onReauth: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    onReauth();
  };
  window.addEventListener(WORKSPACE_REAUTH_REQUIRED_EVENT, handler);
  return () => window.removeEventListener(WORKSPACE_REAUTH_REQUIRED_EVENT, handler);
}

/** Data plane token without Hub JWT is not a live Users/Org session. */
export function shouldForceLoginMissingHubJwt(input: {
  hubAccessToken?: string | null;
  dataAccessToken?: string | null;
}): boolean {
  return Boolean(input.dataAccessToken?.trim()) && !input.hubAccessToken?.trim();
}

/**
 * Users/Org embed paint: deny only after Hub JWT exists (avoid hydrate flicker).
 * Missing Hub stays optimistic `true` until force-login / checkToolAccess.
 */
export function resolveDualPlaneToolAccessForPaint(input: {
  hasDataSession: boolean;
  toolAccess: boolean | null;
  hasHubJwt: boolean;
}): boolean {
  return input.hasDataSession && input.toolAccess === false && input.hasHubJwt ? false : true;
}
