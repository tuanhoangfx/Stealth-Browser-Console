import {
  HUB_PHONE_WRONG_PASSWORD_MESSAGE,
  HUB_USERNAME_WRONG_PASSWORD_MESSAGE,
} from "./hub-auth-submit";

/** Supabase signUp when auth.users row already exists (mirror drift / wrong password on sign-in). */
export const HUB_MIRROR_ALREADY_REGISTERED = /user already registered/i;

export const HUB_MIRROR_PASSWORD_DRIFT_MESSAGE =
  "Workspace password out of sync — sign in again to resync, or use Forgot Password on Tool Hub.";

const HUB_PLANE_WRONG_PASSWORD_RE =
  /incorrect password for this username|incorrect password for the account linked to this phone|invalid login credentials/i;

/**
 * Data plane reuses Hub sign-in copy — when Hub already validated the password,
 * do not tell the user to fix their Tool Hub password.
 */
export function rewriteWorkspaceDataPlaneAuthError(
  dataError: string | null | undefined,
  options: { hubValidated: boolean },
): string | null {
  const msg = String(dataError ?? "").trim();
  if (!msg) return null;
  if (!options.hubValidated) return msg;
  if (
    msg === HUB_USERNAME_WRONG_PASSWORD_MESSAGE ||
    msg === HUB_PHONE_WRONG_PASSWORD_MESSAGE ||
    HUB_PLANE_WRONG_PASSWORD_RE.test(msg)
  ) {
    return HUB_MIRROR_PASSWORD_DRIFT_MESSAGE;
  }
  return msg;
}

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
