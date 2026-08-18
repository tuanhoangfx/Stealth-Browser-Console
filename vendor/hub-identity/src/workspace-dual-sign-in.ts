import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { isHubAuthRateLimitError } from "./hub-auth-rate-limit";
import { hubOpaqueAuthEmailFromUserId, resolveHubLogin, sanitizeHubLoginInput } from "./hub-login";
import {
  adoptGrantedGoTrueSession,
  grantGoTruePasswordSession,
  readSupabaseGoTrueTarget,
} from "./gotrue-password-grant";
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
  /**
   * Drop a plane session obtained while Hub was still verifying the password.
   * Planes that provide it opt into parallel sign-in; without it the plane only runs
   * after Hub accepts, so a rejected identity can never leave a data JWT behind.
   */
  revokeSpeculativeSession?: (session: Session) => Promise<void> | void;
};

export type HubSessionRecoveryResult = {
  identitySession: Session;
  chatcenterSession?: Session | null;
};

export type SignInHubIdentityConfig = {
  getHubClient: () => SupabaseClient | null;
  hubNotConfiguredError?: string;
  cacheHubIdentityFromSession: (session: Session, mirrorEmail: string) => void;
  /** Same-origin resolve-login API (User ID → auth.users email). */
  resolveLoginApiUrl?: string;
  /** Tool worker bypass when GoTrue rate-limits password grant (admin recovery). */
  recoverHubSession?: (
    loginInput: string,
    password: string,
    mode?: "signin" | "signup",
  ) => Promise<HubSessionRecoveryResult | null>;
  /** Auth emails already resolved by the caller — skips a second resolve-login round trip. */
  resolvedAuthEmails?: string[];
};

export type SignInHubIdentityResult = {
  identitySession: Session;
  mirrorEmail: string;
  resolvedLoginId: string | null;
};

/** Sign in / sign up on Tool Hub identity (Home Server GoTrue, User ID email fallback). */
export async function signInHubIdentityPlane(
  loginInput: string,
  password: string,
  mode: "signin" | "signup",
  config: SignInHubIdentityConfig,
): Promise<SignInHubIdentityResult> {
  const hub = config.getHubClient();
  if (!hub) {
    throw new Error(
      config.hubNotConfiguredError ?? "Tool Hub identity is not configured.",
    );
  }

  const login = sanitizeHubLoginInput(loginInput);
  const resolved = resolveHubLogin(login);
  const identityAttempt = async (authEmail: string) => {
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
      return { data: { session: result.data.session }, error: result.error };
    }
    // Token-only grant (P0004 parity) — skip supabase-js /auth/v1/user.
    const target = readSupabaseGoTrueTarget(hub);
    if (target) {
      const granted = await grantGoTruePasswordSession({
        ...target,
        email: authEmail,
        password,
      });
      if (granted.session) adoptGrantedGoTrueSession(hub, granted.session);
      return { data: { session: granted.session }, error: granted.error };
    }
    const result = await hub.auth.signInWithPassword({ email: authEmail, password });
    return { data: { session: result.data.session }, error: result.error };
  };

  const identityResult = await signInWithHubPassword(login, identityAttempt, mode, {
    resolveLoginApiUrl: config.resolveLoginApiUrl,
    extraAuthEmails: config.resolvedAuthEmails,
  });
  let identitySession = identityResult.data?.session as Session | null | undefined;

  if (!identitySession) {
    const rateLimited =
      mode === "signin" &&
      identityResult.error &&
      isHubAuthRateLimitError(identityResult.error.message);
    const needsSignupConfirm = mode === "signup" && !identityResult.error;
    const signupAlreadyRegistered =
      mode === "signup" &&
      Boolean(identityResult.error?.message?.match(/already registered|already been registered/i));

    if ((rateLimited || needsSignupConfirm || signupAlreadyRegistered) && config.recoverHubSession) {
      try {
        const recovered = await config.recoverHubSession(
          loginInput,
          password,
          needsSignupConfirm || signupAlreadyRegistered ? "signup" : "signin",
        );
        if (recovered?.identitySession) identitySession = recovered.identitySession;
      } catch {
        /* worker offline — fall through */
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
    const userId = identitySession.user.id;
    const opaque = hubOpaqueAuthEmailFromUserId(userId);
    // Best-effort: bind auth email to immutable user id (client may lack permission).
    if (identitySession.user.email !== opaque) {
      try {
        await hub.auth.updateUser({
          email: opaque,
          data: {
            login_id: resolved.loginId,
            full_name: resolved.loginId,
          },
        });
      } catch {
        /* keep provisional opaque — still not derivable from username */
      }
    }
    await hub
      .from("profiles")
      .update({
        login_id: resolved.loginId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }

  const mirrorEmail = identitySession.user?.email ?? identityResult.authEmail ?? resolved.authEmail;
  config.cacheHubIdentityFromSession(identitySession, mirrorEmail);

  return {
    identitySession,
    mirrorEmail,
    resolvedLoginId: resolved.loginId,
  };
}

export type WorkspaceDualSignInPlaneTiming = {
  /** Plane index in `config.planes` (0 = primary data plane). */
  index: number;
  ms: number;
  ok: boolean;
  /** True when this plane ran alongside the Hub grant. */
  speculative: boolean;
};

export type WorkspaceDualSignInTimings = {
  totalMs: number;
  resolveLoginMs: number;
  hubMs: number;
  planes: WorkspaceDualSignInPlaneTiming[];
  /** True when Hub and data planes overlapped. */
  parallel: boolean;
};

export type RunWorkspaceDualSignInConfig = SignInHubIdentityConfig & {
  planes: WorkspaceDataPlane[];
  /** Optional mirror session from Hub recovery (e.g. Chat Center when rate-limited). */
  adoptRecoveredPlaneSession?: (session: Session) => void;
  /** Best-effort timing callback — never throws into the sign-in path. */
  onTimings?: (timings: WorkspaceDualSignInTimings) => void;
};

export type WorkspaceDualSignInCoreResult = {
  identitySession: Session;
  mirrorEmail: string;
  planes: MirrorSupabaseAuthResult[];
  timings: WorkspaceDualSignInTimings;
};

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function planesAreRevocable(planes: WorkspaceDataPlane[], mode: string): boolean {
  return (
    mode === "signin" &&
    planes.length > 0 &&
    planes.every((plane) => typeof plane.revokeSpeculativeSession === "function")
  );
}

/** Hub rejected the password after a parallel plane already signed in — drop those sessions. */
async function revokeSpeculativePlaneSessions(
  planes: WorkspaceDataPlane[],
  results: Promise<MirrorSupabaseAuthResult[]>,
): Promise<void> {
  const settled = await results.catch(() => [] as MirrorSupabaseAuthResult[]);
  await Promise.all(
    settled.map(async (result, index) => {
      if (!result?.session) return;
      try {
        await planes[index]?.revokeSpeculativeSession?.(result.session);
      } catch {
        /* best effort — caller still rejects the sign-in */
      }
    }),
  );
}

function measurePlaneAuthenticate(
  plane: WorkspaceDataPlane,
  ctx: {
    loginInput: string;
    password: string;
    mode: "signin" | "signup";
    mirrorEmail: string;
  },
  index: number,
  speculative: boolean,
  into: WorkspaceDualSignInPlaneTiming[],
): Promise<MirrorSupabaseAuthResult> {
  const t0 = nowMs();
  return plane
    .authenticate(ctx)
    .then((value) => {
      into[index] = {
        index,
        ms: Math.max(0, Math.round(nowMs() - t0)),
        ok: Boolean(value.session),
        speculative,
      };
      return value;
    })
    .catch((reason: unknown) => {
      into[index] = {
        index,
        ms: Math.max(0, Math.round(nowMs() - t0)),
        ok: false,
        speculative,
      };
      throw reason;
    });
}

/** Hub identity sign-in and each configured data-plane mirror, in parallel when possible. */
export async function runWorkspaceDualSignIn(
  loginInput: string,
  password: string,
  mode: "signin" | "signup",
  config: RunWorkspaceDualSignInConfig,
): Promise<WorkspaceDualSignInCoreResult> {
  const t0 = nowMs();
  let resolveLoginMs = 0;
  let hubMs = 0;
  const planeTimings: WorkspaceDualSignInPlaneTiming[] = [];
  let parallel = false;

  let recoveredPlaneSession: Session | null | undefined;
  const wrappedConfig: SignInHubIdentityConfig = {
    ...config,
    recoverHubSession: config.recoverHubSession
      ? async (login, pwd, recoverMode) => {
          const recovered = await config.recoverHubSession!(login, pwd, recoverMode);
          if (recovered?.chatcenterSession) recoveredPlaneSession = recovered.chatcenterSession;
          return recovered;
        }
      : undefined,
  };

  // P0004 parity: Hub starts immediately (resolve-login lives inside the grant).
  // Revocable data planes start at t=0 from loginInput — do not wait for a unique
  // resolve-login email (multi-email CEO accounts used to serialize Hub then Data Box).
  const tHubStart = nowMs();
  const identityPromise = signInHubIdentityPlane(loginInput, password, mode, wrappedConfig).then(
    (value) => {
      hubMs = Math.max(0, Math.round(nowMs() - tHubStart));
      return value;
    },
  );
  let speculativePlanes: Promise<MirrorSupabaseAuthResult[]> | null = null;
  if (planesAreRevocable(config.planes, mode)) {
    parallel = true;
    const speculativeCtx = { loginInput, password, mode, mirrorEmail: "" };
    speculativePlanes = Promise.all(
      config.planes.map((plane, index) =>
        measurePlaneAuthenticate(plane, speculativeCtx, index, true, planeTimings),
      ),
    );
    speculativePlanes.catch(() => []);
  }

  let identity: SignInHubIdentityResult;
  try {
    identity = await identityPromise;
  } catch (err) {
    if (speculativePlanes) {
      await revokeSpeculativePlaneSessions(config.planes, speculativePlanes);
    }
    throw err;
  }
  const { identitySession, mirrorEmail } = identity;

  const planeCtx = { loginInput, password, mode, mirrorEmail };
  let planeResults: MirrorSupabaseAuthResult[] = [];
  if (speculativePlanes) {
    planeResults = await speculativePlanes.catch(() => [] as MirrorSupabaseAuthResult[]);
  }
  planeResults = await Promise.all(
    config.planes.map(async (plane, index) => {
      if (planeResults[index]?.session) return planeResults[index];
      return measurePlaneAuthenticate(plane, planeCtx, index, false, planeTimings);
    }),
  );

  const planes: MirrorSupabaseAuthResult[] = [];
  let recovered = recoveredPlaneSession;
  for (const result of planeResults) {
    if (!result.session && recovered) {
      config.adoptRecoveredPlaneSession?.(recovered);
      planes.push({ session: recovered, error: result.error });
      recovered = null;
      continue;
    }
    planes.push(result);
  }

  const timings: WorkspaceDualSignInTimings = {
    totalMs: Math.max(0, Math.round(nowMs() - t0)),
    resolveLoginMs,
    hubMs,
    planes: planeTimings,
    parallel,
  };
  try {
    config.onTimings?.(timings);
  } catch {
    /* never break sign-in for logging */
  }

  return { identitySession, mirrorEmail, planes, timings };
}
