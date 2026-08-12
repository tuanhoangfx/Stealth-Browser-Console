import type { SupabaseClient } from "@supabase/supabase-js";
import { hubSessionLabels } from "./hub-session-labels";
import { syncMirrorPasswordViaApi } from "./hub-sync-mirror-password-client";

export type BindWorkspaceMirrorPasswordRecoverySyncConfig = {
  getHubClient: () => SupabaseClient | null;
  syncApiUrl?: string;
  /** Called after Hub password update (reset form) with plaintext for mirror sync. */
  onSyncError?: (message: string) => void;
};

export type ConfirmHubOtpPasswordWithMirrorSyncOptions = {
  hubClient: SupabaseClient;
  email: string;
  code: string;
  password: string;
  syncApiUrl?: string;
  loginInput?: string;
  onSyncError?: (message: string) => void;
};

export type HubPasswordChangeResult = { ok: boolean; message: string };

/**
 * OTP verify + Hub password update + workspace mirror sync (Data Box RLS planes).
 * SSOT for Hub account modal change-password flow (P0004 golden).
 */
export async function confirmHubOtpPasswordWithMirrorSync(
  options: ConfirmHubOtpPasswordWithMirrorSyncOptions,
): Promise<HubPasswordChangeResult> {
  const email = options.email.trim().toLowerCase();
  const code = options.code.trim();
  const password = options.password;
  if (!code || password.length < 6) {
    return { ok: false, message: "Enter the email code and a password (min 6 characters)." };
  }

  const { error: verifyErr } = await options.hubClient.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (verifyErr) return { ok: false, message: verifyErr.message };

  const { error: pwdErr } = await options.hubClient.auth.updateUser({ password });
  if (pwdErr) return { ok: false, message: pwdErr.message };

  const session = (await options.hubClient.auth.getSession()).data.session;
  const labels = hubSessionLabels(session);
  const mirrorEmail = session?.user?.email ?? labels.authEmail ?? email;

  const synced = await syncWorkspaceMirrorAfterHubPasswordChange({
    getHubClient: () => options.hubClient,
    syncApiUrl: options.syncApiUrl,
    onSyncError: options.onSyncError,
    mirrorEmail,
    password,
    loginInput: options.loginInput ?? labels.loginId,
  });

  if (!synced) {
    return {
      ok: true,
      message: "Hub password updated. Workspace sync pending — sign in again on other tools to resync.",
    };
  }

  return { ok: true, message: "Password updated across Workspace." };
}

/**
 * After Hub password reset / update, push the same password to workspace mirror planes.
 * Call from the password-reset submit handler once `updateUser({ password })` succeeds.
 */
export async function syncWorkspaceMirrorAfterHubPasswordChange(
  config: BindWorkspaceMirrorPasswordRecoverySyncConfig & {
    mirrorEmail: string;
    password: string;
    loginInput?: string;
  },
): Promise<boolean> {
  const result = await syncMirrorPasswordViaApi({
    apiUrl: config.syncApiUrl,
    mirrorEmail: config.mirrorEmail,
    password: config.password,
    loginInput: config.loginInput,
  });
  if (!result.ok && result.error) config.onSyncError?.(result.error);
  return result.ok;
}

/** Listen for PASSWORD_RECOVERY — caller must invoke sync when user submits new password. */
export function bindWorkspaceMirrorPasswordRecoveryHint(
  config: BindWorkspaceMirrorPasswordRecoverySyncConfig,
): () => void {
  const client = config.getHubClient();
  if (!client) return () => {};

  const { data } = client.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      /* UI layer should call syncWorkspaceMirrorAfterHubPasswordChange on form submit. */
    }
  });

  return () => data.subscription.unsubscribe();
}
