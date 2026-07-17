import {
  formatSyncError,
  isJwtExpired,
  parseApiErrorBody,
  refreshAuthIfNeeded,
  rpcHeaders,
  signInWorkspaceDual,
  userHeaders,
} from "./auth-session.js";
import {
  applyCookieEditorJson,
  bindingRouteKey,
  exportVaultCookiesJson,
  fetchExistingVaultSummary,
  formatCookiesJson,
  getBrowserId,
  fetchExistingVaultCount,
  loadVaultIntoBrowser,
  pollVaultsAndApply,
  fetchNoteSyncedAtMap,
  fetchRouteUserActivityByKey,
  mergeNoteSyncedAtIntoBindingStatus,
  probeVaultOnServer,
  summarizeCookieNames,
  uploadVaultForBinding,
} from "./vault-api.js";
import { startVaultRealtime, stopVaultRealtime } from "./vault-realtime.js";
import { canUseVault } from "./vault-crypto.js";
import { isSchemaRelatedVaultError, probeCookieSchemaOk } from "./schema-probe.js";
import { resolveHubUserModalProfile } from "./hub-workspace-profile-role.js";
import { E0001_SUPABASE_ANON_KEY, E0001_SUPABASE_URL } from "./supabase-config.js";
import {
  effectiveCookieDomain,
  extraCookieQueryUrls,
  googleMailInboxUrl,
  isFacebookDomain,
  isGoogleDomain,
  isGoogleAuthContextUrl,
  isGoogleMarketingUrl,
  shouldForceNavigateGoogleTab,
  openSiteHintHost,
  relatedCookieDomains,
  siteUrlForDomain,
  tabMatchesRoute,
  urlMatchesCookieDomain,
} from "./domain-routes.js";
import { routeSourceLockState } from "./route-access.js";

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
const TOOL_COOKIE_URL_PROD = "https://databox.infi.io.vn/cookie";
const TOOL_COOKIE_URL_PROD_LEGACY = "https://tool-manager-zeta.vercel.app/?screen=cookie";
const POPUP_APPLY_TIMEOUT_MS = 60000;
const GOOGLE_TAB_WAIT_MS = 6000;
const TAB_OVERLAY_MS = 12000;

let vaultPollTimer = null;
let suppressVaultUploadUntil = 0;
const activeLoadCookieLocks = new Map();

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

function domainNeedsForceNavigate(url, domain, forceNavigate) {
  if (forceNavigate) return true;
  return shouldForceNavigateGoogleTab(url, domain);
}

/** Open/navigate the site before applying cookies; Chrome rejects some writes without context. */
async function ensureSiteTabForDomain(domain, opts = {}) {
  const activate = opts.activate !== false;
  const forceNavigate = opts.forceNavigate === true;
  const waitMs = Math.max(0, Number(opts.waitMs) || 350);
  const createdDelayMs = Math.max(0, Number(opts.createdDelayMs) || waitMs);
  const tabWaitMs = Math.max(0, Number(opts.tabWaitMs) || 12000);
  const tabs = await chrome.tabs.query({});
  const matching = tabs.filter((t) => t.url && tabMatchesRoute(t.url, domain));
  const open = matching[0] ?? null;
  const mustNavigate = open?.url ? domainNeedsForceNavigate(open.url, domain, forceNavigate) : forceNavigate;
  if (open?.id) {
    if (mustNavigate) {
      await chrome.tabs.update(open.id, { url: siteUrlForDomain(domain), active: activate });
      await waitForTabComplete(open.id, tabWaitMs);
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    } else if (activate) {
      await chrome.tabs.update(open.id, { active: true });
    }
    return { tabId: open.id, created: false, navigated: mustNavigate };
  }
  const tab = await chrome.tabs.create({ url: siteUrlForDomain(domain), active: activate });
  await waitForTabComplete(tab.id, tabWaitMs);
  if (createdDelayMs > 0) await new Promise((r) => setTimeout(r, createdDelayMs));
  return { tabId: tab.id, created: true, navigated: true };
}

async function waitForTabComplete(tabId, timeoutMs = 12000) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
  } catch {
    return;
  }
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
  await new Promise((r) => setTimeout(r, 350));
}

/** Reload open tabs for domain (no new tab). Google: navigate to inbox instead of reload marketing URL. */
async function refreshTabsForDomain(domain) {
  const tabs = await chrome.tabs.query({});
  let refreshed = 0;
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !tabMatchesRoute(tab.url, domain)) continue;
    if (isGoogleDomain(domain) && shouldForceNavigateGoogleTab(tab.url, domain)) {
      await chrome.tabs.update(tab.id, { url: googleMailInboxUrl() });
      await waitForTabComplete(tab.id);
      refreshed += 1;
      continue;
    }
    await chrome.tabs.reload(tab.id);
    await waitForTabComplete(tab.id);
    refreshed += 1;
  }
  return refreshed;
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

function maskValue(value) {
  if (!value || value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
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
  return routeSourceLockState(binding, browserId, {
    dataUserId: authUserId(auth),
    hubIdentityUserId: auth?.hubIdentityUserId ?? null,
    userEmail: jwtEmailFromAuth(auth) || auth?.user_email || null,
  }, overrideSourceId);
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

async function clearCookiesForDomain(domain = "") {
  const cookies = await getCookiesForDomain(domain);
  let removed = 0;
  for (const cookie of cookies) {
    const host = (cookie.domain ?? domain).replace(/^\./, "") || openSiteHintHost(domain);
    const scheme = cookie.secure ? "https" : "http";
    const path = cookie.path?.startsWith("/") ? cookie.path : `/${cookie.path ?? ""}`;
    const url = `${scheme}://${host}${path}`;
    try {
      await chrome.cookies.remove({
        url,
        name: cookie.name,
        storeId: cookie.storeId,
      });
      removed += 1;
    } catch (err) {
      console.warn("[E0001] cookie remove", cookie.name, url, err);
    }
  }
  return { ok: true, removed, domain };
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

async function bumpUiTick() {
  await chrome.storage.local.set({ [STORAGE_UI_TICK]: Date.now() });
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

/** Read cookies for a site — needs <all_urls> host permission in manifest. */
async function collectCookiesForSingleScope(rawDomain) {
  const raw = effectiveCookieDomain(String(rawDomain ?? "").trim());
  if (!raw) return [];

  const base = raw.replace(/^\./, "").toLowerCase();
  const hostVariants = [raw, `.${base}`, base, `www.${base}`];

  const byKey = new Map();
  const add = (list) => {
    for (const c of list ?? []) {
      byKey.set(`${c.name}\0${c.domain}\0${c.path}`, c);
    }
  };

  for (const host of hostVariants) {
    try {
      add(await chrome.cookies.getAll({ domain: host }));
      if (!host.startsWith(".")) {
        add(await chrome.cookies.getAll({ domain: `.${host.replace(/^\./, "")}` }));
      }
    } catch (err) {
      console.warn("[E0001] cookies.getAll", host, err);
    }
  }

  const urlVariants = [
    `https://${base}/`,
    `https://www.${base}/`,
    `https://m.${base}/`,
    ...extraCookieQueryUrls(base),
  ];
  for (const url of urlVariants) {
    try {
      add(await chrome.cookies.getAll({ url }));
    } catch (err) {
      console.warn("[E0001] cookies.getAll url", url, err);
    }
  }

  try {
    const all = await chrome.cookies.getAll({});
    for (const c of all) {
      const cd = (c.domain ?? "").replace(/^\./, "").toLowerCase();
      if (cd === base || cd.endsWith(`.${base}`) || base.endsWith(`.${cd}`)) {
        byKey.set(`${c.name}\0${c.domain}\0${c.path}`, c);
      }
    }
  } catch (err) {
    console.warn("[E0001] cookies.getAll all", err);
  }

  return [...byKey.values()];
}

/** Jar for a route — unions related hosts (e.g. .claude.com ↔ .claude.ai ↔ .anthropic.com). */
async function getCookiesForDomain(domain) {
  const scopes = relatedCookieDomains(domain);
  if (!scopes.length) return collectCookiesForSingleScope(domain);

  const byKey = new Map();
  for (const scope of scopes) {
    for (const c of await collectCookiesForSingleScope(scope)) {
      byKey.set(`${c.name}\0${c.domain}\0${c.path}`, c);
    }
  }
  return [...byKey.values()];
}

function jwtEmailFromAuth(auth) {
  if (auth?.user_email) return String(auth.user_email);
  if (!auth?.access_token) return null;
  try {
    const payload = jwtPayload(auth);
    return payload.email ?? payload.user_metadata?.email ?? null;
  } catch {
    return null;
  }
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
  };
}

function jwtPayload(auth) {
  const part = auth?.access_token?.split(".")?.[1];
  if (!part) return {};
  const pad = part + "=".repeat((4 - (part.length % 4)) % 4);
  return JSON.parse(atob(pad.replace(/-/g, "+").replace(/_/g, "/")));
}

function authUserId(auth) {
  return auth?.user_id ?? auth?.user?.id ?? jwtPayload(auth).sub ?? null;
}

function vaultUpdaterLabel(auth, browserId) {
  const email = jwtEmailFromAuth(auth);
  const short = String(browserId ?? "").slice(0, 8);
  return email ? `${email} · ${short}` : short || "unknown";
}

function toSnapshotLines(cookies) {
  return cookies.map((c) => `${c.name} = ${maskValue(c.value)}`);
}

function domainMatchesBinding(cookieDomain, bindingDomain) {
  const b = bindingDomain.replace(/^\./, "").toLowerCase();
  const c = (cookieDomain || "").replace(/^\./, "").toLowerCase();
  return c === b || c.endsWith(`.${b}`) || b.endsWith(`.${c}`);
}

async function rpcSyncCookies(auth, { syncId, pass, domain }, cookies, lines, opts = {}) {
  const url = `${auth.supabase_url}/rest/v1/rpc/note_sync_cookies`;
  const res = await fetch(url, {
    method: "POST",
    headers: rpcHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      p_sync_id: syncId,
      p_pass: pass || null,
      p_snapshot: lines,
      p_domain: domain,
      p_touch_synced_at: opts.manual === true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC ${syncId} ${res.status}: ${parseApiErrorBody(text)}`);
  }
  return { lines: lines.length, cookies: cookies.length };
}

function normalizeRouteDomain(domain = "") {
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

async function recordRouteActivityOnCloud(auth, binding, kind) {
  const noteId = binding?.noteId?.trim();
  const domain = normalizeRouteDomain(binding?.domain);
  if (!auth?.supabase_url || !auth?.access_token || isJwtExpired(auth) || !noteId || !domain) {
    return { ok: false, error: "session_required" };
  }
  const rpc = kind === "sync" ? "cookie_route_record_sync" : "cookie_route_record_load";
  const url = `${auth.supabase_url}/rest/v1/rpc/${rpc}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: userHeaders(auth, { "Content-Type": "application/json" }),
      body: JSON.stringify({ p_note_id: noteId, p_domain: domain }),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok || data?.ok === false) {
      const err = data?.error ?? parseApiErrorBody(text);
      console.warn(`[E0001] record route ${kind}`, res.status, err);
      return { ok: false, error: String(err) };
    }
    await bumpUiTick();
    const at =
      kind === "sync" ? data?.activity?.last_sync_at : data?.activity?.last_load_at;
    if (at) {
      const key = bindingStatusKey(binding);
      if (key) {
        const stored = await chrome.storage.local.get(STORAGE_BINDING_STATUS);
        const status = stored[STORAGE_BINDING_STATUS] ?? {};
        const prev = status[key] ?? {};
        status[key] = {
          ...prev,
          ...(kind === "sync" ? { userSyncedAt: at } : { userLoadedAt: at, loadedAt: at }),
        };
        await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: status });
      }
    }
    return { ok: true, at: at ?? null };
  } catch (err) {
    console.warn(`[E0001] record route ${kind}`, err);
    return { ok: false, error: String(err) };
  }
}

function recordRouteLoadOnCloud(auth, binding) {
  return recordRouteActivityOnCloud(auth, binding, "load");
}

function recordRouteSyncOnCloud(auth, binding) {
  return recordRouteActivityOnCloud(auth, binding, "sync");
}

async function rpcSyncCookiesByNoteId(auth, { noteId, pass, domain }, cookies, lines, opts = {}) {
  const url = `${auth.supabase_url}/rest/v1/rpc/note_sync_cookies_by_note_id`;
  const res = await fetch(url, {
    method: "POST",
    headers: rpcHeaders(auth, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      p_note_id: noteId,
      p_pass: pass || null,
      p_snapshot: lines,
      p_domain: domain,
      p_touch_synced_at: opts.manual === true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC note ${noteId} ${res.status}: ${parseApiErrorBody(text)}`);
  }
  return { lines: lines.length, cookies: cookies.length };
}

function isMissingRpcError(msg) {
  const s = String(msg);
  return (
    s.includes("note_sync_cookies") ||
    s.includes("42883") ||
    s.includes("PGRST202") ||
    s.includes("does not exist")
  );
}

function isJwtPatchable(auth) {
  return Boolean(auth?.access_token && !isJwtExpired(auth));
}

/** RPC by note UUID, else sync_id; fallback JWT PATCH only when RPC missing + fresh session. */
async function rpcSyncBinding(auth, binding, preloadedCookies = null, opts = {}) {
  const domain = binding.domain?.trim();
  const noteId = binding.noteId?.trim();
  const syncId = binding.syncId?.trim();
  const manual = opts.manual === true;
  const cookies = preloadedCookies ?? (await getCookiesForDomain(domain));
  const lines = toSnapshotLines(cookies);
  const payload = {
    cookie_snapshot: lines,
    sync_status: lines.length ? "synced" : "pending",
    domain,
    ...(manual ? { synced_at: new Date().toISOString() } : {}),
  };

  if (noteId) {
    try {
      return await rpcSyncCookiesByNoteId(auth, { ...binding, domain }, cookies, lines, { manual });
    } catch (err) {
      if (isMissingRpcError(err) && isJwtPatchable(auth)) {
        await patchNote(auth, noteId, payload);
        return { lines: lines.length, cookies: cookies.length, mode: "jwt_patch" };
      }
      throw new Error(formatSyncError(err));
    }
  }

  if (syncId) {
    try {
      return await rpcSyncCookies(auth, { ...binding, domain }, cookies, lines, { manual });
    } catch (err) {
      if (isMissingRpcError(err) && noteId && isJwtPatchable(auth)) {
        await patchNote(auth, noteId, payload);
        return { lines: lines.length, cookies: cookies.length, mode: "jwt_patch" };
      }
      throw new Error(formatSyncError(err));
    }
  }

  throw new Error("Binding needs noteId or syncId");
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

async function patchNote(auth, noteId, payload) {
  const url = `${auth.supabase_url}/rest/v1/notes?id=eq.${noteId}`;
  if (!isJwtPatchable(auth)) {
    throw new Error(
      "Session expired — open Cookie sync in Tool and click Link extension again.",
    );
  }
  const res = await fetch(url, {
    method: "PATCH",
    headers: userHeaders(auth, {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(formatSyncError(`Patch ${noteId} ${res.status}: ${parseApiErrorBody(text)}`));
  }
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

async function syncBindingWithVault(auth, b, browserId, prefs, opts = {}) {
  const sourceLock = sourceLockState(b, browserId, opts.sourceBrowserId, auth);
  if (!sourceLock.canWrite) {
    return {
      ok: true,
      lines: 0,
      cookies: 0,
      vault: sourceLock.state,
      vaultError: sourceLock.message,
      sourceLock,
      skippedSync: true,
    };
  }
  const cookies = await getCookiesForDomain(b.domain.trim());
  const r = await rpcSyncBinding(auth, b, cookies, { manual: opts.manual === true });
  const count = cookies.length;
  const currentVaultNames = summarizeCookieNames(cookies);
  const base = { ...r, lines: count, cookies: count, vaultNames: currentVaultNames };
  if (!canUseVault(b)) {
    return { ...base, vault: "skipped" };
  }
  if (opts.uploadVault === false || Date.now() < suppressVaultUploadUntil) {
    return { ...base, vault: "skipped" };
  }
  if (
    isFacebookDomain(b.domain) &&
    currentVaultNames.hasFacebookLogin !== true &&
    opts.allowIncompleteFacebookVault !== true
  ) {
    const existing = await fetchExistingVaultSummary(auth, b, {
      ...(Object.prototype.hasOwnProperty.call(opts, "vaultPassOverride")
        ? { passphrase: opts.vaultPassOverride }
        : {}),
    });
    return {
      ...base,
      vault: "skipped",
      existingVault: existing.exists ? existing.vaultNames : null,
      vaultError: `Guard: Facebook jar missing login cookies (${currentVaultNames.count} cookies: ${currentVaultNames.keyNames.join(", ") || "none"}); skipped vault upload.`,
    };
  }
  if (opts.guardVaultDowngrade) {
    const existing = await fetchExistingVaultCount(auth, b);
    if (existing.exists && count < existing.count) {
      return {
        ...base,
        vault: "skipped",
        vaultError: `Guard: jar ${count} < vault cloud ${existing.count}; skipped auto-upload.`,
      };
    }
  }
  try {
    const updater = vaultUpdaterLabel(auth, browserId);
    const uploadOpts = {};
    if (Object.prototype.hasOwnProperty.call(opts, "vaultPassOverride")) {
      uploadOpts.passphrase = opts.vaultPassOverride;
    }
    const vault = await uploadVaultForBinding(auth, b, cookies, browserId, updater, uploadOpts);
    return {
      ...base,
      vault: vault.promoted === false ? "skipped" : vault.ok ? "uploaded" : vault.reason ?? "skipped",
      vaultCount: vault.storedCount ?? count,
      vaultVersion: vault.vault_version ?? null,
      vaultUpdatedBy: vault.updated_by ?? updater,
      vaultError: vault.promoted === false ? vault.reason : undefined,
    };
  } catch (vaultErr) {
    const vaultError = formatSyncError(vaultErr);
    console.warn("[E0001] vault upload", b.noteId, vaultError);
    let vault = "failed";
    if (/invalid pass/i.test(vaultError)) vault = "pass_mismatch";
    else if (isSchemaRelatedVaultError(vaultError)) {
      const schemaOk = await probeCookieSchemaOk(auth, [b]);
      vault = schemaOk ? "failed" : "rpc_missing";
    }
    return { ...base, vault, vaultError };
  }
}

/** Update Lines column after Load / manual apply — count cookies now in this browser. */
async function recordJarCountsForBindings(bindings) {
  const status = { ...(await getBindingStatus()) };
  for (const b of bindings) {
    const key = bindingStatusKey(b);
    if (!key) continue;
    const jar = await getCookiesForDomain(b.domain);
    const now = new Date().toISOString();
    status[key] = {
      ...(status[key] ?? {}),
      ok: true,
      empty: jar.length === 0,
      lines: jar.length,
      cookies: jar.length,
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
  const firstErr = Object.values(bindingStatus).find((s) => s.ok === false)?.error;
  const schemaOk = await probeCookieSchemaOk(auth, valid);
  const vaultIssues = Object.values(bindingStatus).filter(
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

async function confirmGoogleInboxTab(domain, opts = {}) {
  const ensured = await ensureSiteTabForDomain(domain, {
    activate: opts.activate !== false,
    forceNavigate: true,
    waitMs: 900,
    createdDelayMs: 0,
    tabWaitMs: GOOGLE_TAB_WAIT_MS,
  });
  if (!ensured.tabId) return { ok: false, tabId: null, reason: "no_tab" };
  let tabUrl = "";
  try {
    const tab = await chrome.tabs.get(ensured.tabId);
    tabUrl = tab.url ?? "";
  } catch {
    return { ok: false, tabId: ensured.tabId, reason: "tab_gone" };
  }
  if (isGoogleMarketingUrl(tabUrl)) {
    return { ok: false, tabId: ensured.tabId, reason: "marketing_redirect", url: tabUrl };
  }
  if (!isGoogleAuthContextUrl(tabUrl)) {
    return { ok: false, tabId: ensured.tabId, reason: "unexpected_url", url: tabUrl };
  }
  return { ok: true, tabId: ensured.tabId, url: tabUrl };
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

  if (isGoogleDomain(cleanDomain)) {
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
  const lockTab = async (tabId, binding) => {
    if (!tabId || isGoogleDomain(binding?.domain)) return;
    await showLoadCookieTabOverlay(tabId, binding);
    lockedTabIds.add(tabId);
  };

  const refreshTab = filter.refreshTab === true;
  const confirmSession = filter.confirmSession !== false;
  const openSite = filter.openSite !== false;
  const activateSite = filter.activateSite !== false;
  const googleBindings = bindings.filter((b) => isGoogleDomain(b.domain));
  const nonGoogleBindings = bindings.filter((b) => !isGoogleDomain(b.domain));

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
        const jarAfter = (await getCookiesForDomain(jarScope)).length;
        const target = r.serverCount ?? r.decrypted ?? 0;
        const jarOk = target > 0 && jarAfter >= target;
        const jarGained = jarAfter > jarBefore;
        const loadOk = (r.applied ?? 0) > 0 || jarOk || jarGained;
        if (loadOk) await recordRouteLoadOnCloud(auth, b);
        results.push({
          domain: b.domain,
          noteId: b.noteId,
          ...r,
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
      await recordJarCountsForBindings(bindings);
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
        applied.some((r) => !isGoogleDomain(r.domain) && (r.jarGained || ((r.jarAfter ?? 0) > 0 && (r.decrypted ?? 0) > 0)));
      if (shouldRefreshNonGoogle) {
        await new Promise((r) => setTimeout(r, 400));
        const domains = [...new Set(applied.filter((r) => !isGoogleDomain(r.domain)).map((r) => r.domain).filter(Boolean))];
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
        warning = `Ghi ${n}/${decryptedMax} cookie · jar ${jarAfter}${names ? ` — lỗi: ${names}` : ""}${miss > 0 ? ` (thiếu ${miss})` : ""}`;
      }
      const googleApplied = applied.find((r) => isGoogleDomain(r.domain));
      if (googleApplied?.googleVaultNames && googleApplied.googleVaultNames.hasGoogleLogin !== true) {
        const googleHint =
          "Vault thiếu cookie đăng nhập Google (SID/HSID). Sync lại từ browser đã mở Gmail inbox.";
        warning = warning ? `${warning} ${googleHint}` : googleHint;
      }
      if (googleBindings.length && googleSession && googleSession.ok !== true) {
        const sessionHint =
          googleSession.reason === "marketing_redirect"
            ? "Cookie đã ghi nhưng Gmail vẫn redirect workspace — Sync lại từ browser inbox hoặc dùng cùng Chrome profile."
            : "Không mở được Gmail inbox sau Load — thử Sync lại route `.google.com`.";
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
  if (!bindings.length) {
    return {
      ok: false,
      reason: "no_bindings",
      error: filter.noteId
        ? "No route cache for selected route — Link extension from Cookie sync."
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
  if (result.total > 0 && result.ok === 0) {
    return {
      ok: false,
      reason: "sync_failed",
      error: result.error || "All bindings failed — run APPLY_COOKIE_SYNC.sql or Link extension again.",
      ...result,
    };
  }
  if (result.warning) {
    return { ok: true, partial: true, ...result };
  }
  return { ok: true, ...result };
}

function scheduleDebouncedSync() {
  // Không auto-sync khi route cache đổi — browser phụ có thể ghi đè vault 10→7.
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "EXTENSION_SIGN_IN" || msg?.type === "EXTENSION_SIGN_UP") {
    const mode = msg.type === "EXTENSION_SIGN_UP" ? "signup" : "signin";
    signInWorkspaceDual(msg.login ?? msg.email, msg.password, mode)
      .then(async ({ identity, data, dataError, timing }) => {
        const profile = await resolveHubUserModalProfile(identity, data).catch(() => null);
        const identityWithProfile = profile
          ? {
              ...identity,
              user_role: profile.userRole,
              user_provider: profile.userProvider,
              user_created_at: profile.userCreatedAt,
              user_last_sign_in_at: profile.userLastSignInAt,
            }
          : identity;
        const writes = { [STORAGE_IDENTITY]: identityWithProfile };
        if (data) {
          writes[STORAGE_AUTH] = profile
            ? {
                ...data,
                user_role: profile.userRole,
                user_provider: profile.userProvider,
                user_created_at: profile.userCreatedAt,
                user_last_sign_in_at: profile.userLastSignInAt,
              }
            : data;
        }
        await chrome.storage.local.set(writes);

        // Respond ASAP to avoid popup hanging if service worker is suspended mid-follow-up.
        sendResponse({
          ok: true,
          userEmail: identity.user_email,
          userId: identity.user_id,
          warning: data
            ? null
            : dataError ||
              "Signed in on Tool Hub. Cookie cloud sync needs Data Box when the project is active.",
        });

        if (timing?.totalMs) {
          console.info("[E0001] sign-in timing", timing);
        }

        // Post-response follow-ups (best effort).
        void refreshVaultTransport()
          .then(async () => (data ? await getAuth() : null))
          .then((auth) =>
            auth
              ? pullCloudRoutes(auth, { refreshVaultTransport: true }).catch((err) => {
                  console.warn("[E0001] pull cloud routes after sign-in", err);
                  return null;
                })
              : null,
          )
          .catch((err) => console.warn("[E0001] post sign-in follow-ups", err));
      })
      .catch((e) => sendResponse({ ok: false, error: formatSyncError(e) }));
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
    syncAll({ bindingKey, manual: true })
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
    withTimeout(
      applyVaultAll({
        noteId: msg.noteId,
        bindingKey: msg.bindingKey,
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
        let tabsRefreshed = 0;
        if (msg.refreshTab !== false && r.applied > 0) {
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
        if (r.applied > 0) {
          const bindings = filterBindings(await getBindings(), { noteId: msg.noteId });
          if (bindings.length) await recordJarCountsForBindings(bindings);
        }
        const jarAfter = r.applied > 0 ? (await getCookiesForDomain(domain)).length : 0;
        sendResponse({ ok: r.applied > 0, tabsRefreshed, jarAfter, decrypted: r.total, ...r });
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
        return sendResponse({
          ok: true,
          json: formatCookiesJson(cookies),
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
    const url = msg.url === "prod" ? TOOL_COOKIE_URL_PROD : TOOL_COOKIE_URL_LOCAL;
    chrome.tabs.create({ url }).then(() => sendResponse({ ok: true, url }));
    return true;
  }
  if (msg?.type === "PULL_CLOUD_ROUTES") {
    ensureAuth()
      .then((auth) => pullCloudRoutes(auth))
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
    Promise.all([
      getAuth(),
      getIdentity(),
      getPrefs(),
      getLocal(STORAGE_LAST_ROUTE_PULL, null),
    ]).then(async ([rawAuth, rawIdentity, prefs, lastRoutePull]) => {
      const auth = rawAuth
        ? await refreshAuthIfNeeded(rawAuth, STORAGE_AUTH)
        : null;
      const identity = rawIdentity
        ? await refreshAuthIfNeeded(rawIdentity, STORAGE_IDENTITY)
        : null;
      const selectedNoteId = await getLocal(STORAGE_SELECTED_BINDING, null);
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
    });
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

chrome.runtime.onInstalled.addListener(async () => {
  await purgeLegacyExtensionData();
  await clearLegacyRouteAlarms();
  await refreshVaultTransport();
});

chrome.runtime.onStartup.addListener(async () => {
  await purgeLegacyExtensionData();
  await clearLegacyRouteAlarms();
  await refreshVaultTransport();
});
