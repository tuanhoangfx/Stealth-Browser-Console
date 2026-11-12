/** Supabase session refresh + header helpers for extension sync */

import {
  E0001_DATA_SUPABASE_ANON_KEY,
  E0001_DATA_SUPABASE_URL,
  E0001_IDENTITY_SUPABASE_ANON_KEY,
  E0001_IDENTITY_SUPABASE_URL,
} from "./supabase-config.js";
import {
  isHubTechnicalAuthEmail,
  resolveHubLogin,
  sanitizeHubLoginInput,
} from "./vendor/hub-identity/hub-login.js";
import { signInWithHubPassword } from "./vendor/hub-identity/hub-auth-submit.js";
import { resolveHubLoginEmails } from "./vendor/hub-identity/hub-resolve-login.js";

const INVALID_LOGIN = /invalid login credentials/i;
const AUTH_FETCH_TIMEOUT_MS = 16_000;
const EMPTY_AUTH_ERROR = /^(?:\{\}|\[\]|\[object Object\])$/i;
const HUB_SIGNIN_FAILED_MESSAGE = "Sign-in failed. Please try again.";
const HUB_SIGNUP_FAILED_MESSAGE =
  "Sign-up failed. Try a different User ID, or Sign In if this account already exists.";
const HUB_SIGNUP_ALREADY_REGISTERED_MESSAGE = "This User ID is already registered. Use Sign In.";
const HUB_PASSWORD_RESET_REDIRECT = "https://infi.io.vn/";
const HUB_AUTH_GATEWAY_SIGN_IN_URL = "https://api.infi.io.vn/hub/auth/sign-in";
const GATEWAY_AUTH_STATUSES = new Set([502, 503, 504, 530]);
const AUTH_TRANSPORT_ERROR =
  /message port closed|receiving end does not exist|could not establish connection|asynchronous response by returning true|message channel closed|extension context invalidated/i;

async function fetchWithTimeout(url, options = {}, timeoutMs = AUTH_FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("Cannot reach Supabase Auth — request timed out. Check project status in Supabase Dashboard.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function isJwtExpired(auth, bufferSec = 60) {
  if (!auth?.access_token) return true;
  const exp = Number(auth.expires_at);
  if (!exp) return false;
  return exp <= Math.floor(Date.now() / 1000) + bufferSec;
}

/** RPC note_sync_* — always anon JWT + pass (security definer). */
export function rpcHeaders(auth, extra = {}) {
  return {
    apikey: auth.supabase_anon_key,
    Authorization: `Bearer ${auth.supabase_anon_key}`,
    Accept: "application/json",
    ...extra,
  };
}

/** REST PATCH notes — user session JWT */
export function userHeaders(auth, extra = {}) {
  const token = auth?.access_token || auth.supabase_anon_key;
  return {
    apikey: auth.supabase_anon_key,
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    ...extra,
  };
}

/** Persist HubWorkspaceUserModal profile fields from Supabase Auth user object. */
function userProfileFieldsFromAuthUser(user) {
  if (!user || typeof user !== "object") return {};
  const role = user?.app_metadata?.role ?? user?.user_metadata?.role ?? null;
  const provider = user?.app_metadata?.provider ?? user?.user_metadata?.provider ?? null;
  return {
    ...(role != null ? { user_role: String(role) } : {}),
    ...(provider != null ? { user_provider: String(provider) } : {}),
    ...(user.created_at ? { user_created_at: String(user.created_at) } : {}),
    ...(user.last_sign_in_at ? { user_last_sign_in_at: String(user.last_sign_in_at) } : {}),
  };
}

export async function refreshAuthIfNeeded(auth, storageKey) {
  if (!auth?.refresh_token || !auth?.supabase_url || !auth?.supabase_anon_key) {
    return auth;
  }
  if (!isJwtExpired(auth)) return auth;

  const url = `${auth.supabase_url.replace(/\/$/, "")}/auth/v1/token?grant_type=refresh_token`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: auth.supabase_anon_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: auth.refresh_token }),
    });
    if (!res.ok) {
      console.warn("[E0001] refresh session", res.status, await res.text());
      return auth;
    }
    const data = await res.json();
    const now = Math.floor(Date.now() / 1000);
    const updated = {
      ...auth,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? auth.refresh_token,
      expires_at: data.expires_at ?? now + (data.expires_in ?? 3600),
      ...userProfileFieldsFromAuthUser(data.user),
    };
    if (storageKey) {
      await chrome.storage.local.set({ [storageKey]: updated });
    }
    return updated;
  } catch (err) {
    console.warn("[E0001] refresh session", err);
    return auth;
  }
}

export function isHtmlErrorBody(text) {
  const s = String(text ?? "").trim();
  if (!s) return false;
  return (
    /^<!doctype html/i.test(s) ||
    /^<html[\s>]/i.test(s) ||
    /cloudflare\.com\/5xx-error-landing/i.test(s) ||
    /cf-error-details|cf-browser-status|cf-wrapper/i.test(s)
  );
}

export function formatGatewayAuthError(status) {
  const code = GATEWAY_AUTH_STATUSES.has(Number(status)) ? Number(status) : 504;
  return `Sign-in service is offline (HTTP ${code}). Wait a moment and try again.`;
}

function gatewayStatusFromText(text) {
  const s = String(text ?? "");
  const fromCf = s.match(/errorcode_(\d{3})/i)?.[1];
  if (fromCf && GATEWAY_AUTH_STATUSES.has(Number(fromCf))) return Number(fromCf);
  const fromHttp = s.match(/\b(502|503|504|530)\b/)?.[1];
  return fromHttp ? Number(fromHttp) : 0;
}

/** MV3 port-closed / SW-restart — Hub may already have persisted the session. */
export function isAuthTransportError(raw) {
  return AUTH_TRANSPORT_ERROR.test(String(raw?.message ?? raw ?? ""));
}

/** HubAuthGateModal parity — never paint `{}` / `[object Object]`. */
export function formatAuthGateError(raw, intent = "signin") {
  const text = String(raw?.message ?? raw ?? "").trim();
  if (!text || EMPTY_AUTH_ERROR.test(text) || /^\d+$/.test(text)) {
    return intent === "signup" ? HUB_SIGNUP_FAILED_MESSAGE : HUB_SIGNIN_FAILED_MESSAGE;
  }
  const lower = text.toLowerCase();
  if (/already registered|already been registered|user already exists|email_exists|user_already_exists/.test(lower)) {
    return HUB_SIGNUP_ALREADY_REGISTERED_MESSAGE;
  }
  if (lower.includes("invalid login credentials")) {
    return "Incorrect username/email/phone or password. Use the same credentials as Tool Hub (P0004).";
  }
  if (text === "Failed to fetch" || lower.includes("networkerror") || lower.includes("load failed")) {
    return "Cannot reach Tool Hub or workspace data API (Home Server). Cloudflare tunnel or hub-api may be down — retry in a moment.";
  }
  if (
    isHtmlErrorBody(text) ||
    /cloudflare\.com\/5xx-error-landing|cf-browser-status|gateway timeout|errorcode_50[234]|errorcode_530/i.test(text)
  ) {
    return formatGatewayAuthError(gatewayStatusFromText(text) || 504);
  }
  if (isAuthTransportError(text)) {
    return "Sign-in was interrupted. Retry only if the header does not show your user.";
  }
  if (text.length > 180) {
    return intent === "signup" ? HUB_SIGNUP_FAILED_MESSAGE : HUB_SIGNIN_FAILED_MESSAGE;
  }
  return text;
}

/** Hub forgot-password — same contract as `createHubForgotPasswordHandler`. */
export async function requestHubPasswordReset(loginInput) {
  const login = sanitizeHubLoginInput(loginInput);
  const resolved = resolveHubLogin(login);
  if (!resolved.isEmailLogin || isHubTechnicalAuthEmail(resolved.authEmail)) {
    return "Link email on Tool Hub (Account), or ask an admin to reset your password.";
  }
  const url = `${E0001_IDENTITY_SUPABASE_URL.replace(/\/$/, "")}/auth/v1/recover`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      apikey: E0001_IDENTITY_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: resolved.authEmail,
      gotrue_meta_security: {},
      redirect_to: HUB_PASSWORD_RESET_REDIRECT,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    return formatAuthGateError(parseApiErrorBody(text) || `Password reset failed (${res.status})`);
  }
  return "Check your inbox for a Hub password reset link.";
}

export function formatSyncError(err) {
  const s = String(err?.message ?? err);
  if (/JWT expired|PGRST303|"expired"/i.test(s)) {
    return "Session expired — open Cookie sync in Tool and click Link extension again.";
  }
  if (/invalid pass/i.test(s)) {
    return "Wrong sync pass — set the same pass on the note (Notes) and in the binding.";
  }
  if (/note not found/i.test(s)) {
    return "Note not found — check Note UUID in binding.";
  }
  if (/PGRST202|does not exist|42883/i.test(s)) {
    return "Run APPLY_COOKIE_SYNC.sql on Supabase, then Link extension again.";
  }
  if (s.length > 160) return `${s.slice(0, 160)}…`;
  return s;
}

export function parseApiErrorBody(text) {
  const raw = String(text ?? "");
  if (isHtmlErrorBody(raw)) return "";
  try {
    const j = JSON.parse(raw);
    return j.message || j.error_description || j.msg || (typeof j.error === "string" ? j.error : "") || "";
  } catch {
    return raw.length > 180 ? "" : raw;
  }
}

/**
 * JWT payload JSON — UTF-8 safe.
 * Bare `atob` + `JSON.parse` mojibakes Vietnamese `user_metadata.full_name` (Trần → Tráº§n).
 */
export function parseJwtPayload(accessToken) {
  try {
    const part = String(accessToken ?? "").split(".")[1];
    if (!part) return null;
    const pad = part.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (part.length % 4)) % 4);
    const binary = atob(pad);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const parsed = JSON.parse(new TextDecoder("utf-8").decode(bytes));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function userIdFromJwt(accessToken) {
  return parseJwtPayload(accessToken)?.sub || null;
}

function emailFromJwt(accessToken) {
  return parseJwtPayload(accessToken)?.email || null;
}

function sessionFromGrantedPayload(data, config, fallbackEmail) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = data.access_token;
  const user = data.user ?? null;
  return {
    access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ?? now + (data.expires_in ?? 3600),
    supabase_url: String(config.supabase_url ?? "").replace(/\/$/, ""),
    supabase_anon_key: config.supabase_anon_key,
    user_id: user?.id ?? userIdFromJwt(access_token),
    user_email: user?.email ?? emailFromJwt(access_token) ?? fallbackEmail,
    ...userProfileFieldsFromAuthUser(user),
  };
}

function isGatewayUnavailableError(message) {
  const text = String(message ?? "");
  return (
    GATEWAY_AUTH_STATUSES.has(gatewayStatusFromText(text)) ||
    /sign-in service is offline|failed to fetch|timed out|aborted/i.test(text)
  );
}

/** Fallback only — P0005/P0020 grant hub-api first; Worker is the slow/530 path. */
async function signInViaHubGateway(loginInput, password, config) {
  try {
    const res = await fetchWithTimeout(
      HUB_AUTH_GATEWAY_SIGN_IN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginInput, password }),
      },
      10_000,
    );
    const text = await res.text();
    if (isHtmlErrorBody(text) || GATEWAY_AUTH_STATUSES.has(res.status)) {
      return { session: null, error: formatGatewayAuthError(res.status) };
    }
    let payload = null;
    try {
      payload = JSON.parse(text);
    } catch {
      return { session: null, error: parseApiErrorBody(text) || `Sign-in failed (${res.status})` };
    }
    if (!res.ok || !payload?.ok || !payload?.session?.access_token) {
      return {
        session: null,
        error: payload?.error || parseApiErrorBody(text) || `Sign-in failed (${res.status})`,
      };
    }
    return {
      session: sessionFromGrantedPayload(
        payload.session,
        config,
        payload.authEmail || loginInput,
      ),
      error: null,
    };
  } catch (err) {
    return { session: null, error: err?.message ?? String(err) };
  }
}

/** Email/password sign-up for extension popup. */
export async function signUpWithPassword(email, password, config, resolved = null) {
  const supabase_url = String(config?.supabase_url ?? config?.url ?? "").replace(/\/$/, "");
  const supabase_anon_key = config?.supabase_anon_key ?? config?.anonKey ?? "";
  if (!supabase_url || !supabase_anon_key) {
    throw new Error("Supabase is not configured.");
  }
  const url = `${supabase_url}/auth/v1/signup`;
  const body = { email: String(email).trim(), password };
  if (resolved?.loginId) {
    body.data = {
      full_name: resolved.loginId,
      login_id: resolved.loginId,
    };
  }
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      apikey: supabase_anon_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseApiErrorBody(text) || `Sign-up failed (${res.status})`);
  }
  const data = JSON.parse(text);
  if (data.access_token) {
    const now = Math.floor(Date.now() / 1000);
    const access_token = data.access_token;
    return {
      access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at ?? now + (data.expires_in ?? 3600),
      supabase_url,
      supabase_anon_key,
      user_id: data.user?.id ?? userIdFromJwt(access_token),
      user_email: data.user?.email ?? emailFromJwt(access_token) ?? String(email).trim(),
      ...userProfileFieldsFromAuthUser(data.user),
    };
  }
  return null;
}

async function trySignInWithPassword(authEmail, password, config) {
  try {
    const session = await signInWithPassword(authEmail, password, config);
    return { session, error: null };
  } catch (err) {
    return { session: null, error: err?.message ?? String(err) };
  }
}

function dataMirrorEmail(_login, extraAuthEmails = []) {
  return extraAuthEmails.find(Boolean) || "";
}

async function mirrorDataBoxSignUp(login, password, dataConfig, resolved, extraAuthEmails) {
  const primaryEmail = dataMirrorEmail(login, extraAuthEmails);
  if (!primaryEmail) {
    return { session: null, error: "Username sign-in requires resolve-login." };
  }
  try {
    const mirrored = await signUpWithPassword(
      primaryEmail,
      password,
      dataConfig,
      resolved,
    );
    if (mirrored) return { session: mirrored, error: null };
    return { session: null, error: "Data Box mirror sign-up returned no session." };
  } catch (err) {
    return { session: null, error: err?.message ?? String(err) };
  }
}

async function authenticateDataBoxSession(loginInput, password, mode, dataConfig, resolved, options = {}) {
  const login = sanitizeHubLoginInput(loginInput);
  const { extraAuthEmails = [], resolveLookup = "skipped" } = options;

  if (mode === "signup") {
    const primaryEmail = dataMirrorEmail(login, extraAuthEmails);
    if (!primaryEmail) {
      return { session: null, error: "Username sign-in requires resolve-login." };
    }
    const signedUp = await signUpWithPassword(primaryEmail, password, dataConfig, resolved);
    if (signedUp) return { session: signedUp, error: null };
    return trySignInWithPassword(primaryEmail, password, dataConfig);
  }

  const attempt = async (authEmail) => {
    const result = await trySignInWithPassword(authEmail, password, dataConfig);
    return {
      data: { session: result.session },
      error: result.error ? new Error(result.error) : null,
    };
  };

  const signIn = await signInWithHubPassword(login, attempt, "signin", {
    extraAuthEmails,
    resolveLookup,
  });
  if (!signIn.error && signIn.data?.session) {
    return { session: signIn.data.session, error: null };
  }

  const lastError = signIn.error?.message ?? null;
  return {
    session: null,
    error: lastError ?? "Data Box sign-in failed.",
    needsMirrorSignUp: Boolean(lastError && INVALID_LOGIN.test(lastError)),
  };
}

/**
 * CWS 1.2.4 sign-in: resolve-login once, then Hub + Data Box in parallel.
 * Sequential dual-plane + Hub roster before sendResponse is what made 1.1.29 feel stuck.
 */
export async function signInWorkspaceDual(loginInput, password, mode = "signin") {
  const t0 = Date.now();
  const login = sanitizeHubLoginInput(loginInput);
  const resolved = resolveHubLogin(login);

  const identityConfig = {
    supabase_url: E0001_IDENTITY_SUPABASE_URL,
    supabase_anon_key: E0001_IDENTITY_SUPABASE_ANON_KEY,
  };
  const dataConfig = {
    supabase_url: E0001_DATA_SUPABASE_URL,
    supabase_anon_key: E0001_DATA_SUPABASE_ANON_KEY,
  };

  const identityAttempt = async (authEmail) => {
    if (mode === "signup") {
      const signedUp = await signUpWithPassword(authEmail, password, identityConfig, resolved);
      if (signedUp) return { data: { session: signedUp }, error: null };
      const fallback = await trySignInWithPassword(authEmail, password, identityConfig);
      return {
        data: { session: fallback.session },
        error: fallback.error ? new Error(fallback.error) : null,
      };
    }
    const result = await trySignInWithPassword(authEmail, password, identityConfig);
    return {
      data: { session: result.session },
      error: result.error ? new Error(result.error) : null,
    };
  };

  let extraAuthEmails = [];
  let resolveLookup = "skipped";
  if (mode === "signin") {
    const lookup = await resolveHubLoginEmails(login);
    extraAuthEmails = lookup.emails;
    resolveLookup = lookup.lookup;
  }
  const resolveMs = Date.now() - t0;

  const tIdentityStart = Date.now();
  const tDataStart = Date.now();
  let identityResult;
  let dataSession = null;
  let dataError = null;
  let dataPending = null;
  let identityMs = 0;
  let dataMs = 0;
  let needsMirrorSignUp = false;

  if (mode === "signin") {
    const planeOptions = { extraAuthEmails, resolveLookup };
    const identityPromise = signInWithHubPassword(login, identityAttempt, mode, planeOptions).then(
      (r) => {
        identityMs = Date.now() - tIdentityStart;
        return r;
      },
    );
    const dataPromise = authenticateDataBoxSession(
      login,
      password,
      mode,
      dataConfig,
      resolved,
      planeOptions,
    ).then((r) => {
      dataMs = Date.now() - tDataStart;
      return r;
    });
    identityResult = await identityPromise;
    dataPending = dataPromise.then(async (dataRes) => {
      let session = dataRes.session;
      let error = dataRes.error;
      if (dataRes.needsMirrorSignUp && !session) {
        const mirrored = await mirrorDataBoxSignUp(login, password, dataConfig, resolved, extraAuthEmails);
        session = mirrored.session;
        error = mirrored.session ? null : (mirrored.error ?? error);
      }
      return { session, error, dataMs: Date.now() - tDataStart };
    });
  } else {
    identityResult = await signInWithHubPassword(login, identityAttempt, mode);
    identityMs = Date.now() - tIdentityStart;
    const dataRes = await authenticateDataBoxSession(login, password, mode, dataConfig, resolved);
    dataMs = Date.now() - tDataStart;
    dataSession = dataRes.session;
    dataError = dataRes.error;
  }

  if (identityResult.error) throw identityResult.error;
  const identity = identityResult.data?.session;
  if (!identity) {
    throw new Error(
      mode === "signup" ? "Check your email to confirm sign-up on Tool Hub." : "No Hub session returned.",
    );
  }

  if (needsMirrorSignUp && !dataSession) {
    const mirrored = await mirrorDataBoxSignUp(login, password, dataConfig, resolved, extraAuthEmails);
    dataMs = Date.now() - tDataStart;
    dataSession = mirrored.session;
    dataError = mirrored.session ? null : (mirrored.error ?? dataError);
  }

  return {
    identity,
    data: dataSession,
    dataError,
    dataPending,
    resolved,
    timing: {
      totalMs: Date.now() - t0,
      resolveMs,
      identityMs,
      dataMs,
      resolveLookup,
      parallel: mode === "signin",
      hubFirst: true,
    },
  };
}

/** Email/password sign-in for extension popup (no Tool tab required). */
export async function signInWithPassword(email, password, config) {
  const supabase_url = String(config?.supabase_url ?? config?.url ?? "").replace(/\/$/, "");
  const supabase_anon_key = config?.supabase_anon_key ?? config?.anonKey ?? "";
  if (!supabase_url || !supabase_anon_key) {
    throw new Error("Supabase is not configured.");
  }
  const plane = { supabase_url, supabase_anon_key };
  const emailTrim = String(email).trim();
  const url = `${supabase_url}/auth/v1/token?grant_type=password`;
  try {
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        apikey: supabase_anon_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: emailTrim, password }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(parseApiErrorBody(text) || `Sign-in failed (${res.status})`);
    }
    const data = JSON.parse(text);
    if (!data?.access_token) throw new Error("No Hub session returned.");
    return sessionFromGrantedPayload(data, plane, emailTrim);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      !/hub-api\.infi\.io\.vn/i.test(supabase_url) ||
      INVALID_LOGIN.test(msg) ||
      !isGatewayUnavailableError(msg)
    ) {
      throw err instanceof Error ? err : new Error(msg);
    }
    const viaGateway = await signInViaHubGateway(emailTrim, password, plane);
    if (viaGateway.session) return viaGateway.session;
    throw new Error(viaGateway.error || msg);
  }
}
