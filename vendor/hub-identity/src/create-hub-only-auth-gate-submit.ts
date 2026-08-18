/**
 * SSOT onSubmit for Hub-only WorkspaceAuthGate (≥2 hosts: P0006 / P0013).
 */
import type { Session, SupabaseClient, AuthResponse } from "@supabase/supabase-js";
import { HUB_AUTH_NOT_CONFIGURED_ERROR } from "./hub-supabase-env";
import { resolveHubLogin, type ResolvedLogin } from "./hub-login";
import { signInWithHubPassword } from "./hub-auth-submit";
import type { WorkspaceAuthGateSubmit } from "./create-data-box-dual-auth-gate-submit";

export type CreateHubOnlyAuthGateSubmitConfig = {
  getHubClient: () => SupabaseClient | null;
  persistSession: (session: Session) => void;
  /**
   * Optional post-signup profile patch (P0013).
   * Receives resolved login + auth response user id when signup succeeds.
   */
  afterSignup?: (args: {
    hub: SupabaseClient;
    resolved: ResolvedLogin;
    userId: string;
  }) => Promise<void> | void;
};

export function createHubOnlyAuthGateSubmit(
  config: CreateHubOnlyAuthGateSubmitConfig,
): WorkspaceAuthGateSubmit {
  return async (login, password, mode) => {
    const hub = config.getHubClient();
    if (!hub) return { error: HUB_AUTH_NOT_CONFIGURED_ERROR };
    const resolved = resolveHubLogin(login);
    const attempt = (authEmail: string): Promise<AuthResponse> =>
      mode === "signup"
        ? hub.auth.signUp({
            email: authEmail,
            password,
            options: {
              data: {
                full_name: resolved.loginId ?? authEmail.split("@")[0],
                login_id: resolved.loginId ?? undefined,
              },
            },
          })
        : hub.auth.signInWithPassword({ email: authEmail, password });

    const { data, error } = await signInWithHubPassword(login, attempt, mode);
    if (error) return { error: error.message };
    if (data?.session) config.persistSession(data.session);

    if (mode === "signup" && config.afterSignup && resolved.loginId && data?.user?.id) {
      await config.afterSignup({ hub, resolved, userId: data.user.id });
    }
  };
}
