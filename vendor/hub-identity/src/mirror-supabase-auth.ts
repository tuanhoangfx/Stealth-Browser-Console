import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { HUB_INVALID_LOGIN } from "./hub-auth-submit";

export type MirrorSupabaseAuthConfig = {
  client: SupabaseClient;
  authEmail: string;
  password: string;
  mode: "signin" | "signup";
  cacheSession: (session: Session) => void;
  planeLabel: string;
  confirmSignUpMessage?: string;
};

export type MirrorSupabaseAuthResult = {
  session: Session | null;
  error: string | null;
};

/**
 * Mirror Hub-validated credentials onto a workspace Supabase project (RLS).
 * signIn → on invalid credentials → signUp fallback (no extra sign-up UI).
 */
export async function authenticateMirrorSupabase(
  config: MirrorSupabaseAuthConfig,
): Promise<MirrorSupabaseAuthResult> {
  const trimmed = config.authEmail.trim();
  const signIn = () => config.client.auth.signInWithPassword({ email: trimmed, password: config.password });
  const signUp = () => config.client.auth.signUp({ email: trimmed, password: config.password });
  const confirmMsg =
    config.confirmSignUpMessage ??
    `Check your email to confirm sign-up on ${config.planeLabel}, or disable Confirm email in Supabase Auth.`;

  if (config.mode === "signup") {
    const { data, error } = await signUp();
    if (error) {
      // Account already exists — fall through to password sign-in (mirror planes share Hub password).
      if (/already registered|already been registered/i.test(error.message)) {
        const again = await signIn();
        if (!again.error && again.data.session) {
          config.cacheSession(again.data.session);
          return { session: again.data.session, error: null };
        }
        return { session: null, error: again.error?.message ?? error.message };
      }
      return { session: null, error: error.message };
    }
    if (!data.session) return { session: null, error: confirmMsg };
    config.cacheSession(data.session);
    return { session: data.session, error: null };
  }

  const first = await signIn();
  if (!first.error && first.data.session) {
    config.cacheSession(first.data.session);
    return { session: first.data.session, error: null };
  }

  if (first.error && HUB_INVALID_LOGIN.test(first.error.message)) {
    const mirror = await signUp();
    if (!mirror.error && mirror.data.session) {
      config.cacheSession(mirror.data.session);
      return { session: mirror.data.session, error: null };
    }
    if (mirror.error && /already registered|already been registered/i.test(mirror.error.message)) {
      // Sign-up collision after invalid-login — retry sign-in once (GoTrue race / mirror drift).
      const retry = await signIn();
      if (!retry.error && retry.data.session) {
        config.cacheSession(retry.data.session);
        return { session: retry.data.session, error: null };
      }
      return {
        session: null,
        error: retry.error?.message ?? "Incorrect user ID/email or password.",
      };
    }
    if (mirror.error) return { session: null, error: mirror.error.message };
  }

  return { session: null, error: first.error?.message ?? `${config.planeLabel} sign-in failed.` };
}
