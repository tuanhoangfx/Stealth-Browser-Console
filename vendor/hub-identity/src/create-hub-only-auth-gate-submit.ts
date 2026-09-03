/**
 * SSOT onSubmit for Hub-only WorkspaceAuthGate (P0004 golden · P0006 · P0013).
 * Sign-in = one GoTrue password grant (P0004 parity). Sign-up stays supabase-js.
 */
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { extractAuthErrorText, fallbackAuthErrorText } from "./extract-auth-error-text";
import { HUB_AUTH_NOT_CONFIGURED_ERROR } from "./hub-supabase-env";
import { resolveHubLogin, type ResolvedLogin } from "./hub-login";
import { signInWithHubPassword } from "./hub-auth-submit";
import { enforceHubProfileApproval, signOutHubIfPresent } from "./hub-profile-approval";
import { recordHubToolAccessRequest } from "./hub-tool-access-request";
import {
  adoptGrantedGoTrueSession,
  grantGoTruePasswordSession,
  readSupabaseGoTrueTarget,
  type GoTruePasswordGrantInput,
} from "./gotrue-password-grant";
import type { WorkspaceAuthGateSubmit } from "./create-data-box-dual-auth-gate-submit";
import { reopenHubIdentityAfterSignIn } from "./hub-identity-cache";

export type CreateHubOnlyAuthGateSubmitConfig = {
  getHubClient: () => SupabaseClient | null;
  persistSession: (session: Session) => void;
  /**
   * Optional post-signup profile patch (P0004 / P0013).
   * Receives resolved login + auth response user id when signup succeeds.
   */
  afterSignup?: (args: {
    hub: SupabaseClient;
    resolved: ResolvedLogin;
    userId: string;
    contactEmail?: string | null;
  }) => Promise<void> | void;
  /** Override grant target when the client does not expose supabaseUrl/supabaseKey. */
  grant?: Pick<GoTruePasswordGrantInput, "supabaseUrl" | "anonKey">;
  /** Test seam — production uses grantGoTruePasswordSession. */
  grantPassword?: typeof grantGoTruePasswordSession;
  toolCode?: string;
};

export function createHubOnlyAuthGateSubmit(
  config: CreateHubOnlyAuthGateSubmitConfig,
): WorkspaceAuthGateSubmit {
  return async (login, password, mode, extras) => {
    const hub = config.getHubClient();
    if (!hub) return { error: HUB_AUTH_NOT_CONFIGURED_ERROR };
    const resolved = resolveHubLogin(login);
    const grantPassword = config.grantPassword ?? grantGoTruePasswordSession;

    const attempt = async (
      authEmail: string,
    ): Promise<{ data: { session: Session | null; user: User | null }; error: Error | null }> => {
      if (mode === "signup") {
        const result = await hub.auth.signUp({
          email: authEmail,
          password,
          options: {
            data: {
              full_name: resolved.loginId ?? authEmail.split("@")[0],
              login_id: resolved.loginId ?? undefined,
            },
          },
        });
        return {
          data: { session: result.data.session, user: result.data.user ?? null },
          error: result.error
            ? new Error(extractAuthErrorText(result.error) || fallbackAuthErrorText(result.error, "signup"))
            : null,
        };
      }
      const target = config.grant ?? readSupabaseGoTrueTarget(hub);
      if (target) {
        const granted = await grantPassword({
          supabaseUrl: target.supabaseUrl,
          anonKey: target.anonKey,
          email: authEmail,
          password,
          toolCode: config.toolCode,
        });
        if (granted.session) adoptGrantedGoTrueSession(hub, granted.session);
        return {
          data: { session: granted.session, user: granted.session?.user ?? null },
          error: granted.error,
        };
      }
      const passwordResult = await hub.auth.signInWithPassword({ email: authEmail, password });
      return {
        data: { session: passwordResult.data.session, user: passwordResult.data.user ?? null },
        error: passwordResult.error
          ? new Error(extractAuthErrorText(passwordResult.error) || fallbackAuthErrorText(passwordResult.error))
          : null,
      };
    };

    const { data, error } = await signInWithHubPassword(login, attempt, mode);
    if (error) {
      return { error: fallbackAuthErrorText(error, mode === "signup" ? "signup" : "signin") };
    }

    const userId = data?.session?.user?.id ?? data?.user?.id;
    if (mode === "signup" && config.afterSignup && resolved.loginId && userId) {
      const contactEmail =
        extras?.contactEmail || (resolved.kind === "email" ? resolved.authEmail : null);
      await config.afterSignup({ hub, resolved, userId, contactEmail });
    }

    if (config.toolCode && userId) {
      if (mode === "signup") {
        await recordHubToolAccessRequest(hub, config.toolCode);
      }
    }

    if (data?.session) {
      const gate = await enforceHubProfileApproval(hub, data.session.user?.id ?? userId);
      if (!gate.ok) {
        if (config.toolCode && mode === "signin") {
          await recordHubToolAccessRequest(hub, config.toolCode);
        }
        await signOutHubIfPresent(hub);
        return { error: gate.error };
      }
      reopenHubIdentityAfterSignIn();
      config.persistSession(data.session);
    }
  };
}
