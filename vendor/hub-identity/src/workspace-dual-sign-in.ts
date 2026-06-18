import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { isHubAuthRateLimitError } from "./hub-auth-rate-limit";
import { resolveHubLogin, sanitizeHubLoginInput } from "./hub-login";
import { signInWithHubPassword } from "./hub-auth-submit";
import type { MirrorSupabaseAuthResult } from "./mirror-supabase-auth";

export type { MirrorSupabaseAuthResult };

export type WorkspaceDataPlane = {
  authenticate: (ctx: {
    loginInput: string;
    password: string;
    mode: "signin" | "signup";
    mirrorEmail: string;
  }) => Promise<MirrorSupabaseAuthResult>;
};

export type HubSessionRecoveryResult = {
  identitySession: Session;
  chatcenterSession?: Session | null;
};

export type SignInHubIdentityConfig = {
  getHubClient: () => SupabaseClient | null;
  hubNotConfiguredError?: string;
  cacheHubIdentityFromSession: (session: Session, mirrorEmail: string) => void;
  /** Tool worker bypass when GoTrue rate-limits password grant (admin recovery). */
  recoverHubSession?: (
    loginInput: string,
    password: string,
  ) => Promise<HubSessionRecoveryResult | null>;
};

export type SignInHubIdentityResult = {
  identitySession: Session;
  mirrorEmail: string;
  resolvedLoginId: string | null;
};

/** Sign in / sign up on Tool Hub identity Supabase (with User ID email fallback). */
export async function signInHubIdentityPlane(
  loginInput: string,
  password: string,
  mode: "signin" | "signup",
  config: SignInHubIdentityConfig,
): Promise<SignInHubIdentityResult> {
  const hub = config.getHubClient();
  if (!hub) {
    throw new Error(
      config.hubNotConfiguredError ?? "Tool Hub Supabase is not configured (VITE_HUB_SUPABASE_ANON_KEY).",
    );
  }

  const login = sanitizeHubLoginInput(loginInput);
  const resolved = resolveHubLogin(login);
  const identityAttempt = async (authEmail: string) => {
    const result =
      mode === "signup"
        ? await hub.auth.signUp({
            email: authEmail,
            password,
            options: {
              data: {
                full_name: resolved.loginId ?? authEmail.split("@")[0],
                login_id: resolved.loginId ?? undefined,
              },
            },
          })
        : await hub.auth.signInWithPassword({ email: authEmail, password });
    return { data: { session: result.data.session }, error: result.error };
  };

  const identityResult = await signInWithHubPassword(login, identityAttempt, mode);
  let identitySession = identityResult.data?.session as Session | null | undefined;

  if (!identitySession) {
    const rateLimited =
      mode === "signin" &&
      identityResult.error &&
      isHubAuthRateLimitError(identityResult.error.message);
    if (rateLimited && config.recoverHubSession) {
      try {
        const recovered = await config.recoverHubSession(loginInput, password);
        if (recovered?.identitySession) identitySession = recovered.identitySession;
      } catch {
        /* worker offline — fall through to rate-limit message */
      }
    }
    if (!identitySession) {
      if (identityResult.error) throw identityResult.error;
      throw new Error(
        mode === "signup" ? "Check your email to confirm sign-up on Tool Hub." : "No Hub session returned.",
      );
    }
  }

  if (mode === "signup" && resolved.loginId && identitySession.user?.id) {
    await hub
      .from("profiles")
      .update({
        login_id: resolved.loginId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", identitySession.user.id);
  }

  const mirrorEmail = identitySession.user?.email ?? identityResult.authEmail ?? resolved.authEmail;
  config.cacheHubIdentityFromSession(identitySession, mirrorEmail);

  return {
    identitySession,
    mirrorEmail,
    resolvedLoginId: resolved.loginId,
  };
}

export type RunWorkspaceDualSignInConfig = SignInHubIdentityConfig & {
  planes: WorkspaceDataPlane[];
  /** Optional mirror session from Hub recovery (e.g. Chat Center when rate-limited). */
  adoptRecoveredPlaneSession?: (session: Session) => void;
};

export type WorkspaceDualSignInCoreResult = {
  identitySession: Session;
  mirrorEmail: string;
  planes: MirrorSupabaseAuthResult[];
};

/** Hub identity sign-in, then each configured data-plane mirror. */
export async function runWorkspaceDualSignIn(
  loginInput: string,
  password: string,
  mode: "signin" | "signup",
  config: RunWorkspaceDualSignInConfig,
): Promise<WorkspaceDualSignInCoreResult> {
  let recoveredPlaneSession: Session | null | undefined;
  const wrappedConfig: SignInHubIdentityConfig = {
    ...config,
    recoverHubSession: config.recoverHubSession
      ? async (login, pwd) => {
          const recovered = await config.recoverHubSession!(login, pwd);
          if (recovered?.chatcenterSession) recoveredPlaneSession = recovered.chatcenterSession;
          return recovered;
        }
      : undefined,
  };

  const { identitySession, mirrorEmail } = await signInHubIdentityPlane(
    loginInput,
    password,
    mode,
    wrappedConfig,
  );

  const planes: MirrorSupabaseAuthResult[] = [];
  for (const plane of config.planes) {
    const result = await plane.authenticate({
      loginInput,
      password,
      mode,
      mirrorEmail,
    });
    if (!result.session && recoveredPlaneSession) {
      config.adoptRecoveredPlaneSession?.(recoveredPlaneSession);
      planes.push({ session: recoveredPlaneSession, error: result.error });
      recoveredPlaneSession = null;
      continue;
    }
    planes.push(result);
  }

  return { identitySession, mirrorEmail, planes };
}
