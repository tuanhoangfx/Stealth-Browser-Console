/**
 * SSOT: what the workspace shell paints for Hub auth.
 * Tools must not invent `if (loading && !session) boot / Signing in…`.
 */

export type WorkspaceAuthPaint = "app" | "gate" | "boot" | "denied";

export type WorkspaceAuthPaintInput = {
  configured: boolean;
  /**
   * When Hub env is missing: P0003/P0016 keep the app; P0004 waits on boot.
   * Default `app`.
   */
  unconfigured?: WorkspaceAuthPaint;
  /** Host embed already signed in — never a second gate. */
  skipAuthGate?: boolean;
  /** After policy fetch. `false` = optional login (unsigned app). Unknown until `policyReady`. */
  authRequired?: boolean;
  policyReady?: boolean;
  hasSession: boolean;
  /** Password / dev auto-login in flight — the only unsigned boot. */
  bootSigningIn?: boolean;
  /** getSession / first paint. Ignored when unsigned — gate immediately. */
  sessionLoading?: boolean;
  toolAccess?: boolean | null;
  staleToolAccess?: boolean | null;
};

/**
 * One rule for every Hub console tool.
 *
 * Unsigned + not mid-password → **gate**.
 * `sessionLoading` without a session is never boot / HubLoadingView.
 */
export function resolveWorkspaceAuthPaint(input: WorkspaceAuthPaintInput): WorkspaceAuthPaint {
  if (input.skipAuthGate) return "app";
  if (!input.configured) return input.unconfigured ?? "app";
  if (input.policyReady && input.authRequired === false) return "app";
  if (input.bootSigningIn && !input.hasSession) return "boot";
  if (!input.hasSession) return "gate";
  if (input.toolAccess === false) return "denied";
  if (input.toolAccess === null && typeof input.staleToolAccess !== "boolean") return "boot";
  return "app";
}
