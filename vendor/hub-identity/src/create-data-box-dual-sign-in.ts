/**
 * SSOT Data Box dual-plane sign-in — used by P0012 / P0020 (P0015 inherits P0012).
 * Pattern used ≥2 tools → live here, not as near-copies under each Tool/.
 */
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { authenticateMirrorSupabase } from "./mirror-supabase-auth";
import { resolveDataBoxMirrorAuthEmails } from "./data-box-mirror-auth-emails";
import {
  adoptGrantedGoTrueSession,
  grantGoTruePasswordSession,
  readSupabaseGoTrueTarget,
} from "./gotrue-password-grant";
import {
  sanitizeHubLoginInput,
} from "./hub-login";
import { HUB_INVALID_LOGIN, signInWithHubPassword } from "./hub-auth-submit";
import { isHubAuthRateLimitError } from "./hub-auth-rate-limit";
import { recoverHubSessionViaApi } from "./hub-admin-recover-client";
import { resolveHubMirrorSignInError } from "./hub-mirror-sign-in-error";
import { resyncMirrorPasswordThenRetrySignIn } from "./hub-resync-mirror-on-signin";
import {
  runWorkspaceDualSignIn,
  type WorkspaceDualSignInTimings,
} from "./workspace-dual-sign-in";
import { WORKSPACE_DUAL_SIGN_IN_TIMEOUT_MS } from "./workspace-auth-session";

export type DataBoxDualSignInResult = {
  identitySession: Session | null;
  dataSession: Session | null;
  dataError: string | null;
  twofaSession: Session | null;
  twofaError: string | null;
};

export type DataBoxWorkspaceMirrorPlane = {
  authenticate: (args: {
    mirrorEmail: string;
    password: string;
    mode: "signin" | "signup";
  }) => Promise<{ session: Session | null; error: string | null }>;
  cacheSharedSession?: (session: Session) => void;
  revokeSpeculativeSession?: (session: Session) => Promise<void> | void;
};

export type CreateDataBoxDualSignInConfig = {
  /** Console prefix — e.g. `[P0012][auth]`. */
  logPrefix?: string;
  isHubConfigured: () => boolean;
  getHubClient: () => SupabaseClient | null;
  hubUrl: string;
  hubAnonKey: string;
  cacheHubIdentitySnapshot: (snapshot: {
    access_token: string;
    refresh_token: string;
    expires_at: number | null;
    user_id: string | null;
    user_email: string;
    supabase_url: string;
    supabase_anon_key: string;
  }) => void;
  isDataConfigured: () => boolean;
  getDataClient: () => SupabaseClient;
  cacheDataSession: (session: Session) => void;
  clearDataSession: () => void;
  recoverApiUrl: (path: string) => string;
  resolveLoginApiUrl: string;
  recoverToken?: string;
  /** Default 16_000. */
  dataSignInTimeoutMs?: number;
  onTimings?: (timings: WorkspaceDualSignInTimings) => void;
};

function maskLogin(input: string): string {
  const s = String(input ?? "").trim();
  if (!s) return "(empty)";
  if (s.includes("@")) {
    const [u, d] = s.split("@");
    return `${(u ?? "").slice(0, 2)}***@${d ?? ""}`;
  }
  return `${s.slice(0, 2)}***`;
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

async function withTimeout<T>(label: string, p: Promise<T>, ms: number): Promise<T> {
  let timer = 0;
  const timeout = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`AUTH_TIMEOUT:${label}`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

export type DataBoxDualSignInApi = {
  setWorkspaceMirrorPlane: (plane: DataBoxWorkspaceMirrorPlane | null) => void;
  signInWorkspaceDual: (
    loginInput: string,
    password: string,
    mode: "signin" | "signup",
  ) => Promise<DataBoxDualSignInResult>;
};

/** Factory — one implementation for every Data Box dual-plane host. */
export function createDataBoxDualSignIn(config: CreateDataBoxDualSignInConfig): DataBoxDualSignInApi {
  const log = config.logPrefix ?? "[hub][auth]";
  const dataTimeoutMs = config.dataSignInTimeoutMs ?? 16_000;
  let workspaceMirrorPlane: DataBoxWorkspaceMirrorPlane | null = null;
  let authFlight: Promise<DataBoxDualSignInResult> | null = null;
  let authFlightKey = "";

  async function recoverHubSessionViaWorker(
    loginInput: string,
    password: string,
    mode: "signin" | "signup" = "signin",
  ) {
    const t0 = nowMs();
    console.info(`${log} hub recover start`, { login: maskLogin(loginInput), mode });
    const recovered = await withTimeout(
      "hub-recover",
      recoverHubSessionViaApi({
        apiUrl: config.recoverApiUrl,
        loginInput,
        password,
        recoverToken: config.recoverToken,
        mirrorSessionKey: "dataSession",
        mode,
      }),
      4_000,
    ).catch((err) => {
      console.warn(`${log} hub recover timeout/fail`, {
        ms: Math.round(nowMs() - t0),
        err: err instanceof Error ? err.message : String(err),
      });
      return null;
    });
    console.info(`${log} hub recover done`, { ms: Math.round(nowMs() - t0), ok: Boolean(recovered) });
    if (!recovered) return null;
    return {
      identitySession: recovered.identitySession,
      chatcenterSession: recovered.mirrorSession,
    };
  }

  async function authenticateDataBox(
    loginInput: string,
    password: string,
    mode: "signin" | "signup",
    mirrorEmail?: string,
  ): Promise<{ session: Session | null; error: string | null }> {
    const t0 = nowMs();
    if (!config.isDataConfigured()) {
      return { session: null, error: "Workspace data plane is not configured." };
    }

    const supabase = config.getDataClient();
    const login = sanitizeHubLoginInput(loginInput);
    const mirrorEmails = resolveDataBoxMirrorAuthEmails({
      mirrorEmail,
      loginInput: login,
    });
    const primaryEmail = mirrorEmails[0];
    if (!primaryEmail) {
      return { session: null, error: "Data Box mirror identity missing (Hub opaque required)." };
    }
    const extraAuthEmails = mirrorEmails.slice(0, 2);
    const hubMirrorEmail = String(mirrorEmail ?? "").trim().toLowerCase();

    if (mode === "signup") {
      return authenticateMirrorSupabase({
        client: supabase,
        authEmail: primaryEmail,
        password,
        mode,
        cacheSession: config.cacheDataSession,
        planeLabel: "Data Box",
      });
    }

    const attempt = async (authEmail: string) => {
      const target = readSupabaseGoTrueTarget(supabase);
      if (target) {
        const granted = await grantGoTruePasswordSession({
          supabaseUrl: target.supabaseUrl,
          anonKey: target.anonKey,
          email: authEmail,
          password,
        });
        return { data: { session: granted.session }, error: granted.error };
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      return { data: { session: data.session }, error };
    };

    const signIn = await withTimeout(
      "databox-signin",
      signInWithHubPassword(login, attempt, "signin", { extraAuthEmails }),
      dataTimeoutMs,
    ).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      return { data: { session: null }, error: new Error(msg) };
    });
    const signedInSession = signIn.data?.session ?? null;
    if (!signIn.error && signedInSession) {
      config.cacheDataSession(signedInSession);
      adoptGrantedGoTrueSession(supabase, signedInSession);
      workspaceMirrorPlane?.cacheSharedSession?.(signedInSession);
      console.info(`${log} databox signin ok`, { ms: Math.round(nowMs() - t0) });
      return { session: signedInSession, error: null };
    }

    const lastError = signIn.error?.message ?? null;
    if (lastError?.startsWith("AUTH_TIMEOUT:")) {
      console.warn(`${log} databox signin timeout`, { ms: Math.round(nowMs() - t0) });
      return { session: null, error: "Data Box sign-in timed out. Please try again." };
    }
    if (lastError && isHubAuthRateLimitError(lastError)) {
      console.warn(`${log} databox signin rate-limited`, { ms: Math.round(nowMs() - t0), err: lastError });
      return { session: null, error: lastError };
    }
    if (!lastError || !HUB_INVALID_LOGIN.test(lastError)) {
      console.warn(`${log} databox signin failed`, { ms: Math.round(nowMs() - t0), err: lastError });
      return { session: null, error: lastError ?? "Data Box sign-in failed." };
    }

    for (const syncEmail of mirrorEmails) {
      const resynced = await withTimeout(
        "databox-password-sync",
        resyncMirrorPasswordThenRetrySignIn({
          mirrorEmail: syncEmail,
          password,
          loginInput: login,
          retrySignIn: async () => {
            const again = await signInWithHubPassword(login, attempt, "signin", { extraAuthEmails });
            const session = again.data?.session ?? null;
            if (!again.error && session) {
              config.cacheDataSession(session);
              adoptGrantedGoTrueSession(supabase, session);
              workspaceMirrorPlane?.cacheSharedSession?.(session);
              return { session, error: null };
            }
            return { session: null, error: again.error?.message ?? lastError };
          },
        }),
        4_000,
      ).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        return { session: null as Session | null, error: msg, via: undefined as string | undefined };
      });
      if (resynced.session) {
        console.info(`${log} databox password-sync ok`, {
          ms: Math.round(nowMs() - t0),
          via: resynced.via,
        });
        return { session: resynced.session, error: null };
      }
    }
    if (hubMirrorEmail) {
      console.warn(`${log} databox password-sync failed`, {
        ms: Math.round(nowMs() - t0),
        candidates: mirrorEmails.length,
      });
    }

    const mirror = await withTimeout(
      "databox-mirror-signup",
      authenticateMirrorSupabase({
        client: supabase,
        authEmail: primaryEmail,
        password,
        mode: "signup",
        cacheSession: config.cacheDataSession,
        planeLabel: "Data Box",
      }),
      dataTimeoutMs,
    ).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      return { session: null, error: msg };
    });
    if (mirror.session) console.info(`${log} databox mirror-signup ok`, { ms: Math.round(nowMs() - t0) });
    else console.warn(`${log} databox mirror-signup failed`, { ms: Math.round(nowMs() - t0), err: mirror.error ?? lastError });
    if (mirror.session) return mirror;
    return {
      session: null,
      error: resolveHubMirrorSignInError(mirror.error, lastError, {
        hubValidated: Boolean(hubMirrorEmail || primaryEmail),
      }),
    };
  }

  async function signInWorkspaceDualCore(
    loginInput: string,
    password: string,
    mode: "signin" | "signup",
  ): Promise<DataBoxDualSignInResult> {
    const t0 = nowMs();
    console.info(`${log} workspace sign-in start`, { mode, login: maskLogin(loginInput) });
    if (!config.isHubConfigured()) {
      throw new Error("Tool Hub identity is not configured.");
    }

    const result = await withTimeout(
      "workspace-dual",
      runWorkspaceDualSignIn(loginInput, password, mode, {
        getHubClient: config.getHubClient,
        resolveLoginApiUrl: config.resolveLoginApiUrl,
        recoverHubSession: recoverHubSessionViaWorker,
        adoptRecoveredPlaneSession: config.cacheDataSession,
        cacheHubIdentityFromSession: (session, mirrorEmail) => {
          config.cacheHubIdentitySnapshot({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at ?? null,
            user_id: session.user?.id ?? null,
            user_email: mirrorEmail,
            supabase_url: config.hubUrl,
            supabase_anon_key: config.hubAnonKey,
          });
        },
        planes: [
          {
            authenticate: ({ loginInput: login, password: pwd, mode: authMode, mirrorEmail }) =>
              authenticateDataBox(login, pwd, authMode, mirrorEmail),
            revokeSpeculativeSession: async () => {
              config.clearDataSession();
              await config.getDataClient().auth.signOut({ scope: "local" }).catch(() => {});
            },
          },
          ...(workspaceMirrorPlane
            ? [
                {
                  revokeSpeculativeSession: workspaceMirrorPlane.revokeSpeculativeSession,
                  authenticate: async ({
                    mirrorEmail,
                    password: pwd,
                    mode: authMode,
                  }: {
                    mirrorEmail: string;
                    password: string;
                    mode: "signin" | "signup";
                  }) => {
                    const tt = nowMs();
                    const out = await withTimeout(
                      "mirror-plane",
                      workspaceMirrorPlane!.authenticate({
                        mirrorEmail,
                        password: pwd,
                        mode: authMode,
                      }),
                      dataTimeoutMs,
                    ).catch((err) => {
                      const msg = err instanceof Error ? err.message : String(err);
                      return { session: null, error: msg };
                    });
                    const ms = Math.round(nowMs() - tt);
                    if (out.error) console.warn(`${log} mirror plane failed`, { ms, err: out.error });
                    else console.info(`${log} mirror plane ok`, { ms, ok: Boolean(out.session) });
                    return out;
                  },
                },
              ]
            : []),
        ],
        onTimings: config.onTimings,
      }),
      WORKSPACE_DUAL_SIGN_IN_TIMEOUT_MS,
    ).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`${log} workspace dual timeout/fail`, { ms: Math.round(nowMs() - t0), err: msg });
      const planeError = msg.startsWith("AUTH_TIMEOUT:")
        ? "Sign-in timed out — Tool Hub or workspace data plane is slow. Wait a moment and try again."
        : msg;
      return {
        identitySession: null,
        planes: [{ session: null, error: planeError }, { session: null, error: null }],
      } as unknown as Awaited<ReturnType<typeof runWorkspaceDualSignIn>>;
    });

    const data = result.planes[0] ?? { session: null, error: null };
    const twofa = result.planes[1] ?? { session: null, error: null };
    if (twofa.error) console.warn(`${log} mirror plane:`, twofa.error);

    let dataSession = data.session;
    let dataError = data.error;
    if (result.identitySession && !dataSession) {
      const rescued = await recoverHubSessionViaWorker(
        loginInput,
        password,
        mode === "signup" ? "signup" : "signin",
      );
      if (rescued?.chatcenterSession) {
        config.cacheDataSession(rescued.chatcenterSession);
        workspaceMirrorPlane?.cacheSharedSession?.(rescued.chatcenterSession);
        dataSession = rescued.chatcenterSession;
        dataError = null;
        console.info(`${log} databox rescued via worker`, { ms: Math.round(nowMs() - t0) });
      }
    }

    console.info(`${log} workspace sign-in done`, {
      ms: Math.round(nowMs() - t0),
      hub: Boolean(result.identitySession),
      databox: Boolean(dataSession),
      mirror: Boolean(twofa.session),
    });

    return {
      identitySession: result.identitySession,
      dataSession,
      dataError,
      twofaSession: twofa.session,
      twofaError: twofa.error,
    };
  }

  async function signInWorkspaceDual(
    loginInput: string,
    password: string,
    mode: "signin" | "signup",
  ): Promise<DataBoxDualSignInResult> {
    const flightKey = `${mode}:${sanitizeHubLoginInput(loginInput)}`;
    if (authFlight && authFlightKey === flightKey) return authFlight;
    const flight = signInWorkspaceDualCore(loginInput, password, mode);
    authFlight = flight;
    authFlightKey = flightKey;
    try {
      return await flight;
    } finally {
      if (authFlight === flight) {
        authFlight = null;
        authFlightKey = "";
      }
    }
  }

  return {
    setWorkspaceMirrorPlane: (plane) => {
      workspaceMirrorPlane = plane;
    },
    signInWorkspaceDual,
  };
}
