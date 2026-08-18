/**
 * Host-registered extra auth planes + post sign-in prefetch.
 * Used by ≥2 Data Box hosts (P0012 / P0020) — must not live as copies inside useNotesAuthState.
 *
 * Hosts that own a second plane (e.g. P0020 2FA vault) register it; hosts that don't get nothing.
 */

let workspacePostSignInPrefetch: (() => void | Promise<void>) | null = null;

export function setWorkspacePostSignInPrefetch(fn: (() => void | Promise<void>) | null): void {
  workspacePostSignInPrefetch = fn;
}

export function runWorkspacePostSignInPrefetch(): void {
  void workspacePostSignInPrefetch?.();
}

let workspaceExtraAuthPlanes: (() => Promise<void>) | null = null;

export function setWorkspaceExtraAuthPlanes(fn: (() => Promise<void>) | null): void {
  workspaceExtraAuthPlanes = fn;
}

export async function signInWorkspaceExtraAuthPlanes(): Promise<void> {
  await workspaceExtraAuthPlanes?.();
}
