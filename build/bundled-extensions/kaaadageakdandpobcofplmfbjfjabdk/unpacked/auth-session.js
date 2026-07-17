/** Supabase session refresh + header helpers for extension sync */

import {
  E0001_DATA_SUPABASE_ANON_KEY,
  E0001_DATA_SUPABASE_URL,
  E0001_IDENTITY_SUPABASE_ANON_KEY,
  E0001_IDENTITY_SUPABASE_URL,
} from "./supabase-config.js";
import {
  hubAuthEmailFromLogin,
  resolveHubLogin,
  sanitizeHubLoginInput,
} from "./vendor/hub-identity/hub-login.js";
import { signInWithHubPassword } from "./vendor/hub-identity/hub-auth-submit.js";

const INVALID_LOGIN = /invalid login credentials/i;
const AUTH_FETCH_TIMEOUT_MS = 12_000;

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
  try {
    const j = JSON.parse(text);
    return j.message || j.error_description || j.msg || text;
  } catch {
    return text;
  }
}

function userIdFromJwt(accessToken) {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.sub || null;
  } catch {
    return null;
  }
}

function emailFromJwt(accessToken) {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.email || null;
  } catch {
    return null;
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

async function authenticateDataBoxSession(loginInput, password, mode, dataConfig, resolved) {
  const login = sanitizeHubLoginInput(loginInput);
  const primaryEmail = hubAuthEmailFromLogin(login);

  if (mode === "signup") {
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

  const signIn = await signInWithHubPassword(login, attempt, "signin");
  if (!signIn.error && signIn.data?.session) {
    return { session: signIn.data.session, error: null };
  }

  const lastError = signIn.error?.message ?? null;
  if (lastError && INVALID_LOGIN.test(lastError)) {
    try {
      const mirrored = await signUpWithPassword(primaryEmail, password, dataConfig, resolved);
      if (mirrored) return { session: mirrored, error: null };
    } catch (err) {
      return { session: null, error: err?.message ?? String(err) };
    }
  }

  return { session: null, error: lastError ?? "Data Box sign-in failed." };
}

/**
 * Extension popup sign-in: Tool Hub identity, then Data Box (User ID → @infix1.io.vn + legacy fallback).
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

  const tIdentityStart = Date.now();
  const identityResult = await signInWithHubPassword(login, identityAttempt, mode);
  if (identityResult.error) throw identityResult.error;
  const identity = identityResult.data?.session;
  if (!identity) {
    throw new Error(
      mode === "signup" ? "Check your email to confirm sign-up on Tool Hub." : "No Hub session returned.",
    );
  }
  const identityMs = Date.now() - tIdentityStart;

  const tDataStart = Date.now();
  const { session: data, error: dataError } = await authenticateDataBoxSession(
    login,
    password,
    mode,
    dataConfig,
    resolved,
  );
  const dataMs = Date.now() - tDataStart;

  return {
    identity,
    data,
    dataError,
    resolved,
    timing: {
      totalMs: Date.now() - t0,
      identityMs,
      dataMs,
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
  const url = `${supabase_url}/auth/v1/token?grant_type=password`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      apikey: supabase_anon_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: String(email).trim(), password }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseApiErrorBody(text) || `Sign-in failed (${res.status})`);
  }
  const data = JSON.parse(text);
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
