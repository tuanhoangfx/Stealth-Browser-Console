import { isDevAutoLoginOptedOut, optOutDevAutoLogin } from "./dev-auto-login";
import { markHubIdentitySignedOut } from "./hub-identity-cache";

export type WorkspaceAuthClient = {
  auth: {
    signOut: (options?: { scope?: "local" | "global" | "others" }) => Promise<{ error: unknown | null }>;
  };
};

export type WorkspaceSignOutPlane = {
  getClient: () => WorkspaceAuthClient | null | undefined;
  clearCache?: () => void;
};

export type WorkspaceSignOutResult = {
  ok: boolean;
  error: unknown | null;
};

export type PerformWorkspaceSignOutOptions = {
  planes: readonly WorkspaceSignOutPlane[];
  stopTokenScheduler?: () => void;
  clearProfileRoleCache?: () => void;
  pushBridgeClear?: () => void | Promise<void>;
  onAfterSignOut?: () => void;
  /**
   * Cap each GoTrue `signOut` — local scope can still hang on a slow/unreachable
   * Auth host in dev, leaving the account modal on "Please wait…".
   */
  signOutTimeoutMs?: number;
};

/** Default wall for one plane's `auth.signOut` during explicit Sign Out. */
export const WORKSPACE_SIGN_OUT_PLANE_TIMEOUT_MS = 4_000;

async function signOutPlaneLocal(
  client: WorkspaceAuthClient,
  timeoutMs: number,
): Promise<{ error: unknown | null }> {
  try {
    const result = await Promise.race([
      client.auth.signOut({ scope: "local" }),
      new Promise<{ error: null }>((resolve) => {
        setTimeout(() => resolve({ error: null }), timeoutMs);
      }),
    ]);
    return result ?? { error: null };
  } catch (error) {
    return { error };
  }
}

/**
 * Sticky tab flag from `optOutDevAutoLogin()` — after explicit Sign Out, Hub
 * bridge / relay must not resurrect a JWT until the user signs in again.
 */
export function shouldAcceptHubIdentityRelay(): boolean {
  return !isDevAutoLoginOptedOut();
}

/**
 * Sidebar shell session: never fall back to Hub JWT cache after explicit Sign Out.
 * Otherwise `readCachedHubSession() ?? reactSession` re-paints the footer email
 * when a sibling Hub tab (or bridge) re-broadcasts identity.
 */
export function resolveWorkspaceShellSession<T>(
  reactSession: T | null | undefined,
  cachedHubSession: T | null | undefined,
): T | null {
  if (isDevAutoLoginOptedOut()) return reactSession ?? null;
  return reactSession ?? cachedHubSession ?? null;
}

/**
 * Canonical handler for an explicit user Sign Out.
 *
 * Product-owned state (Data Box, 2FA, tool access, etc.) belongs in each plane's
 * `clearCache`; this shared layer only guarantees opt-out + local GoTrue clearing.
 */
export async function performWorkspaceSignOut({
  planes,
  stopTokenScheduler,
  clearProfileRoleCache,
  pushBridgeClear,
  onAfterSignOut,
  signOutTimeoutMs = WORKSPACE_SIGN_OUT_PLANE_TIMEOUT_MS,
}: PerformWorkspaceSignOutOptions): Promise<WorkspaceSignOutResult> {
  optOutDevAutoLogin();
  markHubIdentitySignedOut();
  stopTokenScheduler?.();
  clearProfileRoleCache?.();

  for (const plane of planes) plane.clearCache?.();
  // Drop React/session UI immediately — GoTrue local signOut can hang on a slow
  // Auth host; waiting for it left HubFullUserAccountModal on "Signing out…".
  onAfterSignOut?.();

  try {
    // Retries inside the bridge push must not extend the visible Sign Out.
    await Promise.race([
      Promise.resolve(pushBridgeClear?.()),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 600);
      }),
    ]);
  } catch {
    /* bridge clear must never block local Sign Out */
  }

  const timeoutMs = Math.max(500, signOutTimeoutMs);
  let error: unknown | null = null;
  try {
    const results = await Promise.all(
      planes.map(async ({ getClient }) => {
        const client = getClient();
        return client ? signOutPlaneLocal(client, timeoutMs) : { error: null };
      }),
    );
    error = results.find((result) => result.error)?.error ?? null;
  } catch (err) {
    error = err;
  }
  return { ok: !error, error };
}