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
 * Dual-plane hosts (P0020 / P0005): pass `{ requireDataSession: true }` so Hub
 * identity alone cannot paint a signed-in footer or skip AuthGate.
 */
export function resolveWorkspaceShellSession<T>(
  reactSession: T | null | undefined,
  cachedHubSession: T | null | undefined,
  opts?: { requireDataSession?: boolean },
): T | null {
  if (isDevAutoLoginOptedOut() || opts?.requireDataSession) return reactSession ?? null;
  return reactSession ?? cachedHubSession ?? null;
}

/**
 * Canonical handler for an explicit user Sign Out.
 *
 * Returns as soon as local UI/cache is cleared (P0004 / dual-plane <1s).
 * GoTrue `signOut({ scope: "local" })` and Hub bridge clear run in the background.
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

  void Promise.race([
    Promise.resolve(pushBridgeClear?.()),
    new Promise<void>((resolve) => {
      setTimeout(resolve, 600);
    }),
  ]).catch(() => {
    /* bridge clear must never block local Sign Out */
  });

  const timeoutMs = Math.max(250, signOutTimeoutMs);
  void Promise.all(
    planes.map(async ({ getClient }) => {
      const client = getClient();
      return client ? signOutPlaneLocal(client, timeoutMs) : { error: null };
    }),
  ).catch(() => {
    /* GoTrue local signOut is best-effort after UI already left */
  });

  return { ok: true, error: null };
}