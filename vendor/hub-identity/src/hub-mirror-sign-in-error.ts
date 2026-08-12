/** Supabase signUp when auth.users row already exists (mirror drift / wrong password on sign-in). */
export const HUB_MIRROR_ALREADY_REGISTERED = /user already registered/i;

export const HUB_MIRROR_PASSWORD_DRIFT_MESSAGE =
  "Workspace password out of sync — sign in again to resync, or use Forgot Password on Tool Hub.";

/** Map mirror sign-up noise to sign-in copy when the Hub password was already validated. */
export function resolveHubMirrorSignInError(
  mirrorError: string | null | undefined,
  fallback: string | null | undefined,
  opts?: { hubValidated?: boolean },
): string {
  const err = String(mirrorError ?? "").trim();
  if (HUB_MIRROR_ALREADY_REGISTERED.test(err)) {
    return opts?.hubValidated ? HUB_MIRROR_PASSWORD_DRIFT_MESSAGE : "Incorrect user ID/email or password.";
  }
  const fb = String(fallback ?? "").trim();
  return err || fb || "Sign-in failed.";
}
