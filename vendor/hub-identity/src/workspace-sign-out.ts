import { isDevAutoLoginOptedOut, optOutDevAutoLogin } from "./dev-auto-login";

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
};

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
}: PerformWorkspaceSignOutOptions): Promise<WorkspaceSignOutResult> {
  optOutDevAutoLogin();
  stopTokenScheduler?.();
  clearProfileRoleCache?.();

  for (const plane of planes) plane.clearCache?.();
  await pushBridgeClear?.();

  const results = await Promise.all(
    planes.map(async ({ getClient }) => {
      const client = getClient();
      return client ? client.auth.signOut({ scope: "local" }) : { error: null };
    }),
  );
  const error = results.find((result) => result.error)?.error ?? null;
  onAfterSignOut?.();
  return { ok: !error, error };
}