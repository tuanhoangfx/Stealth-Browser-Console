import { parseApiErrorBody, rpcHeaders, userHeaders } from "./auth-session.js";
import { canUseVault, decryptVault, decryptVaultPayload, encryptVault, vaultPassphrase } from "./vault-crypto.js";
import { extraSetHostsForCookieHost, isFacebookDomain, isGoogleDomain, summarizeGoogleCookieNames } from "./domain-routes.js";

const STORAGE_BROWSER_ID = "e0001-browser-id-v1";
const STORAGE_VAULT_WATERMARKS = "e0001-vault-watermarks-v1";
const STORAGE_BINDING_STATUS = "e0001-binding-status-v1";

/** Canonical `.host` for route keys (matches P0020 / cookie_bridge_routes). */
export function normalizeRouteDomain(domain = "") {
  const raw = String(domain).trim();
  if (!raw) return "";
  let host = raw.replace(/^\.+/, "").toLowerCase();
  if (/^https?:\/\//i.test(host)) {
    try {
      host = new URL(host).hostname.replace(/^\.+/, "").toLowerCase();
    } catch {
      return "";
    }
  } else {
    host = host.split("/")[0] ?? host;
  }
  host = host.replace(/^www\./, "");
  return host && host.includes(".") ? `.${host}` : "";
}

/** Per-route sync status key — noteId + domain (not noteId alone). */
export function bindingRouteKey(binding) {
  const noteId = binding?.noteId?.trim() || "";
  const syncId = binding?.syncId?.trim() || "";
  const domain = normalizeRouteDomain(binding?.domain);
  if (noteId && domain) return `${noteId}:${domain}`;
  return noteId || syncId || "";
}

function bindingStatusKey(binding) {
  return bindingRouteKey(binding);
}

function maxIso(values) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

function isMissingRpc(text, status) {
  return /Could not find|schema cache|PGRST202|404/i.test(text) || status === 404;
}

async function getLocal(primaryKey, fallback = null) {
  const stored = await chrome.storage.local.get(primaryKey);
  if (stored[primaryKey] != null) return stored[primaryKey];
  return fallback;
}

export async function getBrowserId() {
  const id = await getLocal(STORAGE_BROWSER_ID, null);
  if (id) return id;
  const next = crypto.randomUUID();
  await chrome.storage.local.set({ [STORAGE_BROWSER_ID]: next });
  return next;
}

async function getWatermarks() {
  const w = await getLocal(STORAGE_VAULT_WATERMARKS, {});
  return w && typeof w === "object" ? w : {};
}

async function setWatermark(noteId, domain, updatedAt) {
  const w = await getWatermarks();
  w[`${noteId}:${domain}`] = updatedAt;
  await chrome.storage.local.set({ [STORAGE_VAULT_WATERMARKS]: w });
}

export async function clearVaultWatermark(noteId, domain) {
  const w = await getWatermarks();
  delete w[watermarkKey(noteId, domain)];
  await chrome.storage.local.set({ [STORAGE_VAULT_WATERMARKS]: w });
}

function watermarkKey(noteId, domain) {
  return `${noteId}:${domain}`;
}

export async function rpcVaultUpsert(auth, binding, encrypted, browserId, updatedBy = null, metadata = {}) {
  const body = {
    p_note_id: binding.noteId,
    p_domain: binding.domain,
    p_pass: vaultPassphrase(binding) || null,
    p_ciphertext: encrypted.ciphertext,
    p_iv: encrypted.iv,
    p_cookie_count: encrypted.cookieCount,
    p_source_browser: browserId,
    p_updated_by: updatedBy,
  };
  const versionedBody = {
    ...body,
    p_has_facebook_login: metadata.hasFacebookLogin === true,
    p_key_names: Array.isArray(metadata.keyNames) ? metadata.keyNames : [],
  };
  const permissionUrl = `${auth.supabase_url}/rest/v1/rpc/note_vault_upsert_v3`;
  const permissionRes = await fetch(permissionUrl, {
    method: "POST",
    headers: userHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(versionedBody),
  });
  if (permissionRes.ok) {
    const data = await permissionRes.json();
    if (data?.ok === false) return data;
    await setWatermark(binding.noteId, binding.domain, data.updated_at ?? new Date().toISOString());
    return data;
  }
  const permissionText = await permissionRes.text();
  if (!isMissingRpc(permissionText, permissionRes.status)) {
    throw new Error(`vault upsert v3 ${permissionRes.status}: ${parseApiErrorBody(permissionText)}`);
  }

  const versionedUrl = `${auth.supabase_url}/rest/v1/rpc/note_vault_upsert_v2`;
  const versionedRes = await fetch(versionedUrl, {
    method: "POST",
    headers: rpcHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(versionedBody),
  });
  if (versionedRes.ok) {
    const data = await versionedRes.json();
    if (data?.ok === false) return data;
    await setWatermark(binding.noteId, binding.domain, data.updated_at ?? new Date().toISOString());
    return data;
  }
  const versionedText = await versionedRes.text();
  if (!isMissingRpc(versionedText, versionedRes.status)) {
    throw new Error(`vault upsert v2 ${versionedRes.status}: ${parseApiErrorBody(versionedText)}`);
  }

  const url = `${auth.supabase_url}/rest/v1/rpc/note_vault_upsert`;
  const res = await fetch(url, {
    method: "POST",
    headers: rpcHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`vault upsert ${res.status}: ${parseApiErrorBody(text)}`);
  }
  const data = await res.json();
  await setWatermark(binding.noteId, binding.domain, data.updated_at ?? new Date().toISOString());
  return data;
}

export async function rpcVaultFetch(auth, binding) {
  const body = {
    p_note_id: binding.noteId,
    p_domain: binding.domain,
    p_pass: vaultPassphrase(binding) || null,
  };
  const permissionUrl = `${auth.supabase_url}/rest/v1/rpc/note_vault_fetch_v3`;
  const permissionRes = await fetch(permissionUrl, {
    method: "POST",
    headers: userHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (permissionRes.ok) return permissionRes.json();
  const permissionText = await permissionRes.text();
  if (!isMissingRpc(permissionText, permissionRes.status)) {
    throw new Error(`vault fetch v3 ${permissionRes.status}: ${parseApiErrorBody(permissionText)}`);
  }

  const versionedUrl = `${auth.supabase_url}/rest/v1/rpc/note_vault_fetch_v2`;
  const versionedRes = await fetch(versionedUrl, {
    method: "POST",
    headers: rpcHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (versionedRes.ok) return versionedRes.json();
  const versionedText = await versionedRes.text();
  if (!isMissingRpc(versionedText, versionedRes.status)) {
    throw new Error(`vault fetch v2 ${versionedRes.status}: ${parseApiErrorBody(versionedText)}`);
  }

  const url = `${auth.supabase_url}/rest/v1/rpc/note_vault_fetch`;
  const res = await fetch(url, {
    method: "POST",
    headers: rpcHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`vault fetch ${res.status}: ${parseApiErrorBody(text)}`);
  }
  return res.json();
}

/** Check server vault row (for popup Vault OK badge). */
export async function probeVaultOnServer(auth, binding) {
  if (!auth?.supabase_url || !binding?.noteId?.trim()) {
    return { hasVault: false };
  }
  try {
    const row = await rpcVaultFetch(auth, binding);
    if (row?.ok) {
      return {
        hasVault: true,
        cookieCount: row.cookie_count ?? 0,
        updatedAt: row.updated_at ?? null,
        updatedBy: row.updated_by ?? null,
        sourceBrowser: row.source_browser ?? null,
      };
    }
    return { hasVault: false, reason: row?.reason ?? "not_found" };
  } catch (err) {
    return { hasVault: false, probeError: String(err) };
  }
}

/** Align with chrome.cookies / [Cookie-Editor](https://github.com/moustachauve/cookie-editor) export. */
function normalizeSameSite(raw) {
  if (raw == null || raw === "") return "unspecified";
  const v = String(raw).toLowerCase();
  if (v === "none" || v === "no_restriction") return "no_restriction";
  if (v === "strict") return "strict";
  if (v === "lax") return "lax";
  return "unspecified";
}

/** Map Cookie-Editor JSON export → chrome.cookies.set payload. */
export function normalizeCookieEditorCookies(rawList) {
  if (!Array.isArray(rawList)) return [];
  return rawList
    .filter((c) => c?.name)
    .map((c) => {
      const row = {
        name: String(c.name),
        value: String(c.value ?? ""),
        domain: c.domain,
        path: c.path ?? "/",
        secure: Boolean(c.secure),
        httpOnly: Boolean(c.httpOnly),
        sameSite: normalizeSameSite(c.sameSite),
        hostOnly: Boolean(c.hostOnly),
      };
      if (!c.session && c.expirationDate) row.expirationDate = c.expirationDate;
      if (c.partitionKey && typeof c.partitionKey === "object") row.partitionKey = c.partitionKey;
      return row;
    });
}

/**
 * One apply pipeline for paste AND Load — Cookie-Editor round-trip fixes sameSite/hostOnly.
 */
export function prepareCookiesForApply(cookies) {
  if (!Array.isArray(cookies) || !cookies.length) return [];
  const looksEditor =
    cookies[0] &&
    ("storeId" in cookies[0] || Object.prototype.hasOwnProperty.call(cookies[0], "session"));
  if (looksEditor) return normalizeCookieEditorCookies(cookies);
  return normalizeCookieEditorCookies(toCookieEditorFormat(cookies));
}

export async function applyCookieEditorJson(jsonText) {
  const parsed = JSON.parse(jsonText);
  const list = Array.isArray(parsed) ? parsed : parsed?.cookies;
  const cookies = prepareCookiesForApply(list);
  if (!cookies.length) throw new Error("No cookies in JSON");
  return applyCookiesToBrowser(cookies);
}

/** Cookie-Editor compatible export (https://github.com/moustachauve/cookie-editor) */
export function toCookieEditorFormat(cookies) {
  return cookies.map((c) => ({
    domain: c.domain,
    expirationDate: c.expirationDate ?? undefined,
    hostOnly: Boolean(c.hostOnly),
    httpOnly: Boolean(c.httpOnly),
    name: c.name,
    path: c.path ?? "/",
    sameSite: normalizeSameSite(c.sameSite),
    secure: Boolean(c.secure),
    session: !c.expirationDate,
    storeId: null,
    value: c.value ?? "",
  }));
}

export function formatCookiesJson(cookies) {
  return JSON.stringify(toCookieEditorFormat(cookies), null, 2);
}

const FACEBOOK_LOGIN_COOKIE_NAMES = ["c_user", "xs", "fr", "datr", "sb", "wd", "presence"];
const COOKIE_SET_TIMEOUT_MS = 2500;

function withTimeout(promise, ms, message) {
  let timer = null;
  const guarded = Promise.resolve(promise);
  guarded.catch(() => null);
  return Promise.race([
    guarded.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

export function summarizeCookieNames(cookies) {
  const names = (Array.isArray(cookies) ? cookies : [])
    .map((c) => String(c?.name ?? "").trim())
    .filter(Boolean);
  const uniqueNames = [...new Set(names)].sort();
  const nameSet = new Set(uniqueNames);
  const keyNames = FACEBOOK_LOGIN_COOKIE_NAMES.filter((name) => nameSet.has(name));
  return {
    count: uniqueNames.length,
    keyNames,
    hasFacebookLogin: nameSet.has("c_user") && nameSet.has("xs"),
    missingFacebookLogin: ["c_user", "xs"].filter((name) => !nameSet.has(name)),
    names: uniqueNames.slice(0, 40),
  };
}

function urlsForSet(c) {
  const host = (c.domain ?? "").replace(/^\./, "").toLowerCase() || "localhost";
  const path = c.path?.startsWith("/") ? c.path : `/${c.path ?? "/"}`;
  const secure = Boolean(c.secure) || String(c.name).startsWith("__Secure-") || String(c.name).startsWith("__Host-");
  const scheme = secure || isFacebookDomain(host) || isGoogleDomain(host) ? "https" : "http";
  const urls = new Set();
  const hosts = new Set([host]);
  if (!host.startsWith("www.")) hosts.add(`www.${host}`);
  for (const extraHost of extraSetHostsForCookieHost(host)) {
    hosts.add(extraHost);
  }
  for (const h of hosts) {
    urls.add(`${scheme}://${h}${path}`);
  }
  return [...urls];
}

function buildSetDetails(c, url) {
  const name = c.name;
  const secure = Boolean(c.secure) || name.startsWith("__Secure-") || name.startsWith("__Host-");
  const path = name.startsWith("__Host-") ? "/" : (c.path ?? "/");
  const details = {
    url,
    name,
    value: c.value ?? "",
    path,
    secure,
    httpOnly: Boolean(c.httpOnly),
    sameSite: normalizeSameSite(c.sameSite),
  };
  if (c.expirationDate) details.expirationDate = c.expirationDate;
  if (!name.startsWith("__Host-") && c.domain && !c.hostOnly) {
    details.domain = c.domain;
  }
  if (c.partitionKey && typeof c.partitionKey === "object") {
    details.partitionKey = c.partitionKey;
  }
  return details;
}

function setDetailsVariants(details) {
  const variants = [];
  const seen = new Set();
  const add = (patch = {}) => {
    const next = { ...details };
    if (patch.dropDomain) delete next.domain;
    if (patch.dropPartitionKey) delete next.partitionKey;
    if (patch.dropSameSite) delete next.sameSite;
    if (patch.dropExpiration) delete next.expirationDate;
    if (patch.forceSecure) next.secure = true;
    const key = JSON.stringify(next);
    if (!seen.has(key)) {
      seen.add(key);
      variants.push(next);
    }
  };

  add();
  add({ dropPartitionKey: true });
  add({ dropDomain: true });
  add({ dropDomain: true, dropPartitionKey: true });
  add({ dropSameSite: true, dropPartitionKey: true });
  add({ dropDomain: true, dropSameSite: true, dropPartitionKey: true });
  add({ dropDomain: true, dropSameSite: true, dropPartitionKey: true, forceSecure: true });
  add({ dropDomain: true, dropSameSite: true, dropPartitionKey: true, dropExpiration: true });
  add({ dropDomain: true, dropSameSite: true, dropPartitionKey: true, dropExpiration: true, forceSecure: true });

  return variants;
}

async function trySetOneCookie(c) {
  if (!c?.name) return { ok: false, errors: ["missing name"] };
  const urls = urlsForSet(c);
  const errors = [];
  for (const url of urls) {
    for (const details of setDetailsVariants(buildSetDetails(c, url))) {
      try {
        const saved = await withTimeout(
          chrome.cookies.set(details),
          COOKIE_SET_TIMEOUT_MS,
          `cookie set timeout: ${c.name}`,
        );
        if (saved) return { ok: true, errors };
      } catch (err) {
        const message = err?.message ?? String(err);
        errors.push(`${url}: ${message}`);
        console.warn("[E0001] cookie set", c.name, url, err);
      }
    }
  }
  return { ok: false, errors };
}

export async function applyCookiesToBrowser(cookies, opts = {}) {
  const rounds = Math.max(1, Number(opts.rounds) || 1);
  const retryDelayMs = Math.max(0, Number(opts.retryDelayMs) || 0);
  const appliedNames = [];
  const failedErrorMap = new Map();
  let pending = (Array.isArray(cookies) ? cookies : []).filter((c) => c?.name);

  for (let round = 0; round < rounds && pending.length; round += 1) {
    const nextPending = [];
    const nextErrors = new Map();
    for (const c of pending) {
      const result = await trySetOneCookie(c);
      if (result.ok) appliedNames.push(c.name);
      else {
        nextPending.push(c);
        nextErrors.set(c.name, result.errors ?? []);
      }
    }
    pending = nextPending;
    if (nextErrors.size) {
      for (const [name, errors] of nextErrors) {
        failedErrorMap.set(name, errors);
      }
    }
    if (pending.length && retryDelayMs > 0 && round < rounds - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  const failedNames = pending.map((c) => c.name);
  const failedDetails = failedNames.map((name) => ({
    name,
    errors: failedErrorMap.get(name)?.slice(-3) ?? [],
  }));
  return {
    applied: appliedNames.length,
    failed: failedNames.length,
    total: Array.isArray(cookies) ? cookies.length : 0,
    appliedNames,
    failedNames,
    failedDetails,
  };
}

/** Decrypt vault row → Cookie-Editor JSON string */
export async function exportVaultCookiesJson(auth, binding) {
  const row = await rpcVaultFetch(auth, binding);
  if (!row.ok) throw new Error("Chưa có vault — Sync now trên browser đã login.");
  const cookies = await decryptVault(
    vaultPassphrase(binding),
    binding.noteId,
    binding.domain,
    row.ciphertext,
    row.iv,
  );
  return { json: formatCookiesJson(cookies), count: cookies.length };
}

/** Decrypted vault size on server (probe / diagnostics). */
export async function fetchExistingVaultCount(auth, binding) {
  if (!canUseVault(binding)) return { exists: false, count: 0 };
  try {
    const row = await rpcVaultFetch(auth, binding);
    if (!row.ok) return { exists: false, count: 0 };
    const cookies = await decryptVault(
      vaultPassphrase(binding),
      binding.noteId,
      binding.domain,
      row.ciphertext,
      row.iv,
    );
    return {
      exists: true,
      count: cookies.length,
      rowCount: row.cookie_count ?? 0,
      updatedAt: row.updated_at ?? null,
    };
  } catch {
    return { exists: false, count: 0 };
  }
}

export async function fetchExistingVaultSummary(auth, binding, opts = {}) {
  if (!canUseVault(binding)) return { exists: false, count: 0 };
  try {
    const row = await rpcVaultFetch(auth, binding);
    if (!row.ok) return { exists: false, count: 0, reason: row.reason ?? "not_found" };
    const passphrase =
      Object.prototype.hasOwnProperty.call(opts, "passphrase") ? opts.passphrase : vaultPassphrase(binding);
    const payload = await decryptVaultPayload(
      passphrase,
      binding.noteId,
      binding.domain,
      row.ciphertext,
      row.iv,
    );
    const cookies = prepareCookiesForApply(payload.cookies ?? []);
    return {
      exists: true,
      count: cookies.length,
      rowCount: row.cookie_count ?? 0,
      updatedAt: row.updated_at ?? null,
      updatedBy: row.updated_by ?? row.source_browser ?? null,
      sourceBrowser: row.source_browser ?? null,
      vaultNames: summarizeCookieNames(cookies),
      vaultVersion: row.vault_version ?? row.updated_at ?? null,
      hasFacebookLogin: row.has_facebook_login ?? null,
    };
  } catch (err) {
    return { exists: false, count: 0, decryptError: String(err?.message || err?.name || err) };
  }
}

export async function uploadVaultForBinding(auth, binding, cookies, browserId, updatedBy = null, opts = {}) {
  if (!canUseVault(binding)) {
    return { skipped: true, reason: "no_note" };
  }
  const prepared = prepareCookiesForApply(cookies);
  const passphrase =
    Object.prototype.hasOwnProperty.call(opts, "passphrase") ? opts.passphrase : vaultPassphrase(binding);
  const vaultNames = summarizeCookieNames(prepared);
  const encrypted = await encryptVault(passphrase, binding.noteId, binding.domain, prepared);
  const data = await rpcVaultUpsert(auth, binding, encrypted, browserId, updatedBy, {
    hasFacebookLogin: vaultNames.hasFacebookLogin,
    keyNames: vaultNames.keyNames,
  });
  return { ok: true, ...data, storedCount: prepared.length, vaultNames };
}

export async function loadVaultIntoBrowser(auth, binding, opts = {}) {
  if (!canUseVault(binding)) {
    return { skipped: true, reason: "no_note" };
  }
  if (opts.clearWatermark) {
    await clearVaultWatermark(binding.noteId, binding.domain);
  }

  const row = await rpcVaultFetch(auth, binding);
  if (!row.ok) return { skipped: true, reason: row.reason ?? "not_found" };

  let decryptedRaw = [];
  const passphrase =
    Object.prototype.hasOwnProperty.call(opts, "passphrase") ? opts.passphrase : vaultPassphrase(binding);
  try {
    const payload = await decryptVaultPayload(
      passphrase,
      binding.noteId,
      binding.domain,
      row.ciphertext,
      row.iv,
    );
    decryptedRaw = payload.cookies;
  } catch (err) {
    const error = String(err?.message || err?.name || err || "Vault decrypt failed.");
    return {
      ok: false,
      reason: "decrypt_failed",
      error,
      serverCount: row.cookie_count ?? 0,
      updatedBy: row.updated_by ?? row.source_browser ?? null,
      sourceBrowser: row.source_browser ?? null,
    };
  }
  const cookies = prepareCookiesForApply(decryptedRaw);
  const vaultNames = summarizeCookieNames(cookies);
  const googleVaultNames = isGoogleDomain(binding.domain) ? summarizeGoogleCookieNames(cookies) : null;
  if (!cookies.length) {
    return { ok: false, reason: "empty_vault", decrypted: 0, serverCount: row.cookie_count ?? 0, vaultNames };
  }
  if (opts.requireFacebookLogin === true && vaultNames.hasFacebookLogin !== true) {
    await setWatermark(binding.noteId, binding.domain, row.updated_at ?? new Date().toISOString());
    return {
      ok: false,
      skipped: true,
      reason: "invalid_facebook_vault",
      decrypted: cookies.length,
      serverCount: row.cookie_count ?? 0,
      vaultNames,
      vaultVersion: row.vault_version ?? row.updated_at ?? null,
    };
  }

  const { applied, failed, total, failedNames, appliedNames, failedDetails } = await applyCookiesToBrowser(cookies, {
    rounds: opts.rounds ?? 1,
    retryDelayMs: opts.retryDelayMs ?? 0,
  });
  if (applied > 0) {
    await setWatermark(binding.noteId, binding.domain, row.updated_at);
  }

  const decrypted = cookies.length;
  const serverCount = row.cookie_count ?? 0;
  return {
    ok: applied > 0,
    applied,
    failed,
    total,
    decrypted,
    serverCount,
    appliedNames,
    failedNames,
    failedDetails,
    cookieCount: decrypted,
    vaultNames,
    googleVaultNames,
    vaultVersion: row.vault_version ?? row.updated_at ?? null,
    vaultStale: serverCount > 0 && applied < serverCount,
    partial: applied > 0 && applied < decrypted,
    updatedBy: row.updated_by ?? row.source_browser ?? null,
    sourceBrowser: row.source_browser ?? null,
    reason: applied > 0 ? undefined : "zero_applied",
  };
}

const NOTE_SYNCED_AT_CHUNK = 40;
const E0001_FETCH_TIMEOUT_MS = 8000;

async function fetchTextWithTimeout(url, options = {}, timeoutMs = E0001_FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    const text = await res.text();
    return { res, text };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error("AUTH_TIMEOUT:fetch");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Route-level sync times for all routes the signed-in user can access (owner + shared member). */
async function fetchNoteSyncedAtViaAccessibleRpc(auth) {
  if (!auth?.supabase_url || !auth?.access_token) return {};
  const url = `${auth.supabase_url.replace(/\/$/, "")}/rest/v1/rpc/note_cookie_synced_at_for_accessible`;
  let res;
  let text = "";
  try {
    const out = await fetchTextWithTimeout(url, {
      method: "POST",
      headers: userHeaders(auth, { "Content-Type": "application/json" }),
      body: "{}",
    });
    res = out.res;
    text = out.text;
  } catch (err) {
    console.warn("[E0001] synced_at accessible rpc timeout/fail", err?.message ?? String(err));
    return {};
  }
  if (!res.ok) {
    if (!/Could not find|PGRST202|schema cache/i.test(text)) {
      console.warn("[E0001] synced_at accessible rpc", res.status, parseApiErrorBody(text));
    }
    return {};
  }
  let rows = [];
  try {
    rows = text ? JSON.parse(text) : [];
  } catch {
    return {};
  }
  const map = {};
  for (const row of rows) {
    const id = row?.note_id?.trim();
    if (id) map[id] = row.synced_at ?? null;
  }
  return map;
}

/** Cloud `notes.synced_at` per note id — canonical manual sync time (matches P0020 Cookie Bridge). */
export async function fetchNoteSyncedAtMap(auth, bindings) {
  const viaRpc = await fetchNoteSyncedAtViaAccessibleRpc(auth);
  if (Object.keys(viaRpc).length > 0) return viaRpc;

  const ids = [
    ...new Set(
      (Array.isArray(bindings) ? bindings : [])
        .map((b) => b?.noteId?.trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length || !auth?.supabase_url) return {};

  const map = {};
  for (let i = 0; i < ids.length; i += NOTE_SYNCED_AT_CHUNK) {
    const slice = ids.slice(i, i + NOTE_SYNCED_AT_CHUNK);
    const query = `id=in.(${slice.join(",")})&select=id,synced_at`;
    const url = `${auth.supabase_url.replace(/\/$/, "")}/rest/v1/notes?${query}`;
    let res;
    let text = "";
    try {
      const out = await fetchTextWithTimeout(url, { headers: userHeaders(auth) });
      res = out.res;
      text = out.text;
    } catch (err) {
      console.warn("[E0001] notes synced_at fetch timeout/fail", err?.message ?? String(err));
      continue;
    }
    if (!res.ok) {
      console.warn("[E0001] notes synced_at fetch", res.status, parseApiErrorBody(text));
      continue;
    }
    let rows = [];
    try {
      rows = text ? JSON.parse(text) : [];
    } catch {
      continue;
    }
    for (const row of rows) {
      if (row?.id) map[row.id] = row.synced_at ?? null;
    }
  }
  return map;
}

/** Persist cloud sync times on per-route status (popup + realtime). */
export async function mergeNoteSyncedAtIntoBindingStatus(bindings, noteSyncedAtByNoteId) {
  if (!noteSyncedAtByNoteId || typeof noteSyncedAtByNoteId !== "object") return false;
  const list = Array.isArray(bindings) ? bindings : [];
  const stored = await chrome.storage.local.get(STORAGE_BINDING_STATUS);
  const status =
    stored[STORAGE_BINDING_STATUS] && typeof stored[STORAGE_BINDING_STATUS] === "object"
      ? { ...stored[STORAGE_BINDING_STATUS] }
      : {};
  let changed = false;
  for (const b of list) {
    const noteId = b?.noteId?.trim();
    if (!noteId) continue;
    const syncedAt = noteSyncedAtByNoteId[noteId];
    if (!syncedAt?.trim()) continue;
    const key = bindingStatusKey(b);
    if (!key) continue;
    const prev = status[key] ?? {};
    if (prev.cloudSyncedAt === syncedAt) continue;
    status[key] = { ...prev, cloudSyncedAt: syncedAt };
    changed = true;
  }
  if (!changed) return false;
  await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: status });
  return true;
}

/** Per-route activity for the signed-in user (People & access Sync/Load columns). */
export async function fetchRouteUserActivityByKey(auth, bindings, userId) {
  const uid = String(userId ?? "").trim();
  if (!uid || !auth?.supabase_url || !auth?.access_token) return {};
  const list = Array.isArray(bindings) ? bindings : [];
  const map = {};
  await Promise.all(
    list.map(async (b) => {
      const noteId = b?.noteId?.trim();
      const domain = normalizeRouteDomain(b?.domain);
      const key = bindingRouteKey(b);
      if (!noteId || !domain || !key) return;
      try {
        const url = `${auth.supabase_url.replace(/\/$/, "")}/rest/v1/rpc/cookie_route_activity_list`;
        const out = await fetchTextWithTimeout(url, {
          method: "POST",
          headers: userHeaders(auth, { "Content-Type": "application/json" }),
          body: JSON.stringify({ p_note_id: noteId, p_domain: domain }),
        });
        const res = out.res;
        const text = out.text;
        if (!res.ok) return;
        const data = text ? JSON.parse(text) : null;
        if (!data?.ok || !Array.isArray(data.activities)) return;
        const ownerId = String(b?.ownerUserId ?? "").trim();
        const row = data.activities.find((a) => a?.user_id === uid);
        const ownerRow = ownerId
          ? data.activities.find((a) => a?.user_id === ownerId)
          : null;
        if (!row && !ownerRow) return;
        map[key] = {
          lastSyncAt: row?.last_sync_at ?? null,
          lastLoadAt: row?.last_load_at ?? null,
          ownerSyncAt: ownerRow?.last_sync_at ?? null,
        };
      } catch (err) {
        console.warn("[E0001] route activity", noteId, err);
      }
    }),
  );
  return map;
}

/** Apply one note row from Supabase realtime. */
export async function mergeNoteSyncedAtForNote(noteId, syncedAt, bindings) {
  const id = String(noteId ?? "").trim();
  const at = String(syncedAt ?? "").trim();
  if (!id || !at) return false;
  return mergeNoteSyncedAtIntoBindingStatus(bindings, { [id]: at });
}

/** Merge cloud vault updated_at into local binding status (shared browsers see owner sync time). */
export async function mergeVaultUpdatedAtIntoBindingStatus(binding, updatedAt) {
  await mergeVaultRowIntoBindingStatus(binding, { updated_at: updatedAt });
}

/** Merge vault row metadata from Supabase realtime (sync time + cookie count). */
export async function mergeVaultRowIntoBindingStatus(binding, row) {
  if (!row) return false;
  const key = bindingStatusKey(binding);
  if (!key) return false;
  const stored = await chrome.storage.local.get(STORAGE_BINDING_STATUS);
  const status = stored[STORAGE_BINDING_STATUS] && typeof stored[STORAGE_BINDING_STATUS] === "object"
    ? stored[STORAGE_BINDING_STATUS]
    : {};
  const prev = status[key] ?? {};
  const next = { ...prev };
  let changed = false;
  // Manual-only: pushedAt is set only after explicit SYNC_NOW — do not copy vault.updated_at here.
  const updatedAt = row.updated_at ?? row.updatedAt;
  if (updatedAt && next.vaultUpdatedAt !== updatedAt) {
    next.vaultUpdatedAt = updatedAt;
    changed = true;
  }
  const vaultCount = row.cookie_count ?? row.cookieCount;
  if (typeof vaultCount === "number" && vaultCount >= 0 && next.vaultCookies !== vaultCount) {
    next.vaultCookies = vaultCount;
    changed = true;
  }
  if (!changed) return false;
  status[key] = next;
  await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: status });
  return true;
}

export async function tryApplyVaultFromRemote(auth, binding, prefs, browserId, opts = {}) {
  const force = opts.force === true;
  if (!force && !prefs.realtimeVaultApply) return { skipped: true, reason: "realtime_off" };
  if (!canUseVault(binding)) return { skipped: true, reason: "no_note" };
  if (force) await clearVaultWatermark(binding.noteId, binding.domain);

  const row = await rpcVaultFetch(auth, binding);
  if (!row.ok) return { skipped: true, reason: row.reason ?? "not_found" };

  await mergeVaultUpdatedAtIntoBindingStatus(binding, row.updated_at);

  const wm = await getWatermarks();
  const key = watermarkKey(binding.noteId, binding.domain);
  const prev = wm[key];
  if (!force && prev && row.updated_at && prev >= row.updated_at) {
    return { skipped: true, reason: "already_applied" };
  }

  return loadVaultIntoBrowser(auth, binding, {
    rounds: opts.rounds,
    retryDelayMs: opts.retryDelayMs,
    requireFacebookLogin: opts.requireFacebookLogin === true,
  });
}

export async function pollVaultsAndApply(auth, bindings, prefs, browserId) {
  if (!prefs.realtimeVaultApply) return;
  for (const b of bindings) {
    try {
      await tryApplyVaultFromRemote(auth, b, prefs, browserId, {
        requireFacebookLogin: String(b.domain || "").replace(/^\./, "").toLowerCase().endsWith("facebook.com"),
      });
    } catch (err) {
      console.error("[E0001] vault apply", b.noteId, err);
    }
  }
}
