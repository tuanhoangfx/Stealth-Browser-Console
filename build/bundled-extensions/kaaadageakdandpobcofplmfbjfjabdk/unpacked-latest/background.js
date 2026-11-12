import {
  formatSyncError,
  isJwtExpired,
  parseApiErrorBody,
  refreshAuthIfNeeded,
  signInWorkspaceDual,
  userHeaders,
} from "./auth-session.js";
import {
  applyCookieEditorJson,
  bindingRouteKey,
  exportVaultCookiesJson,
  formatCookiesJson,
  getBrowserId,
  loadVaultIntoBrowser,
  pollVaultsAndApply,
  fetchNoteSyncedAtMap,
  fetchRouteUserActivityByKey,
  mergeNoteSyncedAtIntoBindingStatus,
  probeVaultOnServer,
} from "./vault-api.js";
import { startVaultRealtime, stopVaultRealtime } from "./vault-realtime.js";
import { canUseVault } from "./vault-crypto.js";
import { probeCookieSchemaOk } from "./schema-probe.js";
import { resolveHubUserModalProfile } from "./hub-workspace-profile-role.js";
import {
  effectiveCookieDomain,
  extractHostnameFromUrlOrDomain,
  isFacebookDomain,
  isGoogleDomain,
  isGoogleOsidAppDomain,
  openSiteHintHost,
  resolveGoogleOsidApp,
  siteUrlForDomain,
  tabMatchesRoute,
} from "./domain-routes.js";
import {
  applySiteAuthStorageForDomain,
  captureSiteAuthStorageForDomain,
  extractAuthStorageIdentity,
  hasNonEmptyAuthStorage,
} from "./site-auth-storage.js";
import {
  clearSiteCookiesComplete as runClearSiteCookiesComplete,
  getCurrentSiteCookieInfo,
} from "./site-cookie-cleaner.js";
import {
  e0001TotpSecondsRemaining,
  generateE0001TotpCode,
  setE0001TotpClockOffsetMs,
  syncE0001TotpClock,
  totpClockOffsetMsValue,
  totpNowMs,
} from "./totp-clock.js";
import {
  GOOGLE_TAB_WAIT_MS,
  authUserId,
  clearCookiesForDomain,
  confirmGoogleInboxTab,
  ensureSiteTabForDomain,
  getCookiesForDomain,
  jwtEmailFromAuth,
  jwtPayload,
  patchNote,
  recordRouteActivityOnCloud,
  refreshTabsForDomain,
  sourceLockStateForBinding,
  syncSingleRouteWithVault,
  toSnapshotLines,
} from "./sync-engine-core.js";

const STORAGE_AUTH = "e0001-bridge-auth-v1";
const STORAGE_IDENTITY = "e0001-hub-identity-v1";
const STORAGE_BINDINGS = "e0001-sync-bindings-v1";
const STORAGE_PREFS = "e0001-bridge-prefs-v1";
const STORAGE_BINDING_STATUS = "e0001-binding-status-v1";
const STORAGE_SELECTED_BINDING = "e0001-selected-binding-v1";
const STORAGE_LAST_SYNC = "e0001-last-sync";
const STORAGE_LAST_ROUTE_PULL = "e0001-last-route-pull";
/** Coalesce Realtime / multi-tab storms against Lenovo PostgREST. */
const ROUTE_PULL_MIN_INTERVAL_MS = 5_000;
let routePullInflight = null;
let routePullLastAt = 0;
let routePullLastResult = null;
const STORAGE_UI_TICK = "e0001-ui-tick-v1";
const LEGACY_ALARM_NAMES = ["e0001-hourly-sync", "p0020-hourly-sync"];
const TOOL_COOKIE_URL_LOCAL = "http://127.0.0.1:5177/cookie";
const TOOL_COOKIE_URL_PROD = "https://databox.infi28.com/cookie";
const TOOL_COOKIE_URL_PROD_LEGACY = "https://tool-manager-zeta.vercel.app/?screen=cookie";
const POPUP_APPLY_TIMEOUT_MS = 60000;
const TAB_OVERLAY_MS = 12000;

let vaultPollTimer = null;
let suppressVaultUploadUntil = 0;
const activeLoadCookieLocks = new Map();
let activeRuntimeOpsCount = 0;

async function withActiveRuntimeOp(fn) {
  activeRuntimeOpsCount += 1;
  try {
    return await fn();
  } finally {
    activeRuntimeOpsCount = Math.max(0, activeRuntimeOpsCount - 1);
  }
}

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

async function getLocal(primaryKey, fallback = null) {
  const stored = await chrome.storage.local.get(primaryKey);
  if (stored[primaryKey] != null) return stored[primaryKey];
  return fallback;
}

async function purgeLegacyExtensionData() {
  await chrome.storage.local.remove([
    "p0020-bridge-auth-v1",
    "p0020-sync-bindings-v1",
    "p0020-bridge-prefs-v1",
    "p0020-binding-status-v1",
    "p0020-selected-binding-v1",
    "p0020-last-sync",
    "p0020-last-route-pull",
    "p0020-browser-id-v1",
    "p0020-vault-watermarks-v1",
  ]);
  await clearLegacyRouteAlarms();
}

async function clearLegacyRouteAlarms() {
  if (!chrome.alarms?.clear) return;
  await Promise.all(LEGACY_ALARM_NAMES.map((name) => chrome.alarms.clear(name).catch(() => null)));
}

async function getBindingStatus() {
  const status = await getLocal(STORAGE_BINDING_STATUS, {});
  return status && typeof status === "object" ? status : {};
}

async function getLastSync() {
  return getLocal(STORAGE_LAST_SYNC, null);
}

function bindingStatusKey(b) {
  return bindingRouteKey(b);
}

/** Copy legacy noteId-only status into composite keys after upgrade. */
function migrateBindingStatusKeys(status, bindings) {
  const next = { ...status };
  let changed = false;
  for (const b of bindings) {
    const newKey = bindingRouteKey(b);
    const legacyKey = b.noteId?.trim() || b.syncId?.trim() || "";
    if (!newKey || !legacyKey || newKey === legacyKey || next[newKey]) continue;
    if (next[legacyKey]) {
      next[newKey] = { ...next[legacyKey] };
      changed = true;
    }
  }
  return { status: next, changed };
}

function bindingFingerprint(b) {
  return [
    b.domain?.trim() ?? "",
    b.noteId?.trim() ?? "",
    b.syncId?.trim() ?? "",
    b.noteTitle?.trim() ?? "",
    b.pass ?? "",
  ].join("\0");
}

/** Drop stale per-route sync status when Tool sends the latest cloud route cache. */
async function pruneBindingStatusOnStore(nextBindings, prevBindings) {
  const status = await getBindingStatus();
  const validKeys = new Set(nextBindings.map((b) => bindingStatusKey(b)).filter(Boolean));
  const prevByDomain = new Map(
    (Array.isArray(prevBindings) ? prevBindings : []).map((b) => [b.domain?.trim(), b]),
  );

  for (const key of Object.keys(status)) {
    if (!validKeys.has(key)) delete status[key];
  }
  for (const b of nextBindings) {
    const prev = prevByDomain.get(b.domain?.trim());
    if (prev && bindingFingerprint(prev) !== bindingFingerprint(b)) {
      const oldKey = bindingStatusKey(prev);
      if (oldKey) delete status[oldKey];
    }
  }
  await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: status });
}

const VAULT_OK_STATES = new Set(["uploaded", "disabled", "skipped", "retry", "source_unset", "read_only"]);

function vaultWarningText(firstVault, schemaOk) {
  if (!firstVault) return null;
  if (firstVault.vault === "pass_mismatch") {
    return "Note có sync pass — xóa pass ở Note hoặc thêm pass vào binding.";
  }
  if (firstVault.vault === "rpc_missing") {
    return schemaOk
      ? "Vault chưa upload — mở site (↗), đăng nhập, chọn route, bấm Sync now."
      : "Vault/schema lỗi — chạy Tool/P0020-Data-Box/supabase/APPLY_ALL_P0020_COOKIE_BRIDGE.sql trong Supabase SQL Editor, reload extension.";
  }
  if (/sync_pass_hash|record\s+"v_note"/i.test(firstVault.vaultError ?? "")) {
    return "DB function cũ — chạy Tool/P0020-Data-Box/supabase/APPLY_FIX_V_NOTE_DROP.sql trên Supabase, reload extension.";
  }
  if (firstVault.vaultError) {
    return `Vault: ${firstVault.vaultError.slice(0, 120)}`;
  }
  return "Vault upload failed — thử Sync now lại.";
}

function computeDisplayWarning(bindingStatus, schemaOk) {
  const vaultIssues = Object.values(bindingStatus ?? {}).filter(
    (s) => s?.ok && s.vault && !VAULT_OK_STATES.has(s.vault),
  );
  if (!vaultIssues.length) return null;
  return vaultWarningText(vaultIssues[0], schemaOk);
}

async function clearStaleVaultErrors(schemaOk) {
  if (!schemaOk) return;
  const bs = await getBindingStatus();
  if (!bs || typeof bs !== "object") return;
  let changed = false;
  const next = { ...bs };
  for (const [k, s] of Object.entries(next)) {
    const stale =
      s?.vault === "rpc_missing" ||
      s?.vault === "failed" ||
      /sync_pass_hash|record\s+"v_note"|schema cache|PGRST202/i.test(s?.vaultError ?? "");
    if (stale) {
      next[k] = { ...s, vault: "retry", vaultError: undefined };
      changed = true;
    }
  }
  if (changed) {
    await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: next });
  }
}

async function getAuth() {
  return getLocal(STORAGE_AUTH, null);
}

async function getIdentity() {
  return getLocal(STORAGE_IDENTITY, null);
}

async function getBindings() {
  const bindings = await getLocal(STORAGE_BINDINGS, []);
  const list = Array.isArray(bindings) ? bindings : [];
  return list.map((b) => ({ ...b, requiresPass: false }));
}

const TOOL_TAB_URL_PATTERNS = [
  "http://127.0.0.1:5177/*",
  "https://databox.infi28.com/*",
  "https://*.infi28.com/*",
  "https://databox.infi.io.vn/*",
  "https://*.infi.io.vn/*",
  "https://tool-manager-zeta.vercel.app/*",
  "https://*.vercel.app/*",
];

async function requestToolBindingsFromOpenTabs() {
  const tabs = await chrome.tabs.query({
    url: TOOL_TAB_URL_PATTERNS,
  });
  let sent = 0;
  await Promise.all(
    tabs.map((tab) => {
      if (!tab.id) return Promise.resolve();
      const requestRelay = () =>
        chrome.tabs
          .sendMessage(tab.id, { type: "REQUEST_TOOL_BINDINGS_RELAY" })
          .then((res) => {
            if (res?.ok) sent += 1;
            return res;
          });
      return requestRelay().catch(async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content-bridge.js"],
          });
          await requestRelay();
        } catch {
          /* The Tool tab may not allow injection yet; popup will fall back to cloud pull. */
        }
      });
    }),
  );
  return { ok: sent > 0, sent };
}

function routeKey(b) {
  return `${String(b?.noteId ?? "").trim()}:${String(b?.domain ?? "").trim()}`;
}

function bindingsFingerprint(list) {
  return JSON.stringify(
    (Array.isArray(list) ? list : [])
      .map((b) => ({
        syncId: String(b.syncId ?? "").trim(),
        noteId: String(b.noteId ?? "").trim(),
        domain: String(b.domain ?? "").trim(),
        sourceBrowserId: b.sourceBrowserId ?? null,
        ownerUserId: b.ownerUserId ?? null,
        accessRole: b.accessRole ?? "owner",
        canApply: b.canApply !== false,
        canPublish: b.canPublish !== false,
      }))
      .sort((a, b) => `${a.noteId}:${a.domain}`.localeCompare(`${b.noteId}:${b.domain}`)),
  );
}

function sourceLockState(binding, browserId, overrideSourceId = null, auth = null) {
  return sourceLockStateForBinding(binding, browserId, auth, null, overrideSourceId);
}

async function pullCloudRoutes(auth, opts = {}) {
  if (!auth?.supabase_url || !auth?.supabase_anon_key || !auth?.access_token || isJwtExpired(auth)) {
    return { ok: false, error: "Session is not ready for cloud routes." };
  }

  const force = opts.force === true;
  const now = Date.now();
  if (!force && routePullInflight) return routePullInflight;
  if (!force && routePullLastResult && now - routePullLastAt < ROUTE_PULL_MIN_INTERVAL_MS) {
    return routePullLastResult;
  }

  const pulledAt = new Date().toISOString();
  const withTimeout = async (label, p, ms = 8000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await p(ctrl.signal);
      return res;
    } catch (err) {
      if (err?.name === "AbortError") {
        throw new Error(`AUTH_TIMEOUT:${label}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  const runPull = async () => {
  let url = `${auth.supabase_url}/rest/v1/rpc/note_cookie_routes_accessible_v2`;
  let source = "rpc:v2";
  let res;
  let text = "";
  try {
    res = await withTimeout(
      "pullRoutes-rpc-v2",
      (signal) =>
        fetch(url, {
          method: "POST",
          headers: userHeaders(auth, { "Content-Type": "application/json" }),
          body: "{}",
          signal,
        }),
    );
    text = await res.text();
    if (!res.ok && /Could not find|schema cache|PGRST202|404/i.test(text)) {
      url = `${auth.supabase_url}/rest/v1/rpc/note_cookie_routes_accessible`;
      source = "rpc:v1";
      res = await withTimeout(
        "pullRoutes-rpc-v1",
        (signal) =>
          fetch(url, {
            method: "POST",
            headers: userHeaders(auth, { "Content-Type": "application/json" }),
            body: "{}",
            signal,
          }),
      );
      text = await res.text();
    }
    if (!res.ok && /Could not find|schema cache|PGRST202|404/i.test(text)) {
      url = `${auth.supabase_url}/rest/v1/cookie_bridge_routes?select=id,user_id,note_id,sync_id,domain,note_title,enabled,source_browser_id,source_label,source_locked_at,updated_at&enabled=eq.true&order=updated_at.desc`;
      source = "table:current";
      res = await withTimeout(
        "pullRoutes-table-current",
        (signal) => fetch(url, { headers: userHeaders(auth), signal }),
      );
      text = await res.text();
    }
    if (!res.ok && /source_browser_id|source_label|source_locked_at|schema cache|PGRST/i.test(text)) {
      url = `${auth.supabase_url}/rest/v1/cookie_bridge_routes?select=id,user_id,note_id,sync_id,domain,note_title,enabled,updated_at&enabled=eq.true&order=updated_at.desc`;
      source = "table:legacy";
      res = await withTimeout(
        "pullRoutes-table-legacy",
        (signal) => fetch(url, { headers: userHeaders(auth), signal }),
      );
      text = await res.text();
    }
    if (!res.ok) {
      throw new Error(`cloud routes ${res.status}: ${parseApiErrorBody(text)}`);
    }
  } catch (err) {
    const error = formatSyncError(err);
    await chrome.storage.local.set({
      [STORAGE_LAST_ROUTE_PULL]: { at: pulledAt, ok: false, count: 0, source, userId: authUserId(auth), error },
    });
    await bumpUiTick();
    throw err;
  }

  let rows = JSON.parse(text);
  if (Array.isArray(rows) && rows.length === 0 && source.startsWith("rpc:")) {
    const verifyUrl = `${auth.supabase_url}/rest/v1/cookie_bridge_routes?select=id,user_id,note_id,sync_id,domain,note_title,enabled,source_browser_id,source_label,source_locked_at,updated_at&enabled=eq.true&order=updated_at.desc`;
    const verifyRes = await withTimeout(
      "pullRoutes-table-verify",
      (signal) => fetch(verifyUrl, { headers: userHeaders(auth), signal }),
    );
    const verifyText = await verifyRes.text();
    if (verifyRes.ok) {
      const verifyRows = JSON.parse(verifyText);
      if (Array.isArray(verifyRows) && verifyRows.length > 0) {
        rows = verifyRows;
        source = "table:verify";
      }
    }
  }
  const prev = await getBindings();
  const byKey = new Map(prev.map((b) => [routeKey(b), b]));
  const merged = new Map();

  const cloudRows = Array.isArray(rows) ? rows : [];
  for (const row of cloudRows) {
    const noteId = String(row.note_id ?? "").trim();
    const domain = String(row.domain ?? "").trim();
    if (!noteId || !domain) continue;
    const key = `${noteId}:${domain}`;
    const local = byKey.get(key);
    merged.set(key, {
      syncId: String(row.sync_id ?? local?.syncId ?? "").trim(),
      noteId,
      pass: local?.pass ?? "",
      domain,
      requiresPass: false,
      noteTitle: String(row.note_title ?? local?.noteTitle ?? "").trim(),
      sourceBrowserId: row.source_browser_id ?? local?.sourceBrowserId ?? null,
      sourceLabel: row.source_label ?? local?.sourceLabel ?? null,
      ownerUserId: row.owner_user_id ?? row.user_id ?? local?.ownerUserId ?? null,
      ownerUserEmail: row.owner_email ?? local?.ownerUserEmail ?? null,
      accessRole: row.access_role === "member" ? "member" : "owner",
      canApply: row.can_apply ?? true,
      canPublish: row.can_publish ?? row.access_role !== "member",
      canManage: row.can_manage ?? row.access_role !== "member",
    });
  }

  const next = normalizeExtensionBindings(Array.from(merged.values()));
  const bindingsChanged = bindingsFingerprint(prev) !== bindingsFingerprint(next);
  if (bindingsChanged) await pruneBindingStatusOnStore(next, prev);
  await chrome.storage.local.set({
    ...(bindingsChanged ? { [STORAGE_BINDINGS]: next } : {}),
    [STORAGE_LAST_ROUTE_PULL]: { at: pulledAt, ok: true, count: cloudRows.length, source, userId: authUserId(auth), error: null },
  });
  await bumpUiTick();
  if (bindingsChanged && opts.refreshVaultTransport === true) {
    await refreshVaultTransport();
  }
  return { ok: true, count: cloudRows.length, at: pulledAt, source, userId: authUserId(auth), changed: bindingsChanged };
  };

  routePullInflight = runPull()
    .then((result) => {
      routePullLastAt = Date.now();
      routePullLastResult = result;
      return result;
    })
    .finally(() => {
      routePullInflight = null;
    });
  return routePullInflight;
}

async function storeAuthFromMessage(msg) {
  const relayOnly = msg.relayOnly === true;
  const { [STORAGE_AUTH]: prev } = await chrome.storage.local.get(STORAGE_AUTH);
  const nextAuth = {
    access_token: msg.access_token,
    refresh_token: msg.refresh_token,
    expires_at: msg.expires_at,
    supabase_url: msg.supabase_url,
    supabase_anon_key: msg.supabase_anon_key,
    user_id: msg.user_id ?? prev?.user_id ?? null,
    user_email: msg.user_email ?? prev?.user_email ?? null,
  };
  await chrome.storage.local.set({ [STORAGE_AUTH]: nextAuth });
  if (relayOnly) {
    await pullCloudRoutes(nextAuth, { refreshVaultTransport: false }).catch((err) => {
      console.warn("[E0001] pull cloud routes (relay)", err);
    });
    await refreshVaultTransport();
    return { ok: true, relayOnly: true };
  }
  await refreshVaultTransport();
  await pullCloudRoutes(nextAuth, { refreshVaultTransport: true }).catch((err) => {
    console.warn("[E0001] pull cloud routes", err);
  });
  return { ok: true, relayOnly: false };
}

function restUrl(auth, table, query = "") {
  const base = auth.supabase_url.replace(/\/$/, "");
  return `${base}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

async function restJson(auth, table, query, opts = {}) {
  const res = await fetch(restUrl(auth, table, query), {
    method: opts.method ?? "GET",
    headers: userHeaders(auth, {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    }),
    body: opts.body == null ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${table} ${res.status}: ${parseApiErrorBody(text)}`);
  if (!text) return null;
  return JSON.parse(text);
}

function maxIso(values) {
  return values.filter(Boolean).sort().at(-1) ?? null;
}

/** Vault probe for popup display only — never mutates pushedAt (manual SYNC_NOW only). */
function mergeBindingStatusFromVaultMap(bindingStatus, vaultOnServer) {
  const next = { ...bindingStatus };
  let changed = false;
  for (const [key, probe] of Object.entries(vaultOnServer ?? {})) {
    if (!probe?.updatedAt) continue;
    const prev = next[key] ?? {};
    if (prev.vaultUpdatedAt === probe.updatedAt) continue;
    next[key] = { ...prev, vaultUpdatedAt: probe.updatedAt };
    changed = true;
  }
  return { status: next, changed };
}

function tabUrlMatchesAnyScope(url, scopes) {
  const host = extractHostnameFromUrlOrDomain(url);
  if (!host) return false;
  for (const scope of scopes ?? []) {
    const base = String(scope ?? "").replace(/^\./, "").toLowerCase();
    if (base && (host === base || host.endsWith(`.${base}`))) return true;
  }
  return false;
}

/**
 * Clear 100% of cookies + web storage for the current site (e.g. Adobe.com, Outlook.com, etc.)
 * Works offline/locally without requiring Login.
 */
async function clearSiteCookiesComplete(opts = {}) {
  suppressVaultUploadUntil = Date.now() + 45_000;
  const res = await runClearSiteCookiesComplete(opts.domain ?? "", {
    clearStorage: opts.clearStorage !== false,
    reloadTabs: opts.reloadTab !== false && opts.reloadTabs !== false,
  });
  if (res?.ok && Array.isArray(res.scopes) && res.scopes.length) {
    try {
      const bindings = await getBindings();
      const matchingBindings = bindings.filter((b) =>
        tabUrlMatchesAnyScope(`https://${String(b.domain ?? "").replace(/^\./, "")}/`, res.scopes),
      );
      if (matchingBindings.length) {
        await recordJarCountsForBindings(matchingBindings);
        await bumpUiTick();
      }
    } catch {
      /* ignore */
    }
  }
  return res;
}

function normalizeBridgeRole(role) {
  return role === "reader" ? "reader" : "writer";
}

async function getPrefs() {
  const prefs = await getLocal(STORAGE_PREFS, null);
  return {
    /** Supabase postgres_changes for routes + vault metadata (default on). Does not run SYNC_NOW. */
    routeDbRealtime: prefs?.routeDbRealtime !== false,
    /** Load vault into jar without button — always off from Tool; extension default false. */
    realtimeVaultApply: prefs?.realtimeVaultApply === true,
    bridgeRole: normalizeBridgeRole(prefs?.bridgeRole),
  };
}

const UI_TICK_MIN_INTERVAL_MS = 2_500;
let lastUiTickAt = 0;
let pendingUiTickTimer = null;

async function bumpUiTick() {
  const now = Date.now();
  const elapsed = now - lastUiTickAt;
  if (elapsed >= UI_TICK_MIN_INTERVAL_MS) {
    if (pendingUiTickTimer) {
      clearTimeout(pendingUiTickTimer);
      pendingUiTickTimer = null;
    }
    lastUiTickAt = now;
    await chrome.storage.local.set({ [STORAGE_UI_TICK]: now });
    return;
  }
  if (!pendingUiTickTimer) {
    pendingUiTickTimer = setTimeout(() => {
      pendingUiTickTimer = null;
      lastUiTickAt = Date.now();
      void chrome.storage.local.set({ [STORAGE_UI_TICK]: lastUiTickAt });
    }, UI_TICK_MIN_INTERVAL_MS - elapsed);
  }
}

function resetVaultPollLoop() {
  if (vaultPollTimer) clearTimeout(vaultPollTimer);
  vaultPollTimer = null;
  const tick = async () => {
    const prefs = await getPrefs();
    if (!prefs.realtimeVaultApply) return;
    const auth = await getAuth();
    const bindings = await getBindings();
    const browserId = await getBrowserId();
    await pollVaultsAndApply(auth, bindings, prefs, browserId);
    vaultPollTimer = setTimeout(tick, 12_000);
  };
  void tick();
}

async function refreshVaultTransport() {
  const prefs = await getPrefs();
  const auth = await getAuth();
  const bindings = await getBindings();
  const sessionOk = Boolean(auth?.access_token && !isJwtExpired(auth));
  if (sessionOk && prefs.routeDbRealtime) {
    startVaultRealtime(auth, bindings, prefs, getBindings, async () => {
      const freshAuth = await ensureAuth();
      if (freshAuth) {
        await pullCloudRoutes(freshAuth, { refreshVaultTransport: false });
        await bumpUiTick();
      }
    });
  } else {
    stopVaultRealtime();
  }
  if (prefs.realtimeVaultApply && sessionOk) {
    resetVaultPollLoop();
  } else {
    if (vaultPollTimer) clearTimeout(vaultPollTimer);
    vaultPollTimer = null;
  }
}

async function ensureAuth() {
  let auth = await getAuth();
  if (!auth) return null;
  return refreshAuthIfNeeded(auth, STORAGE_AUTH);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Hub identity can land before Data Box JWT. Route RLS needs the data plane. */
async function ensureAuthForRoutePull({ waitMs = 0 } = {}) {
  let auth = await ensureAuth();
  if (auth?.access_token && !isJwtExpired(auth)) return auth;
  if (waitMs <= 0) return auth;
  const identity = await getIdentity();
  if (!identity?.access_token) return auth;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await sleep(250);
    auth = await ensureAuth();
    if (auth?.access_token && !isJwtExpired(auth)) return auth;
  }
  return ensureAuth();
}

/** HubWorkspaceUserModal profile claims — parity buildWorkspaceUserProfileRows (hub-ui). */
function jwtUserProfileFromAuth(auth) {
  const payload = jwtPayload(auth);
  const meta = payload?.app_metadata ?? {};
  const umeta = payload?.user_metadata ?? {};
  const role = String(auth?.user_role ?? meta.role ?? umeta.role ?? "user");
  const provider = String(auth?.user_provider ?? meta.provider ?? umeta.provider ?? "email");
  const createdAt = auth?.user_created_at ?? payload?.created_at ?? umeta.created_at ?? null;
  const lastSignInAt =
    auth?.user_last_sign_in_at ?? payload?.last_sign_in_at ?? umeta.last_sign_in_at ?? null;
  return {
    userRole: role,
    userProvider: provider,
    userCreatedAt: createdAt,
    userLastSignInAt: lastSignInAt,
    userLoginId: String(auth?.user_login_id ?? umeta.login_id ?? umeta.username ?? "").trim(),
    userDisplayLabel: String(auth?.user_display_label ?? umeta.full_name ?? umeta.name ?? "").trim(),
    userFullName: String(umeta.full_name ?? umeta.name ?? "").trim(),
    userPhone: String(auth?.user_phone ?? umeta.phone ?? "").trim(),
  };
}

function recordRouteLoadOnCloud(auth, binding) {
  return recordRouteActivityOnCloud(auth, binding, "load", { onBumpUiTick: bumpUiTick });
}

function recordRouteSyncOnCloud(auth, binding) {
  return recordRouteActivityOnCloud(auth, binding, "sync", { onBumpUiTick: bumpUiTick });
}

async function fetchNotes(auth) {
  const url = `${auth.supabase_url}/rest/v1/notes?select=id,domain`;
  const res = await fetch(url, {
    headers: userHeaders(auth),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Notes fetch ${res.status}: ${parseApiErrorBody(text)}`);
  }
  return res.json();
}

async function syncLegacyJwt(auth) {
  const notes = await fetchNotes(auth);
  const withDomain = notes.filter((n) => n.domain?.trim());
  let ok = 0;
  let fail = 0;
  for (const note of withDomain) {
    try {
      const cookies = await getCookiesForDomain(note.domain.trim());
      const lines = toSnapshotLines(cookies);
      await patchNote(auth, note.id, {
        cookie_snapshot: lines,
        sync_status: cookies.length ? "synced" : "pending",
        synced_at: new Date().toISOString(),
      });
      ok += 1;
    } catch (err) {
      console.error("[E0001] legacy sync", note.id, err);
      fail += 1;
    }
  }
  return { mode: "jwt", ok, fail, total: withDomain.length };
}

async function syncBindingWithVault(auth, b, browserId, _prefs, opts = {}) {
  return syncSingleRouteWithVault(auth, b, browserId, {
    ...opts,
    suppressUpload: Date.now() < suppressVaultUploadUntil,
  });
}

/** Update Lines column after Load / manual apply — count cookies now in this browser. */
async function recordJarCountsForBindings(bindings, extraByKey = {}) {
  const status = { ...(await getBindingStatus()) };
  for (const b of bindings) {
    const key = bindingStatusKey(b);
    if (!key) continue;
    const jar = await getCookiesForDomain(b.domain);
    const now = new Date().toISOString();
    const extra = extraByKey[key] ?? {};
    status[key] = {
      ...(status[key] ?? {}),
      ok: true,
      empty: jar.length === 0 && !extra.storageCount,
      lines: jar.length,
      cookies: jar.length,
      ...(extra.storageEmail !== undefined ? { storageEmail: extra.storageEmail } : {}),
      ...(extra.storageUid !== undefined ? { storageUid: extra.storageUid } : {}),
      ...(extra.storageCount !== undefined ? { storageCount: extra.storageCount } : {}),
      jarAt: now,
      loadedAt: now,
    };
  }
  await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: status });
}

async function syncBindings(auth, bindings, opts = {}) {
  if (opts.manual !== true) {
    return {
      ok: 0,
      fail: 0,
      total: 0,
      error: "Auto sync is disabled — use Sync on one route in the extension popup.",
    };
  }
  const valid = bindings.filter(
    (b) => b.domain?.trim() && (b.noteId?.trim() || b.syncId?.trim()),
  );
  const prefs = await getPrefs();
  const browserId = await getBrowserId();
  let ok = 0;
  let fail = 0;
  let zeroCookieRoutes = 0;
  const bindingStatus = { ...(await getBindingStatus()) };
  for (const b of valid) {
    const key = bindingStatusKey(b);
    try {
      const r = await syncBindingWithVault(auth, b, browserId, prefs, opts);
      const empty = (r.cookies ?? r.lines ?? 0) === 0;
      if (empty && !r.skippedSync) zeroCookieRoutes += 1;
      ok += 1;
      const prev = bindingStatus[key] ?? {};
      if (r.skippedSync === true) {
        bindingStatus[key] = {
          ...prev,
          ok: true,
          empty,
          lines: r.lines,
          cookies: r.cookies,
          vault: r.vault,
          vaultError: r.vaultError,
          vaultVersion: r.vaultVersion,
          vaultUpdatedBy: r.vaultUpdatedBy,
          sourceLock: r.sourceLock,
          skippedSync: true,
        };
      } else {
        const pushedAt = new Date().toISOString();
        bindingStatus[key] = {
          ...prev,
          ok: true,
          empty,
          lines: r.lines,
          cookies: r.cookies,
          vault: r.vault,
          vaultError: r.vaultError,
          vaultVersion: r.vaultVersion,
          vaultUpdatedBy: r.vaultUpdatedBy,
          sourceLock: r.sourceLock,
          storageEmail: r.storageEmail ?? prev.storageEmail ?? null,
          storageUid: r.storageUid ?? prev.storageUid ?? null,
          storageCount: r.storageCount ?? prev.storageCount ?? 0,
          skippedSync: false,
          pushedAt,
          cloudSyncedAt: pushedAt,
          at: pushedAt,
        };
      }
      if (!r.skippedSync) {
        await recordRouteSyncOnCloud(auth, b);
        const userSyncAt = new Date().toISOString();
        bindingStatus[key] = {
          ...(bindingStatus[key] ?? {}),
          userSyncedAt: userSyncAt,
        };
      }
    } catch (err) {
      console.error("[E0001] sync binding", b.noteId || b.syncId, err);
      fail += 1;
      bindingStatus[key] = {
        ok: false,
        error: formatSyncError(err),
        at: new Date().toISOString(),
      };
    }
  }
  await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: bindingStatus });
  const syncedStatuses = valid.map((b) => bindingStatus[bindingStatusKey(b)]).filter(Boolean);
  const firstErr = syncedStatuses.find((s) => s.ok === false)?.error;
  const schemaOk = await probeCookieSchemaOk(auth, valid);
  const vaultIssues = syncedStatuses.filter(
    (s) => s.ok && s.vault && !VAULT_OK_STATES.has(s.vault),
  );
  let warning =
    zeroCookieRoutes > 0
      ? `${zeroCookieRoutes} route(s): 0 cookies — open site (↗), log in, then Sync again.`
      : null;
  const vaultHint = vaultWarningText(vaultIssues[0], schemaOk);
  if (vaultHint) {
    warning = warning ? `${warning} ${vaultHint}` : vaultHint;
  }
  const partial = Boolean(warning);
  return {
    mode: "sync_id",
    ok,
    fail,
    total: valid.length,
    error: firstErr,
    zeroCookieRoutes,
    vaultIssues: vaultIssues.length,
    warning,
    partial,
  };
}

function normalizeExtensionBindings(list) {
  return (Array.isArray(list) ? list : [])
    .map((b) => ({
      syncId: String(b.syncId ?? "").trim(),
      noteId: String(b.noteId ?? "").trim(),
      pass: b.pass ?? "",
      domain: String(b.domain ?? "").trim(),
      requiresPass: Boolean(b.requiresPass),
      noteTitle: String(b.noteTitle ?? "").trim(),
      sourceBrowserId: String(b.sourceBrowserId ?? "").trim() || null,
      sourceLabel: String(b.sourceLabel ?? "").trim() || null,
      ownerUserId: String(b.ownerUserId ?? "").trim() || null,
      ownerUserEmail: String(b.ownerUserEmail ?? "").trim() || null,
      accessRole: b.accessRole === "member" ? "member" : "owner",
      canApply: b.canApply !== false,
      canPublish: b.canPublish !== false,
      canManage: b.canManage === true,
    }))
    .filter((b) => b.domain && (b.noteId || b.syncId));
}

async function showLoadCookieTabOverlay(tabId, binding, durationMs = TAB_OVERLAY_MS) {
  if (!tabId || !chrome.scripting?.executeScript) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      injectImmediately: true,
      func: (payload) => {
        const id = "e0001-cookie-apply-overlay";
        const existing = document.getElementById(id);
        if (existing) return;
        const root = document.createElement("div");
        root.id = id;
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "true");
        root.style.cssText = [
          "position:fixed",
          "inset:0",
          "z-index:2147483647",
          "display:grid",
          "place-items:center",
          "padding:24px",
          "background:radial-gradient(circle at 50% 24%, rgba(99,102,241,.22), transparent 34%), rgba(5,8,18,.76)",
          "backdrop-filter:blur(8px)",
          "font-family:Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          "color:#e6e8ef",
          "pointer-events:all",
        ].join(";");
        root.tabIndex = -1;
        const title = String(payload.title || "Cookie route").replace(/[&<>"']/g, (ch) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch]);
        root.innerHTML = `
          <div style="width:min(320px,100%);border:1px solid rgba(129,140,248,.32);border-radius:24px;background:linear-gradient(180deg,rgba(18,24,48,.98),rgba(10,15,32,.98));box-shadow:0 28px 80px rgba(0,0,0,.48),0 0 0 1px rgba(255,255,255,.035) inset;padding:22px;text-align:center">
            <div style="width:48px;height:48px;margin:0 auto;border-radius:16px;border:1px solid rgba(129,140,248,.35);background:rgba(99,102,241,.18);display:grid;place-items:center">
              <div style="width:22px;height:22px;border-radius:999px;border:2px solid rgba(199,210,254,.3);border-top-color:#c7d2fe;animation:e0001CookieSpin .9s linear infinite"></div>
            </div>
            <p style="margin:14px 0 0;color:#a5b4fc;font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">LOAD COOKIES</p>
            <h2 style="margin:6px 0 0;font-size:18px;line-height:1.3;color:#fff">Applying cookies</h2>
            <p style="margin:6px 0 0;color:#8a93b2;font-size:12px;line-height:1.5">${title} · keep the browser tab open for about 5 seconds.</p>
            <div style="height:6px;margin-top:16px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.08)">
              <div style="height:100%;width:66%;border-radius:inherit;background:linear-gradient(90deg,#6366f1,#22c55e);animation:e0001CookieBar 1.8s ease-in-out infinite"></div>
            </div>
            <div data-apply-steps style="display:grid;gap:6px;margin-top:14px;text-align:left">
              <span data-step="vault" class="is-active">Reading vault</span>
              <span data-step="write" class="is-pending">Applying cookies</span>
              <span data-step="verify" class="is-pending">Verifying browser</span>
            </div>
            <p style="margin:12px 0 0;color:#a5b4fc;font-size:11px">Please keep this tab open for a few seconds.</p>
          </div>
          <style>
            @keyframes e0001CookieSpin { to { transform: rotate(360deg); } }
            @keyframes e0001CookieBar {
              0%, 100% { transform: translateX(-18%); width:46%; }
              50% { transform: translateX(64%); width:58%; }
            }
            @keyframes e0001StepPulse {
              0%, 100% { box-shadow:0 0 0 0 rgba(199,210,254,.42); transform:translateY(-50%) scale(1); }
              50% { box-shadow:0 0 0 5px rgba(199,210,254,0); transform:translateY(-50%) scale(1.08); }
            }
            @keyframes e0001StepShimmer { to { transform: translateX(100%); } }
            #e0001-cookie-apply-overlay [data-apply-steps] span {
              position:relative;
              overflow:hidden;
              border:1px solid rgba(255,255,255,.07);
              border-radius:10px;
              background:rgba(255,255,255,.035);
              color:#8a93b2;
              padding:7px 9px 7px 28px;
              font-size:11px;
              transition:border-color .18s ease,background-color .18s ease,color .18s ease,box-shadow .18s ease;
            }
            #e0001-cookie-apply-overlay [data-apply-steps] span::before {
              content:"";
              position:absolute;
              left:10px;
              top:50%;
              width:8px;
              height:8px;
              border-radius:999px;
              transform:translateY(-50%);
              background:rgba(255,255,255,.26);
            }
            #e0001-cookie-apply-overlay [data-apply-steps] span::after {
              content:"";
              position:absolute;
              inset:0;
              opacity:0;
              pointer-events:none;
              background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent);
              transform:translateX(-100%);
            }
            #e0001-cookie-apply-overlay [data-apply-steps] span.is-done {
              color:#bbf7d0;
              border-color:rgba(34,197,94,.28);
            }
            #e0001-cookie-apply-overlay [data-apply-steps] span.is-done::before {
              background:#22c55e;
              box-shadow:0 0 12px rgba(34,197,94,.45);
            }
            #e0001-cookie-apply-overlay [data-apply-steps] span.is-active {
              color:#c7d2fe;
              border-color:rgba(129,140,248,.34);
              background:rgba(99,102,241,.12);
              box-shadow:0 0 0 1px rgba(129,140,248,.08) inset,0 0 20px rgba(99,102,241,.16);
            }
            #e0001-cookie-apply-overlay [data-apply-steps] span.is-active::before {
              background:#c7d2fe;
              animation:e0001StepPulse 1s ease-in-out infinite;
            }
            #e0001-cookie-apply-overlay [data-apply-steps] span.is-active::after {
              opacity:1;
              animation:e0001StepShimmer 1.4s ease-in-out infinite;
            }
          </style>
        `;
        const stepEls = {
          vault: root.querySelector('[data-step="vault"]'),
          write: root.querySelector('[data-step="write"]'),
          verify: root.querySelector('[data-step="verify"]'),
        };
        const setStage = (stage) => {
          const states = {
            vault: { vault: "is-active", write: "is-pending", verify: "is-pending" },
            write: { vault: "is-done", write: "is-active", verify: "is-pending" },
            verify: { vault: "is-done", write: "is-done", verify: "is-active" },
            done: { vault: "is-done", write: "is-done", verify: "is-done" },
          }[stage];
          for (const [key, el] of Object.entries(stepEls)) {
            if (!el) continue;
            el.className = states[key];
          }
        };
        setStage("vault");
        window.setTimeout(() => setStage("write"), 1100);
        window.setTimeout(() => setStage("verify"), 3900);
        window.setTimeout(() => setStage("done"), 5200);
        for (const eventName of ["click", "dblclick", "mousedown", "mouseup", "wheel", "touchstart", "keydown"]) {
          root.addEventListener(eventName, (event) => {
            event.preventDefault();
            event.stopPropagation();
          });
        }
        document.documentElement.appendChild(root);
        root.focus({ preventScroll: true });
        // Safety cleanup only. Normal unlock is controlled by the extension background.
        window.setTimeout(() => root.remove(), payload.durationMs);
      },
      args: [
        {
          title: binding?.noteTitle || binding?.domain || "Cookie route",
          durationMs,
        },
      ],
    });
    const prev = activeLoadCookieLocks.get(tabId);
    activeLoadCookieLocks.set(tabId, {
      binding,
      until: Date.now() + durationMs,
      reinjectCount: prev?.reinjectCount ?? 0,
    });
  } catch (err) {
    console.warn("[E0001] load cookie tab overlay", err);
  }
}

async function removeLoadCookieTabOverlay(tabId) {
  if (!tabId || !chrome.scripting?.executeScript) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.getElementById("e0001-cookie-apply-overlay")?.remove();
      },
    });
  } catch {
    /* Tab may have navigated or closed. */
  } finally {
    activeLoadCookieLocks.delete(tabId);
  }
}

async function removeLoadCookieTabOverlays(tabIds) {
  await Promise.all(Array.from(tabIds).map((tabId) => removeLoadCookieTabOverlay(tabId)));
}

chrome.tabs.onUpdated.addListener(() => {
  /* Tab overlay is injected once; no reinject on redirect (was causing infinite Gmail load). */
});

async function lockLoadCookieTabsForDomain(domain, binding = {}) {
  const cleanDomain = String(domain ?? "").trim();
  if (!cleanDomain) return { ok: false, error: "No domain" };

  if (isGoogleDomain(cleanDomain) || isGoogleOsidAppDomain(cleanDomain)) {
    const ensured = await ensureSiteTabForDomain(cleanDomain, {
      activate: true,
      forceNavigate: true,
      waitMs: 0,
      createdDelayMs: 0,
      tabWaitMs: GOOGLE_TAB_WAIT_MS,
    });
    return ensured.tabId
      ? { ok: true, tabs: 1, created: ensured.created, navigated: ensured.navigated, skipOverlay: true }
      : { ok: false, error: "No tab" };
  }

  const tabs = await chrome.tabs.query({});
  const matches = tabs.filter((tab) => tab.id && tab.url && tabMatchesRoute(tab.url, cleanDomain));
  if (matches.length) {
    await Promise.all(matches.map((tab) => showLoadCookieTabOverlay(tab.id, binding)));
    const active = matches.find((tab) => tab.active) ?? matches[0];
    if (active?.id) {
      try {
        await chrome.tabs.update(active.id, { active: true });
      } catch {
        /* ignore */
      }
    }
    return { ok: true, tabs: matches.length };
  }
  const ensured = await ensureSiteTabForDomain(cleanDomain, {
    activate: true,
    forceNavigate: false,
    waitMs: 0,
    createdDelayMs: 0,
  });
  if (ensured.tabId) {
    await showLoadCookieTabOverlay(ensured.tabId, binding);
    return { ok: true, tabs: 1, created: ensured.created };
  }
  return { ok: false, error: "No tab" };
}

/** Pull encrypted vault from Supabase and set cookies in this browser (cross-profile login). */
async function applyVaultAll(filter = {}) {
  const auth = await ensureAuth();
  if (!auth?.supabase_url || !auth?.supabase_anon_key) {
    return { ok: false, error: "Open Cookie sync → Link extension first." };
  }
  let bindings = filterBindings(await getBindings(), filter);
  if (!bindings.length && filter.binding && typeof filter.binding === "object") {
    bindings = normalizeExtensionBindings([filter.binding]);
  }
  if (!bindings.length) {
    return { ok: false, error: "No routes — create a cloud route in Tool, then Link extension." };
  }
  suppressVaultUploadUntil = Date.now() + 45_000;
  const lockedTabIds = new Set();
  for (const [tabId, lock] of activeLoadCookieLocks.entries()) {
    if (bindings.some((binding) => binding.domain && lock.binding?.domain && binding.domain === lock.binding.domain)) {
      lockedTabIds.add(tabId);
    }
  }
  const isGoogleOrOsidDomain = (d) => isGoogleDomain(d) || isGoogleOsidAppDomain(d);
  const lockTab = async (tabId, binding) => {
    if (!tabId || isGoogleOrOsidDomain(binding?.domain)) return;
    await showLoadCookieTabOverlay(tabId, binding);
    lockedTabIds.add(tabId);
  };

  const refreshTab = filter.refreshTab === true;
  const confirmSession = filter.confirmSession !== false;
  const openSite = filter.openSite !== false;
  const activateSite = filter.activateSite !== false;
  const googleBindings = bindings.filter((b) => isGoogleOrOsidDomain(b.domain));
  const nonGoogleBindings = bindings.filter((b) => !isGoogleOrOsidDomain(b.domain));

  try {
    if (filter.clearBeforeLoad === true) {
      for (const b of bindings) {
        if (!b.domain?.trim()) continue;
        await clearCookiesForDomain(b.domain.trim());
      }
    }
    if (openSite) {
      for (const b of nonGoogleBindings) {
        if (!b.domain?.trim()) continue;
        try {
          const ensured = await ensureSiteTabForDomain(b.domain.trim(), {
            activate: activateSite,
            forceNavigate: true,
            waitMs: 2800,
            createdDelayMs: 2800,
          });
          await lockTab(ensured.tabId, b);
        } catch (err) {
          console.warn("[E0001] ensure site tab", b.domain, err);
        }
      }
    }
    const results = [];
    for (const b of bindings) {
      if (!canUseVault(b)) {
        results.push({
          domain: b.domain,
          ok: false,
          reason: "no_note",
        });
        continue;
      }
      const jarScope = effectiveCookieDomain(b.domain);
      const jarBefore = (await getCookiesForDomain(jarScope)).length;
      try {
        const r = await loadVaultIntoBrowser(auth, b, {
          clearWatermark: true,
          rounds: 4,
          retryDelayMs: 600,
          requireFacebookLogin: isFacebookDomain(b.domain),
          ...(Object.prototype.hasOwnProperty.call(filter, "vaultPassOverride")
            ? { passphrase: filter.vaultPassOverride }
            : {}),
        });
        let storageApplied = 0;
        if (hasNonEmptyAuthStorage(r.storage) && b.domain?.trim()) {
          try {
            const ensured = await ensureSiteTabForDomain(b.domain.trim(), {
              activate: activateSite,
              forceNavigate: false,
              waitMs: 500,
              createdDelayMs: 1200,
            });
            if (ensured.tabId) await lockTab(ensured.tabId, b);
            const storageRes = await applySiteAuthStorageForDomain(b.domain.trim(), r.storage);
            storageApplied = storageRes?.applied ?? 0;
          } catch (storageErr) {
            console.warn("[E0001] apply site auth storage", b.domain, storageErr);
          }
        }
        const jarAfter = (await getCookiesForDomain(jarScope)).length;
        const target = r.serverCount ?? r.decrypted ?? 0;
        const jarOk = target > 0 && jarAfter >= target;
        const jarGained = jarAfter > jarBefore;
        const loadOk =
          (r.applied ?? 0) > 0 ||
          storageApplied > 0 ||
          r.hasStorage === true ||
          jarOk ||
          jarGained;
        if (loadOk) await recordRouteLoadOnCloud(auth, b);
        results.push({
          domain: b.domain,
          noteId: b.noteId,
          ...r,
          storageApplied,
          ok: loadOk,
          jarBefore,
          jarAfter,
          jarGained,
        });
      } catch (err) {
        results.push({ domain: b.domain, ok: false, error: formatSyncError(err) });
      }
    }
    const applied = results.filter((r) => r.ok);
    if (applied.length) {
      await new Promise((r) => setTimeout(r, 400));
      const extraStatusByKey = {};
      for (const r of applied) {
        const bMatch = bindings.find((b) => b.noteId === r.noteId && b.domain === r.domain) ?? bindings.find((b) => b.domain === r.domain);
        if (!bMatch) continue;
        const k = bindingStatusKey(bMatch);
        const stId = extractAuthStorageIdentity(r.storage);
        if (k) {
          extraStatusByKey[k] = {
            storageEmail: stId.email || null,
            storageUid: stId.uid || null,
            storageCount: stId.storageCount || 0,
          };
        }
      }
      await recordJarCountsForBindings(bindings, extraStatusByKey);
      const n = applied.reduce((s, r) => s + (r.applied ?? 0), 0);
      const failedNames = applied.flatMap((r) => r.failedNames ?? []);
      const total = applied.reduce((s, r) => s + (r.total ?? r.decrypted ?? 0), 0);
      const decryptedMax = Math.max(...applied.map((r) => r.decrypted ?? r.total ?? 0), 0);
      const jarAfterMax = Math.max(...applied.map((r) => r.jarAfter ?? 0), 0);
      const effective = Math.max(n, jarAfterMax);
      let tabsRefreshed = 0;
      let googleSession = null;
      if (googleBindings.length) {
        for (const b of googleBindings) {
          googleSession = await confirmGoogleInboxTab(b.domain.trim(), { activate: activateSite });
          if (googleSession.tabId) tabsRefreshed += 1;
        }
      }
      const shouldRefreshNonGoogle =
        (refreshTab || confirmSession) &&
        nonGoogleBindings.length &&
        applied.some(
          (r) =>
            !isGoogleOrFlowDomain(r.domain) &&
            (r.jarGained ||
              r.hasStorage ||
              (r.storageApplied ?? 0) > 0 ||
              ((r.jarAfter ?? 0) > 0 && (r.decrypted ?? 0) > 0)),
        );
      if (shouldRefreshNonGoogle) {
        await new Promise((r) => setTimeout(r, 400));
        const domains = [...new Set(applied.filter((r) => !isGoogleOrFlowDomain(r.domain)).map((r) => r.domain).filter(Boolean))];
        for (const d of domains) {
          tabsRefreshed += await refreshTabsForDomain(d);
          const routeBinding = bindings.find((b) => b.domain === d) ?? bindings[0];
          const tabs = await chrome.tabs.query({});
          for (const tab of tabs) {
            if (!tab.id || !tab.url || !tabMatchesRoute(tab.url, d)) continue;
            await lockTab(tab.id, routeBinding);
          }
        }
      }
      const jarAfter =
        applied[0]?.jarAfter ?? (await getCookiesForDomain(effectiveCookieDomain(bindings[0]?.domain))).length;
      let warning = null;
      if (effective < decryptedMax) {
        const miss = decryptedMax - effective;
        const names = failedNames.slice(0, 5).join(", ");
        warning = `Wrote ${n}/${decryptedMax} cookies · jar ${jarAfter}${names ? ` — failed: ${names}` : ""}${miss > 0 ? ` (missing ${miss})` : ""}`;
      }
      const googleApplied = applied.find((r) => isGoogleOrOsidDomain(r.domain));
      const osidAppRoute = googleBindings.map((b) => resolveGoogleOsidApp(b.domain)).find(Boolean) ?? null;
      if (googleApplied?.googleVaultNames && googleApplied.googleVaultNames.hasGoogleLogin !== true) {
        const googleHint = osidAppRoute
          ? `Vault is missing Google login cookies (SID/HSID) — sign in on ${osidAppRoute.primaryHost} and Sync again.`
          : "Vault is missing Google login cookies (SID/HSID) — Sync again from an authenticated Gmail inbox.";
        warning = warning ? `${warning} ${googleHint}` : googleHint;
      }
      if (googleBindings.length && googleSession && googleSession.ok !== true) {
        const sessionHint = osidAppRoute
          ? googleSession.reason === "marketing_redirect"
            ? `Cookies applied, but ${osidAppRoute.primaryHost} redirected to landing page — sign in on the source browser and Sync again.`
            : `Could not confirm ${osidAppRoute.label} session on ${osidAppRoute.primaryHost} after Load — try syncing \`${osidAppRoute.canonicalDomain}\` again.`
          : googleSession.reason === "marketing_redirect"
            ? "Cookies applied, but Gmail redirected to workspace landing — Sync again from Gmail inbox."
            : "Could not confirm Gmail inbox after Load — try syncing `.google.com` again.";
        warning = warning ? `${warning} ${sessionHint}` : sessionHint;
      }
      const partial = effective < decryptedMax || (googleBindings.length > 0 && googleSession?.ok !== true);
      return {
        ok: googleBindings.length ? googleSession?.ok === true : true,
        partial,
        applied: n,
        total,
        decrypted: decryptedMax,
        failedNames,
        vaultStale: applied.some((r) => r.vaultStale || r.partial),
        warning,
        routes: applied.length,
        tabsRefreshed,
        jarAfter,
        googleSession,
        results,
      };
    }
    const withErr = results.find((r) => r.error);
    if (withErr?.error) {
      return { ok: false, error: withErr.error, results };
    }
    const emptyVault = results.find((r) => r.reason === "empty_vault");
    if (emptyVault) {
      const hintHost = openSiteHintHost(emptyVault.domain || bindings[0]?.domain);
      return {
        ok: false,
        error: `Vault rỗng (0 cookie) cho ${emptyVault.domain || "route"} — mở ${hintHost}, đăng nhập, Sync lại rồi Load.`,
        results,
      };
    }
    const zero = results.find(
      (r) =>
        r.reason === "zero_applied" ||
        (r.ok === false && (r.decrypted ?? r.total ?? r.serverCount ?? 0) > 0),
    );
    if (zero) {
      const failed = zero.failed ?? 0;
      const total = zero.total ?? zero.cookieCount ?? "?";
      const names = (zero.failedNames ?? []).slice(0, 6).join(", ");
      return {
        ok: false,
        error: `Không ghi được cookie (${failed}/${total} lỗi${names ? `: ${names}` : ""}). Dùng Test thủ công → Apply paste.`,
        failedNames: zero.failedNames,
        failedDetails: zero.failedDetails,
        results,
      };
    }
    const notFound = results.filter((r) => r.reason === "not_found" || r.skipped);
    const already = results.filter((r) => r.reason === "already_applied");
    const hintHost = openSiteHintHost(bindings[0]?.domain);
    return {
      ok: false,
      error:
        notFound.length === results.length
          ? "Chưa có vault — browser khác bấm Sync now (Vault sync bật)."
          : already.length === results.length
            ? `Vault đã apply — bấm Load lại (sẽ mở ${hintHost}).`
            : `Load thất bại — mở ${hintHost}, bấm Load lại. Nếu vault > jar: xem toast tên cookie lỗi.`,
      results,
    };
  } finally {
    await removeLoadCookieTabOverlays(lockedTabIds);
    for (const tabId of lockedTabIds) activeLoadCookieLocks.delete(tabId);
  }
}

function filterBindings(bindings, filter = {}) {
  let list = bindings;
  if (filter.bindingKey) {
    const key = filter.bindingKey.trim();
    list = list.filter((b) => bindingStatusKey(b) === key);
  } else if (filter.noteId) {
    list = list.filter((b) => b.noteId?.trim() === filter.noteId.trim());
  }
  return list;
}

async function syncAll(filter = {}) {
  const auth = await ensureAuth();
  if (!auth?.supabase_url || !auth?.supabase_anon_key) {
    console.warn("[E0001] No Supabase config — open Tool Manager → Cookie sync");
    return { ok: false, reason: "no_config", error: "Open Cookie sync → Link extension first." };
  }

  let bindings = filterBindings(await getBindings(), filter);
  if (!bindings.length && filter.binding && typeof filter.binding === "object") {
    bindings = normalizeExtensionBindings([filter.binding]);
  }
  if (!bindings.length) {
    return {
      ok: false,
      reason: "no_bindings",
      error: filter.noteId || filter.bindingKey
        ? "No route cache for selected route — refresh or re-link extension from Cookie sync."
        : "0 routes — Cookie sync → create cloud route, then Link extension.",
    };
  }
  const result = await syncBindings(auth, bindings, {
    manual: filter.manual === true,
    guardVaultDowngrade: filter.auto === true && filter.forceUpload !== true,
    sourceBrowserId: filter.sourceBrowserId,
    ...(Object.prototype.hasOwnProperty.call(filter, "vaultPassOverride")
      ? { vaultPassOverride: filter.vaultPassOverride }
      : {}),
  });
  await chrome.storage.local.set({
    [STORAGE_LAST_SYNC]: { at: new Date().toISOString(), ...result },
  });
  if (!result.total || result.ok === 0) {
    return {
      ...result,
      ok: false,
      syncedCount: 0,
      reason: "sync_failed",
      error:
        result.error ||
        (result.total === 0
          ? "Selected route is missing domain or Note ID."
          : "All bindings failed — check network or sign in again."),
    };
  }
  if (result.warning) {
    return { ...result, ok: true, syncedCount: result.ok, partial: true };
  }
  return { ...result, ok: true, syncedCount: result.ok };
}

function scheduleDebouncedSync() {
  // Không auto-sync khi route cache đổi — browser phụ có thể ghi đè vault 10→7.
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "EXTENSION_SIGN_IN" || msg?.type === "EXTENSION_SIGN_UP") {
    const mode = msg.type === "EXTENSION_SIGN_UP" ? "signup" : "signin";
    void withActiveRuntimeOp(async () => {
      const { identity, data, dataError, dataPending, timing } = await signInWorkspaceDual(
        msg.login ?? msg.email,
        msg.password,
        mode,
      );
      const writes = { [STORAGE_IDENTITY]: identity };
      if (data) writes[STORAGE_AUTH] = data;
      await chrome.storage.local.set(writes);

      // Respond before Hub roster / Data Box — those used to keep "Signing in…" up 10–30s.
      sendResponse({
        ok: true,
        userEmail: identity.user_email,
        userLoginId: identity.user_login_id || null,
        userDisplayLabel:
          identity.user_display_label || identity.user_login_id || identity.user_email || "",
        userId: identity.user_id,
        warning: data
          ? null
          : dataError ||
            "Signed in on Tool Hub. Cookie cloud sync needs Data Box when the project is active.",
      });

      if (timing?.totalMs) {
        console.info("[E0001] sign-in timing", timing);
      }

      const followUps = [];
      followUps.push(
        resolveHubUserModalProfile(identity, data)
          .then(async (profile) => {
            if (!profile) return;
            const nextIdentity = {
              ...identity,
              user_role: profile.userRole,
              user_provider: profile.userProvider,
              user_created_at: profile.userCreatedAt,
              user_last_sign_in_at: profile.userLastSignInAt,
            };
            const nextWrites = { [STORAGE_IDENTITY]: nextIdentity };
            if (data) {
              nextWrites[STORAGE_AUTH] = {
                ...data,
                user_role: profile.userRole,
                user_provider: profile.userProvider,
                user_created_at: profile.userCreatedAt,
                user_last_sign_in_at: profile.userLastSignInAt,
              };
            }
            await chrome.storage.local.set(nextWrites);
          })
          .catch((err) => console.warn("[E0001] profile after sign-in", err)),
      );

      if (dataPending) {
        followUps.push(
          dataPending
            .then(async ({ session: pendingData, error: pendingError }) => {
              if (!pendingData) {
                if (pendingError) console.warn("[E0001] Data Box plane", pendingError);
                return;
              }
              const pendingProfile = await resolveHubUserModalProfile(identity, pendingData).catch(() => null);
              await chrome.storage.local.set({
                [STORAGE_AUTH]: pendingProfile
                  ? {
                      ...pendingData,
                      user_role: pendingProfile.userRole,
                      user_provider: pendingProfile.userProvider,
                      user_created_at: pendingProfile.userCreatedAt,
                      user_last_sign_in_at: pendingProfile.userLastSignInAt,
                    }
                  : pendingData,
              });
              await pullCloudRoutes(pendingData, { force: true, refreshVaultTransport: true }).catch((err) => {
                console.warn("[E0001] pull cloud routes after dataPending", err);
              });
            })
            .catch((err) => console.warn("[E0001] dataPending", err)),
        );
      }

      followUps.push(
        refreshVaultTransport()
          .then(async () => (data ? await getAuth() : null))
          .then((auth) =>
            auth
              ? pullCloudRoutes(auth, { refreshVaultTransport: true }).catch((err) => {
                  console.warn("[E0001] pull cloud routes after sign-in", err);
                  return null;
                })
              : null,
          )
          .catch((err) => console.warn("[E0001] post sign-in follow-ups", err)),
      );

      await Promise.allSettled(followUps);
    }).catch((e) => sendResponse({ ok: false, error: formatSyncError(e) }));
    return true;
  }
  if (msg?.type === "STORE_IDENTITY") {
    chrome.storage.local
      .get(STORAGE_IDENTITY)
      .then(({ [STORAGE_IDENTITY]: prev }) => ({
        access_token: msg.access_token,
        refresh_token: msg.refresh_token,
        expires_at: msg.expires_at,
        supabase_url: msg.supabase_url,
        supabase_anon_key: msg.supabase_anon_key,
        user_id: msg.user_id ?? prev?.user_id ?? null,
        user_email: msg.user_email ?? prev?.user_email ?? null,
      }))
      .then((nextIdentity) =>
        chrome.storage.local.set({
          [STORAGE_IDENTITY]: nextIdentity,
        }),
      )
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "STORE_AUTH") {
    storeAuthFromMessage(msg)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "LOG_OUT") {
    chrome.storage.local
      .remove([
        STORAGE_AUTH,
        STORAGE_IDENTITY,
        STORAGE_BINDINGS,
        STORAGE_SELECTED_BINDING,
        STORAGE_LAST_SYNC,
        STORAGE_LAST_ROUTE_PULL,
      ])
      .then(() => stopVaultRealtime())
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "STORE_SUPABASE") {
    chrome.storage.local
      .get(STORAGE_AUTH)
      .then(({ [STORAGE_AUTH]: prev }) =>
        chrome.storage.local.set({
          [STORAGE_AUTH]: {
            ...(prev ?? {}),
            supabase_url: msg.supabase_url,
            supabase_anon_key: msg.supabase_anon_key,
          },
        }),
      )
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "PATCH_BINDING_PASS") {
    const noteId = String(msg.noteId ?? "").trim();
    const domain = String(msg.domain ?? "").trim();
    const pass = String(msg.pass ?? "");
    getBindings()
      .then((list) => {
        const next = list.map((b) => {
          const match =
            (noteId && b.noteId === noteId) || (domain && b.domain === domain);
          return match ? { ...b, pass, requiresPass: false } : b;
        });
        return chrome.storage.local.set({ [STORAGE_BINDINGS]: next });
      })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "STORE_BINDINGS") {
    const bindings = normalizeExtensionBindings(msg.bindings);
    getBindings()
      .then((prev) => pruneBindingStatusOnStore(bindings, prev))
      .then(() => chrome.storage.local.set({ [STORAGE_BINDINGS]: bindings }))
      .then(() => refreshVaultTransport())
      .then(() => {
        scheduleDebouncedSync();
        sendResponse({ ok: true, count: bindings.length });
      })
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "STORE_PREFS") {
    const prefs = {
      realtimeVaultApply: false,
      bridgeRole: normalizeBridgeRole(msg.bridgeRole),
    };
    chrome.storage.local
      .set({ [STORAGE_PREFS]: prefs })
      .then(() => refreshVaultTransport())
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "SET_SELECTED_BINDING") {
    const noteId = String(msg.noteId ?? "").trim();
    chrome.storage.local
      .set({ [STORAGE_SELECTED_BINDING]: noteId || null })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "SYNC_NOW") {
    const bindingKey = String(msg.bindingKey ?? "").trim();
    if (!bindingKey) {
      sendResponse({
        ok: false,
        error: "Sync requires one route (bindingKey = noteId:domain). Use Sync on a specific route row.",
      });
      return true;
    }
    withActiveRuntimeOp(() => syncAll({ bindingKey, binding: msg.binding ?? null, manual: true }))
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: formatSyncError(e) }));
    return true;
  }
  if (msg?.type === "LOCK_LOAD_COOKIE_TAB") {
    lockLoadCookieTabsForDomain(msg.domain, {
      domain: msg.domain,
      noteTitle: msg.noteTitle,
    })
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: formatSyncError(e) }));
    return true;
  }
  if (msg?.type === "APPLY_VAULT_NOW") {
    withActiveRuntimeOp(() =>
      withTimeout(
        applyVaultAll({
          noteId: msg.noteId,
          bindingKey: msg.bindingKey,
          binding: msg.binding ?? null,
          clearBeforeLoad: msg.clearBeforeLoad === true,
          openSite: msg.openSite !== false,
          refreshTab: msg.refreshTab === true,
          confirmSession: msg.confirmSession !== false,
          activateSite: msg.activateSite !== false,
          ...(Object.prototype.hasOwnProperty.call(msg, "vaultPassOverride")
            ? { vaultPassOverride: msg.vaultPassOverride }
            : {}),
        }),
        POPUP_APPLY_TIMEOUT_MS,
        `Load cookies timed out after ${Math.round(POPUP_APPLY_TIMEOUT_MS / 1000)}s. Reload extension and retry.`,
      ),
    )
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: formatSyncError(e) }));
    return true;
  }
  if (msg?.type === "IMPORT_COOKIE_EDITOR") {
    const domain = msg.domain?.trim() || "";
    suppressVaultUploadUntil = Date.now() + 45_000;
    ensureAuth()
      .then(async () => {
        try {
          await ensureSiteTabForDomain(domain, {
            activate: true,
            forceNavigate: true,
            waitMs: 1200,
            createdDelayMs: 1200,
          });
        } catch (err) {
          console.warn("[E0001] ensure site before paste", err);
        }
        return applyCookieEditorJson(String(msg.jsonText ?? ""));
      })
      .then(async (r) => {
        let storageApplied = 0;
        if (domain && hasNonEmptyAuthStorage(r.storage)) {
          const storageRes = await applySiteAuthStorageForDomain(domain, r.storage).catch(() => null);
          storageApplied = storageRes?.applied ?? 0;
        }
        let tabsRefreshed = 0;
        if (msg.refreshTab !== false && (r.applied > 0 || storageApplied > 0)) {
          tabsRefreshed = await refreshTabsForDomain(domain);
          if (tabsRefreshed === 0) {
            try {
              const ensured = await ensureSiteTabForDomain(domain);
              if (ensured.tabId) {
                await chrome.tabs.reload(ensured.tabId);
                tabsRefreshed = 1;
              }
            } catch {
              /* ignore */
            }
          }
        }
        if (r.applied > 0 || storageApplied > 0) {
          const bindings = filterBindings(await getBindings(), { noteId: msg.noteId });
          if (bindings.length) await recordJarCountsForBindings(bindings);
        }
        const jarAfter = r.applied > 0 || storageApplied > 0 ? (await getCookiesForDomain(domain)).length : 0;
        sendResponse({
          ok: r.applied > 0 || storageApplied > 0,
          tabsRefreshed,
          jarAfter,
          storageApplied,
          decrypted: r.total,
          ...r,
        });
      })
      .catch((e) => sendResponse({ ok: false, error: formatSyncError(e) }));
    return true;
  }
  if (msg?.type === "EXPORT_BROWSER_COOKIES") {
    ensureAuth()
      .then(async () => {
        const bindings = filterBindings(await getBindings(), { noteId: msg.noteId });
        const b = bindings[0];
        if (!b?.domain) throw new Error("Chọn route trước.");
        const cookies = await getCookiesForDomain(b.domain);
        const storage = await captureSiteAuthStorageForDomain(b.domain, {
          ensureTabIfMissing: false,
        }).catch(() => null);
        return sendResponse({
          ok: true,
          json: formatCookiesJson(cookies, storage),
          count: cookies.length,
        });
      })
      .catch((e) => sendResponse({ ok: false, error: formatSyncError(e) }));
    return true;
  }
  if (msg?.type === "EXPORT_VAULT_COOKIES") {
    ensureAuth()
      .then(async (auth) => {
        const bindings = filterBindings(await getBindings(), { noteId: msg.noteId });
        const b = bindings[0];
        if (!b?.noteId) throw new Error("Chọn route có Note ID.");
        const out = await exportVaultCookiesJson(auth, b);
        sendResponse({ ok: true, json: out.json, count: out.count });
      })
      .catch((e) => sendResponse({ ok: false, error: formatSyncError(e) }));
    return true;
  }
  if (msg?.type === "OPEN_BINDING_SITE") {
    const domain = msg.domain?.trim();
    if (!domain) {
      sendResponse({ ok: false, error: "No domain" });
      return true;
    }
    chrome.tabs
      .create({ url: siteUrlForDomain(domain), active: true })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "REFRESH_SESSION") {
    ensureAuth()
      .then((auth) =>
        sendResponse({
          ok: Boolean(auth?.access_token && !isJwtExpired(auth)),
          expired: isJwtExpired(auth),
        }),
      )
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "OPEN_TOOL_COOKIE") {
    const base = msg.url === "prod" ? TOOL_COOKIE_URL_PROD : TOOL_COOKIE_URL_LOCAL;
    const query = String(msg.query ?? "").replace(/^\?/, "");
    const url = query ? `${base}${base.includes("?") ? "&" : "?"}${query}` : base;
    chrome.tabs.create({ url }).then(() => sendResponse({ ok: true, url }));
    return true;
  }
  if (msg?.type === "PULL_CLOUD_ROUTES") {
    withActiveRuntimeOp(() =>
      ensureAuthForRoutePull({ waitMs: 8_000 }).then((auth) =>
        pullCloudRoutes(auth, { force: msg.force === true }),
      ),
    )
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: formatSyncError(e) }));
    return true;
  }
  if (msg?.type === "REQUEST_TOOL_BINDINGS") {
    requestToolBindingsFromOpenTabs()
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "GET_STATUS") {
    withActiveRuntimeOp(() =>
      Promise.all([
        getAuth(),
        getIdentity(),
        getPrefs(),
        getLocal(STORAGE_LAST_ROUTE_PULL, null),
        getBindings(),
        getBindingStatus(),
        getLocal(STORAGE_SELECTED_BINDING, null),
      ]).then(async ([rawAuth, rawIdentity, prefs, lastRoutePull, storedBindings, storedStatus, selectedNoteId]) => {
        if (msg?.light === true) {
          const auth =
            rawAuth?.refresh_token && isJwtExpired(rawAuth)
              ? await refreshAuthIfNeeded(rawAuth, STORAGE_AUTH)
              : rawAuth;
          const identity =
            rawIdentity?.refresh_token && isJwtExpired(rawIdentity)
              ? await refreshAuthIfNeeded(rawIdentity, STORAGE_IDENTITY)
              : rawIdentity;
          const bindings = Array.isArray(storedBindings) ? storedBindings : [];
          const hasSupabase = Boolean(auth?.supabase_url && auth?.supabase_anon_key);
          const hasJwt = Boolean(auth?.access_token);
          const sessionExpired = Boolean(hasJwt && isJwtExpired(auth));
          const hasIdentityJwt = Boolean(identity?.access_token && !isJwtExpired(identity));
          const sessionReady = hasIdentityJwt || (hasSupabase && hasJwt && !sessionExpired);
          const manifest = chrome.runtime.getManifest();
          const modalProfile = jwtUserProfileFromAuth(identity || auth);
          const browserId = await getBrowserId();
          sendResponse({
            light: true,
            linked: sessionReady,
            sessionReady,
            hasBindings: bindings.length > 0,
            hasSupabase,
            hasJwt,
            sessionExpired,
            bindings: bindings.length,
            bindingList: Array.isArray(storedBindings) ? storedBindings : [],
            browserId,
            userId: authUserId(auth) || authUserId(identity) || identity?.user_id || rawIdentity?.user_id || null,
            dataUserId: authUserId(auth) || null,
            hubIdentityUserId: authUserId(identity) || identity?.user_id || rawIdentity?.user_id || null,
            userEmail: jwtEmailFromAuth(auth) || identity?.user_email || rawIdentity?.user_email || null,
            userLoginId: modalProfile.userLoginId || identity?.user_login_id || rawIdentity?.user_login_id || null,
            userDisplayLabel:
              modalProfile.userDisplayLabel ||
              identity?.user_display_label ||
              rawIdentity?.user_display_label ||
              null,
            userFullName: modalProfile.userFullName || null,
            userPhone: modalProfile.userPhone || null,
            userRole: modalProfile.userRole,
            userProvider: modalProfile.userProvider,
            userCreatedAt: modalProfile.userCreatedAt,
            userLastSignInAt: modalProfile.userLastSignInAt,
            hubIdentityEmail: identity?.user_email || rawIdentity?.user_email || null,
            hubIdentityLinked: Boolean(
              identity?.user_email || identity?.user_id || rawIdentity?.user_email || rawIdentity?.user_id,
            ),
            writableRoutes: bindings.filter((b) => sourceLockState(b, browserId, null, auth).canWrite).length,
            bindingStatus: storedStatus && typeof storedStatus === "object" ? storedStatus : {},
            noteSyncedAtByNoteId: {},
            routeUserActivityByKey: {},
            last: (await getLastSync()) ?? null,
            prefs,
            selectedNoteId,
            vaultOnServer: {},
            schemaOk: false,
            routeCloudPull: null,
            lastRoutePull,
            displayWarning: null,
            version: manifest.version,
            dataPending: false,
          });
          return;
        }
        const auth = rawAuth
          ? await refreshAuthIfNeeded(rawAuth, STORAGE_AUTH)
          : null;
      const identity = rawIdentity
        ? await refreshAuthIfNeeded(rawIdentity, STORAGE_IDENTITY)
        : null;
      const hasSupabase = Boolean(auth?.supabase_url && auth?.supabase_anon_key);
      const hasJwt = Boolean(auth?.access_token);
      const sessionExpired = Boolean(hasJwt && isJwtExpired(auth));
      const hasIdentityJwt = Boolean(identity?.access_token && !isJwtExpired(identity));
      const sessionReady = hasIdentityJwt || (hasSupabase && hasJwt && !sessionExpired);
      let routeCloudPull = null;
      if (msg?.pullRoutes === true && hasSupabase && hasJwt && !sessionExpired) {
        routeCloudPull = await pullCloudRoutes(auth).catch((err) => ({
          ok: false,
          error: formatSyncError(err),
        }));
      }
      const bindings = await getBindings();
      const browserId = await getBrowserId();
      const manifest = chrome.runtime.getManifest();
      // RPC vault/sync use anon key — probe even when user JWT expired
      const schemaOk = hasSupabase ? await probeCookieSchemaOk(auth, bindings) : false;
      if (schemaOk) await clearStaleVaultErrors(true);
      let bindingStatus = await getBindingStatus();
      const migrated = migrateBindingStatusKeys(bindingStatus, bindings);
      if (migrated.changed) {
        bindingStatus = migrated.status;
        await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: bindingStatus });
      }
      const vaultOnServer = {};
      if (hasSupabase) {
        await Promise.all(
          bindings.map(async (b) => {
            if (!b.noteId?.trim()) return;
            const key = bindingStatusKey(b);
            vaultOnServer[key] = await probeVaultOnServer(auth, b);
          }),
        );
      }
      const merged = mergeBindingStatusFromVaultMap(bindingStatus, vaultOnServer);
      if (merged.changed) {
        bindingStatus = merged.status;
        await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: bindingStatus });
      }
      let noteSyncedAtByNoteId = {};
      let routeUserActivityByKey = {};
      if (hasSupabase && hasJwt && !sessionExpired) {
        const uid = authUserId(auth);
        noteSyncedAtByNoteId = await fetchNoteSyncedAtMap(auth, bindings);
        routeUserActivityByKey = await fetchRouteUserActivityByKey(auth, bindings, uid);
        const cloudMerged = await mergeNoteSyncedAtIntoBindingStatus(bindings, noteSyncedAtByNoteId);
        if (cloudMerged) {
          bindingStatus = (await getBindingStatus()) ?? bindingStatus;
        }
      }
      const modalProfile = hasIdentityJwt
        ? await resolveHubUserModalProfile(identity, auth)
        : {
            ...jwtUserProfileFromAuth(auth),
            hubIdentityUserId: authUserId(auth) || rawIdentity?.user_id || null,
          };

      sendResponse({
        linked: sessionReady,
        sessionReady,
        hasBindings: bindings.length > 0,
        hasSupabase,
        hasJwt,
        sessionExpired,
        bindings: bindings.length,
        bindingList: bindings,
        browserId,
        userId:
          authUserId(auth) ||
          modalProfile.hubIdentityUserId ||
          rawIdentity?.user_id ||
          null,
        dataUserId: authUserId(auth) || null,
        hubIdentityUserId: modalProfile.hubIdentityUserId || rawIdentity?.user_id || null,
        userEmail: jwtEmailFromAuth(auth) || rawIdentity?.user_email || null,
        userLoginId: modalProfile.userLoginId || rawIdentity?.user_login_id || null,
        userDisplayLabel: modalProfile.userDisplayLabel || rawIdentity?.user_display_label || null,
        userFullName: modalProfile.userFullName || null,
        userPhone: modalProfile.userPhone || null,
        userRole: modalProfile.userRole,
        userProvider: modalProfile.userProvider,
        userCreatedAt: modalProfile.userCreatedAt,
        userLastSignInAt: modalProfile.userLastSignInAt,
        hubIdentityEmail: rawIdentity?.user_email || null,
        hubIdentityLinked: Boolean(rawIdentity?.user_email || rawIdentity?.user_id),
        writableRoutes: bindings.filter((b) => sourceLockState(b, browserId, null, auth).canWrite).length,
        bindingStatus,
        noteSyncedAtByNoteId,
        routeUserActivityByKey,
        last: (await getLastSync()) ?? null,
        prefs,
        selectedNoteId,
        vaultOnServer,
        schemaOk,
        routeCloudPull,
        lastRoutePull,
        displayWarning: computeDisplayWarning(bindingStatus, schemaOk),
        version: manifest.version,
      });
    }),
    )
      .then(() => {
        void checkAndHotReloadFromStealthConsole();
      })
      .catch((e) => sendResponse({ ok: false, error: String(e), bindingList: [] }));
    return true;
  }
  if (msg?.type === "CHECK_HOT_RELOAD") {
    checkAndHotReloadFromStealthConsole(true)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "GET_CURRENT_SITE_INFO") {
    getCurrentSiteCookieInfo(msg.domain)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "CLEAR_CURRENT_SITE_COOKIES") {
    clearSiteCookiesComplete({
      domain: msg.domain,
      tabId: msg.tabId,
      clearStorage: msg.clearStorage !== false,
      reloadTab: msg.reloadTab !== false,
    })
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "STORE_TOTP_CLOCK_OFFSET") {
    const offsetMs = setE0001TotpClockOffsetMs(msg.offsetMs);
    sendResponse({ ok: true, offsetMs });
    return false;
  }
  if (msg?.type === "SYNC_TOTP_CLOCK") {
    syncE0001TotpClock(Boolean(msg.force))
      .then(() =>
        sendResponse({
          ok: true,
          offsetMs: totpClockOffsetMsValue(),
          serverUnixMs: totpNowMs(),
        }),
      )
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "GENERATE_TOTP_CODE") {
    (async () => {
      await syncE0001TotpClock(Boolean(msg.forceSync));
      const nowMs = totpNowMs();
      const code = await generateE0001TotpCode(msg.secret, nowMs);
      const secondsRemaining = e0001TotpSecondsRemaining(30, nowMs);
      sendResponse({
        ok: Boolean(code),
        code,
        secondsRemaining,
        offsetMs: totpClockOffsetMsValue(),
        serverUnixMs: nowMs,
      });
    })().catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "GET_TAB_DOMAINS") {
    chrome.tabs
      .query({})
      .then((tabs) => {
        const domains = new Set();
        for (const tab of tabs) {
          try {
            if (!tab.url?.startsWith("http")) continue;
            const host = new URL(tab.url).hostname;
            if (host && host !== "localhost") domains.add(`.${host.replace(/^www\./, "")}`);
          } catch {
            /* skip */
          }
        }
        sendResponse({ ok: true, domains: [...domains].sort() });
      })
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});

const STEALTH_EXT_API_URL = "http://127.0.0.1:6003/api/extensions";
const HOT_RELOAD_CHECK_MIN_MS = 5_000;
const STORAGE_RELOAD_NONCE = "e0001-stealth-reload-nonce-v1";
let lastHotReloadCheckAt = 0;

function compareSemver(a, b) {
  const pa = String(a || "")
    .replace(/^v/i, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b || "")
    .replace(/^v/i, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

async function checkAndHotReloadFromStealthConsole(force = false) {
  const now = Date.now();
  if (!force && now - lastHotReloadCheckAt < HOT_RELOAD_CHECK_MIN_MS) {
    return { ok: true, skipped: true };
  }
  if (activeLoadCookieLocks.size > 0 || activeRuntimeOpsCount > 0) {
    return { ok: true, busy: true };
  }
  lastHotReloadCheckAt = now;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(STEALTH_EXT_API_URL, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    const currentVersion = chrome.runtime.getManifest()?.version || "0.0.0";
    const remoteReloadNonce = Number(data?.status?.reloadNonce || 0);
    const storedNonceRaw = await getLocal(STORAGE_RELOAD_NONCE, 0);
    const prevReloadNonce = Number(storedNonceRaw || 0);
    let nonceTriggered = false;
    if (remoteReloadNonce > 0) {
      if (prevReloadNonce === 0) {
        await chrome.storage.local.set({ [STORAGE_RELOAD_NONCE]: remoteReloadNonce });
      } else if (remoteReloadNonce > prevReloadNonce) {
        nonceTriggered = true;
      }
    }
    const cb = data?.status?.cookieBridge;
    const cachedEntry = Array.isArray(data?.status?.cached)
      ? data.status.cached.find((e) => e?.storeId === "kaaadageakdandpobcofplmfbjfjabdk")
      : null;
    const candidates = [
      cb?.stageVersion,
      cb?.manifestVersion,
      cb?.workspaceVersion,
      cachedEntry?.version,
    ].filter(Boolean);
    let newestRemote = currentVersion;
    for (const ver of candidates) {
      if (compareSemver(ver, newestRemote) > 0) newestRemote = ver;
    }
    if (
      (nonceTriggered || compareSemver(newestRemote, currentVersion) > 0) &&
      activeLoadCookieLocks.size === 0 &&
      activeRuntimeOpsCount === 0
    ) {
      if (remoteReloadNonce > 0) {
        await chrome.storage.local.set({ [STORAGE_RELOAD_NONCE]: remoteReloadNonce });
      }
      setTimeout(() => {
        if (activeLoadCookieLocks.size > 0 || activeRuntimeOpsCount > 0) return;
        try {
          chrome.runtime.reload();
        } catch {
          /* ignore */
        }
      }, 250);
      return {
        ok: true,
        reloading: true,
        reason: nonceTriggered ? "reload-signal" : "version-bump",
        from: currentVersion,
        to: newestRemote,
      };
    }
    return {
      ok: true,
      reloading: false,
      version: currentVersion,
      remoteVersion: newestRemote,
      reloadNonce: remoteReloadNonce,
    };
  } catch {
    return { ok: false, offline: true };
  }
}

void syncE0001TotpClock();
setTimeout(() => {
  void checkAndHotReloadFromStealthConsole();
}, 3_500);
setInterval(() => {
  void checkAndHotReloadFromStealthConsole();
}, 15_000);
chrome.tabs?.onActivated?.addListener?.(() => {
  void checkAndHotReloadFromStealthConsole();
});

chrome.runtime.onInstalled.addListener(async () => {
  await purgeLegacyExtensionData();
  await clearLegacyRouteAlarms();
  await syncE0001TotpClock(true);
  await refreshVaultTransport();
});

chrome.runtime.onStartup.addListener(async () => {
  await purgeLegacyExtensionData();
  await clearLegacyRouteAlarms();
  await syncE0001TotpClock(true);
  setTimeout(() => {
    void checkAndHotReloadFromStealthConsole(true);
  }, 3_500);
  await refreshVaultTransport();
});
