import {
  HUB_MIRROR_PASSWORD_DRIFT_MESSAGE,
} from "./hub-mirror-sign-in-error";
import { syncMirrorPasswordViaApi } from "./hub-sync-mirror-password-client";

export type ResyncMirrorOnSignInOptions<T> = {
  mirrorEmail: string;
  password: string;
  loginInput?: string;
  syncApiUrl?: string;
  /** Retry Data Box password grant after server-side sync. */
  retrySignIn: () => Promise<{ session: T | null; error: string | null }>;
};

/**
 * Hub password already validated — push it to the workspace mirror plane, then retry sign-in.
 * Used when Data Box returns invalid credentials after a successful Hub grant (password drift).
 */
export async function resyncMirrorPasswordThenRetrySignIn<T>(
  options: ResyncMirrorOnSignInOptions<T>,
): Promise<{ session: T | null; error: string | null; via?: string }> {
  const mirrorEmail = options.mirrorEmail.trim().toLowerCase();
  if (!mirrorEmail) {
    return { session: null, error: HUB_MIRROR_PASSWORD_DRIFT_MESSAGE };
  }

  const synced = await syncMirrorPasswordViaApi({
    apiUrl: options.syncApiUrl,
    mirrorEmail,
    password: options.password,
    loginInput: options.loginInput,
  });
  if (!synced.ok) {
    return {
      session: null,
      error: synced.error?.trim() || HUB_MIRROR_PASSWORD_DRIFT_MESSAGE,
      via: synced.via,
    };
  }

  const retry = await options.retrySignIn();
  if (retry.session) {
    return { session: retry.session, error: null, via: synced.via ?? "password_sync" };
  }
  return {
    session: null,
    error: retry.error?.trim() || HUB_MIRROR_PASSWORD_DRIFT_MESSAGE,
    via: synced.via,
  };
}
