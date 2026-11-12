import {
  formatSyncError,
  isJwtExpired,
  refreshAuthIfNeeded,
} from "./auth-session.js";
import {
  bindingRouteKey,
  fetchNoteSyncedAtMap,
  fetchRouteUserActivityByKey,
  getBrowserId,
  loadVaultIntoBrowser,
  mergeNoteSyncedAtIntoBindingStatus,
  probeVaultOnServer,
} from "./vault-api.js";
import { canUseVault } from "./vault-crypto.js";
import {
  effectiveCookieDomain,
  isFacebookDomain,
  isGoogleDomain,
  isGoogleOsidAppDomain,
  openSiteHintHost,
  resolveGoogleOsidApp,
} from "./domain-routes.js";
import {
  applySiteAuthStorageForDomain,
  extractAuthStorageIdentity,
  hasNonEmptyAuthStorage,
} from "./site-auth-storage.js";
import {
  authUserId,
  clearCookiesForDomain,
  confirmGoogleInboxTab,
  ensureSiteTabForDomain,
  getCookiesForDomain,
  recordRouteActivityOnCloud,
  refreshTabsForDomain,
  syncSingleRouteWithVault,
} from "./sync-engine-core.js";

const STORAGE_AUTH = "e0001-bridge-auth-v1";
const STORAGE_IDENTITY = "e0001-hub-identity-v1";
const STORAGE_BINDING_STATUS = "e0001-binding-status-v1";
const STORAGE_LAST_SYNC = "e0001-last-sync";

export const getCookiesForDomainDirect = getCookiesForDomain;

export async function readDirectPopupAuth() {
  const stored = await chrome.storage.local.get([STORAGE_AUTH, STORAGE_IDENTITY]);
  let auth = stored?.[STORAGE_AUTH] ?? null;
  const identity = stored?.[STORAGE_IDENTITY] ?? null;
  if (auth) {
    auth = await refreshAuthIfNeeded(auth, STORAGE_AUTH);
  }
  return { auth, identity };
}

async function getBindingStatusMap() {
  const stored = await chrome.storage.local.get(STORAGE_BINDING_STATUS);
  const map = stored?.[STORAGE_BINDING_STATUS];
  return map && typeof map === "object" ? { ...map } : {};
}

/**
 * Hydrate cloud vault metadata, note `synced_at`, user activity, and `browserId`
 * directly inside the popup when the MV3 Service Worker is unavailable.
 */
export async function hydrateCloudVaultStatusDirect(bindings = []) {
  const browserId = await getBrowserId().catch(() => "");
  const { auth } = await readDirectPopupAuth();
  const statusMap = await getBindingStatusMap();
  if (!auth?.supabase_url || !auth?.supabase_anon_key || !bindings.length) {
    return {
      browserId,
      vaultOnServer: {},
      noteSyncedAtByNoteId: {},
      routeUserActivityByKey: {},
      bindingStatus: statusMap,
    };
  }

  const uid = authUserId(auth);
  const vaultOnServer = {};
  const [, noteSyncedAtByNoteId, routeUserActivityByKey] = await Promise.all([
    Promise.all(
      bindings.map(async (b) => {
        if (!b?.noteId?.trim()) return;
        const key = bindingRouteKey(b);
        if (!key) return;
        vaultOnServer[key] = await probeVaultOnServer(auth, b).catch(() => ({ hasVault: false }));
      }),
    ),
    fetchNoteSyncedAtMap(auth, bindings).catch(() => ({})),
    fetchRouteUserActivityByKey(auth, bindings, uid).catch(() => ({})),
  ]);

  let nextStatus = { ...statusMap };
  let changed = false;
  for (const [key, probe] of Object.entries(vaultOnServer)) {
    if (!probe?.hasVault) continue;
    const prev = nextStatus[key] ?? {};
    const next = { ...prev };
    if (probe.updatedAt && prev.vaultUpdatedAt !== probe.updatedAt) {
      next.vaultUpdatedAt = probe.updatedAt;
      changed = true;
    }
    if (
      typeof probe.cookieCount === "number" &&
      probe.cookieCount >= 0 &&
      prev.vaultCookies !== probe.cookieCount
    ) {
      next.vaultCookies = probe.cookieCount;
      changed = true;
    }
    nextStatus[key] = next;
  }
  if (changed) {
    await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: nextStatus }).catch(() => null);
  }
  const mergedNotes = await mergeNoteSyncedAtIntoBindingStatus(
    bindings,
    noteSyncedAtByNoteId,
  ).catch(() => false);
  if (mergedNotes) {
    nextStatus = await getBindingStatusMap();
  }

  return {
    browserId,
    vaultOnServer,
    noteSyncedAtByNoteId,
    routeUserActivityByKey,
    bindingStatus: nextStatus,
  };
}

/**
 * Direct In-Popup Sync fallback when MV3 Service Worker message transport is unavailable.
 * Delegates all cookie collection, login guards, and vault encryption to `sync-engine-core.js`.
 */
export async function syncBindingDirectFromPopup(binding, opts = {}) {
  try {
    if (!binding?.domain?.trim() || (!binding?.noteId?.trim() && !binding?.syncId?.trim())) {
      return { ok: false, error: "Selected route is missing domain or Note ID." };
    }
    const { auth, identity } = await readDirectPopupAuth();
    if (!auth?.supabase_url || !auth?.supabase_anon_key || !auth?.access_token || isJwtExpired(auth)) {
      return {
        ok: false,
        error: "Data Box session is missing or expired — sign out and sign in again in Cookie Bridge.",
      };
    }

    const browserId = await getBrowserId();
    const key = bindingRouteKey(binding);
    const r = await syncSingleRouteWithVault(auth, binding, browserId, {
      ...opts,
      identity,
      manual: true,
    });

    const bindingStatus = await getBindingStatusMap();
    const prev = bindingStatus[key] ?? {};
    const count = r.cookies ?? r.lines ?? 0;
    const empty = count === 0 && !(r.storageCount > 0);

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
      await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: bindingStatus });
      return {
        ok: true,
        syncedCount: 1,
        total: 1,
        partial: true,
        warning: r.vaultError || r.sourceLock?.message || "Skipped vault overwrite.",
        directFallback: true,
      };
    }

    const pushedAt = new Date().toISOString();
    const actRes = await recordRouteActivityOnCloud(auth, binding, "sync", { persistStatus: false });
    const cloudActivityAt = actRes.at || pushedAt;

    bindingStatus[key] = {
      ...prev,
      ok: true,
      empty,
      lines: r.lines ?? count,
      cookies: count,
      vault: r.vault,
      vaultError: r.vaultError,
      vaultVersion: r.vaultVersion ?? null,
      vaultUpdatedBy: r.vaultUpdatedBy ?? null,
      sourceLock: r.sourceLock,
      storageEmail: r.storageEmail ?? prev.storageEmail ?? null,
      storageUid: r.storageUid ?? prev.storageUid ?? null,
      storageCount: r.storageCount ?? prev.storageCount ?? 0,
      skippedSync: false,
      pushedAt,
      cloudSyncedAt: pushedAt,
      userSyncedAt: cloudActivityAt,
      at: pushedAt,
    };

    let warning = null;
    if (empty) {
      warning = "1 route(s): 0 cookies — open site (↗), log in, then Sync again.";
    }
    if (r.vault === "failed" && r.vaultError) {
      const vWarn = `Vault: ${r.vaultError.slice(0, 120)}`;
      warning = warning ? `${warning} ${vWarn}` : vWarn;
    }

    const summary = {
      mode: "sync_id",
      ok: 1,
      fail: 0,
      total: 1,
      vaultCount: r.vaultCount ?? count,
      warning,
      partial: Boolean(warning),
    };
    await chrome.storage.local.set({
      [STORAGE_BINDING_STATUS]: bindingStatus,
      [STORAGE_LAST_SYNC]: { at: pushedAt, ...summary },
    });

    return {
      ...summary,
      ok: true,
      syncedCount: 1,
      directFallback: true,
    };
  } catch (err) {
    const errorMsg = formatSyncError(err);
    try {
      const key = bindingRouteKey(binding);
      if (key) {
        const bindingStatus = await getBindingStatusMap();
        bindingStatus[key] = {
          ...(bindingStatus[key] ?? {}),
          ok: false,
          error: errorMsg,
          at: new Date().toISOString(),
        };
        await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: bindingStatus });
      }
    } catch {
      /* ignore status write error */
    }
    return { ok: false, reason: "sync_failed", error: errorMsg, directFallback: true };
  }
}

/**
 * Direct In-Popup Vault Load fallback when MV3 Service Worker message transport is unavailable.
 */
export async function applyVaultDirectFromPopup(binding, opts = {}) {
  try {
    if (!binding?.domain?.trim() || !canUseVault(binding)) {
      return { ok: false, error: "Selected route requires a valid domain and Note ID." };
    }
    const { auth } = await readDirectPopupAuth();
    if (!auth?.supabase_url || !auth?.supabase_anon_key || !auth?.access_token || isJwtExpired(auth)) {
      return {
        ok: false,
        error: "Data Box session is missing or expired — sign out and sign in again in Cookie Bridge.",
      };
    }

    const domain = binding.domain.trim();
    const osidApp = resolveGoogleOsidApp(domain);
    const isGoogle = isGoogleDomain(domain) || Boolean(osidApp);
    const clearBeforeLoad = opts.clearBeforeLoad ?? !isGoogle;
    const openSite = opts.openSite !== false;
    const activateSite = opts.activateSite !== false;

    if (clearBeforeLoad) {
      await clearCookiesForDomain(domain);
    }
    if (openSite && !isGoogle) {
      try {
        await ensureSiteTabForDomain(domain, {
          activate: activateSite,
          forceNavigate: true,
          waitMs: 1800,
          createdDelayMs: 1800,
        });
      } catch {
        /* ignore tab ensure error */
      }
    }

    const jarScope = effectiveCookieDomain(domain);
    const jarBefore = (await getCookiesForDomain(jarScope)).length;
    const r = await loadVaultIntoBrowser(auth, binding, {
      clearWatermark: true,
      rounds: 4,
      retryDelayMs: 600,
      requireFacebookLogin: isFacebookDomain(domain),
      ...(Object.prototype.hasOwnProperty.call(opts, "vaultPassOverride")
        ? { passphrase: opts.vaultPassOverride }
        : {}),
    });

    if (!r.ok && (r.reason === "not_found" || r.reason === "empty_vault" || r.reason === "zero_applied")) {
      const hintHost = openSiteHintHost(domain);
      const errText =
        r.reason === "not_found"
          ? "No cloud vault yet — click Sync on the source browser first."
          : r.reason === "empty_vault"
            ? `Empty vault (0 cookies) for ${domain} — open ${hintHost}, sign in, Sync, then Load.`
            : `Could not write cookies (${r.failed ?? 0}/${r.total ?? 0} failed).`;
      return { ok: false, error: errText, directFallback: true };
    }

    let storageApplied = 0;
    if (hasNonEmptyAuthStorage(r.storage)) {
      try {
        await ensureSiteTabForDomain(domain, {
          activate: activateSite,
          forceNavigate: false,
          waitMs: 500,
          createdDelayMs: 1000,
        });
        const storageRes = await applySiteAuthStorageForDomain(domain, r.storage);
        storageApplied = storageRes?.applied ?? 0;
      } catch {
        /* ignore storage apply error */
      }
    }

    const jarAfter = (await getCookiesForDomain(jarScope)).length;
    const target = r.serverCount ?? r.decrypted ?? 0;
    const jarOk = target > 0 && jarAfter >= target;
    const jarGained = jarAfter > jarBefore;
    const loadOk =
      (r.applied ?? 0) > 0 || storageApplied > 0 || r.hasStorage === true || jarOk || jarGained;

    if (!loadOk) {
      const hintHost = openSiteHintHost(domain);
      return {
        ok: false,
        error: r.error || `Load failed — open ${hintHost} and click Load again.`,
        directFallback: true,
      };
    }

    const actRes = await recordRouteActivityOnCloud(auth, binding, "load", { persistStatus: false });
    const loadedAt = actRes.at || new Date().toISOString();
    const key = bindingRouteKey(binding);
    const stId = extractAuthStorageIdentity(r.storage);
    const bindingStatus = await getBindingStatusMap();
    if (key) {
      bindingStatus[key] = {
        ...(bindingStatus[key] ?? {}),
        ok: true,
        empty: jarAfter === 0 && !(stId.storageCount > 0),
        lines: jarAfter,
        cookies: jarAfter,
        storageEmail: stId.email || null,
        storageUid: stId.uid || null,
        storageCount: stId.storageCount || 0,
        jarAt: loadedAt,
        loadedAt,
        userLoadedAt: loadedAt,
      };
      await chrome.storage.local.set({ [STORAGE_BINDING_STATUS]: bindingStatus });
    }

    let tabsRefreshed = 0;
    let googleSession = null;
    if (isGoogle && opts.skipGoogleTabConfirm !== true) {
      googleSession = await confirmGoogleInboxTab(domain, { activate: activateSite });
      if (googleSession.tabId) tabsRefreshed += 1;
    } else {
      if (opts.skipRefreshDelay !== true) {
        await new Promise((res) => setTimeout(res, 350));
      }
      tabsRefreshed = await refreshTabsForDomain(domain);
    }

    const applied = r.applied ?? 0;
    const decrypted = r.decrypted ?? r.total ?? applied;
    const effective = Math.max(applied, jarAfter);
    const failedNames = r.failedNames ?? [];
    let warning = null;
    if (effective < decrypted) {
      const miss = decrypted - effective;
      const names = failedNames.slice(0, 5).join(", ");
      warning = `Wrote ${applied}/${decrypted} cookies · jar ${jarAfter}${names ? ` — failed: ${names}` : ""}${miss > 0 ? ` (missing ${miss})` : ""}`;
    }
    if (isGoogle && googleSession && googleSession.ok !== true) {
      const sessionHint = osidApp
        ? `Could not confirm ${osidApp.label} session on ${osidApp.primaryHost} after Load — sign in on the source browser and Sync again.`
        : "Could not confirm Gmail inbox after Load — try syncing `.google.com` again.";
      warning = warning ? `${warning} ${sessionHint}` : sessionHint;
    }

    return {
      ok: isGoogle && googleSession ? googleSession.ok === true : true,
      partial: Boolean(warning),
      applied,
      total: r.total ?? decrypted,
      decrypted,
      failedNames,
      vaultStale: Boolean(r.vaultStale || r.partial),
      warning,
      routes: 1,
      tabsRefreshed,
      jarAfter,
      googleSession,
      directFallback: true,
    };
  } catch (err) {
    return { ok: false, error: formatSyncError(err), directFallback: true };
  }
}

/**
 * Bulk Direct Sync from Popup across multiple selected routes (sequential, shared auth check).
 */
export async function syncMultipleBindingsDirectFromPopup(bindings, opts = {}) {
  const list = (Array.isArray(bindings) ? bindings : []).filter(
    (b) => b?.domain?.trim() && (b?.noteId?.trim() || b?.syncId?.trim()),
  );
  if (!list.length) {
    return { ok: false, error: "Select at least one route to sync.", directFallback: true };
  }
  const { auth } = await readDirectPopupAuth();
  if (!auth?.supabase_url || !auth?.supabase_anon_key || !auth?.access_token || isJwtExpired(auth)) {
    return {
      ok: false,
      error: "Data Box session is missing or expired — sign out and sign in again in Cookie Bridge.",
      directFallback: true,
    };
  }

  let syncedCount = 0;
  let skippedCount = 0;
  let failCount = 0;
  const warnings = [];
  const errors = [];

  for (const b of list) {
    const res = await syncBindingDirectFromPopup(b, opts);
    if (res?.ok) {
      if (res.partial && res.warning && /Guard:|Skipped/i.test(res.warning)) {
        skippedCount += 1;
        warnings.push(`${b.noteTitle || b.domain}: ${res.warning}`);
      } else {
        syncedCount += 1;
        if (res.warning) warnings.push(`${b.noteTitle || b.domain}: ${res.warning}`);
      }
    } else {
      failCount += 1;
      if (res?.error) errors.push(`${b.noteTitle || b.domain}: ${res.error}`);
    }
  }

  const pushedAt = new Date().toISOString();
  const warningText = [...warnings, ...errors].slice(0, 3).join(" · ") || null;
  const summary = {
    mode: "sync_id",
    ok: syncedCount,
    fail: failCount,
    skipped: skippedCount,
    total: list.length,
    warning: warningText,
    partial: failCount > 0 || skippedCount > 0 || warnings.length > 0,
  };
  await chrome.storage.local.set({ [STORAGE_LAST_SYNC]: { at: pushedAt, ...summary } });

  return {
    ...summary,
    ok: syncedCount > 0 || (skippedCount > 0 && failCount === 0),
    syncedCount,
    skippedCount,
    failCount,
    error: syncedCount === 0 && skippedCount === 0 ? errors[0] || "Bulk sync failed." : null,
    directFallback: true,
  };
}

/**
 * Bulk Direct Load from Popup across multiple selected routes (applies cookies + web storage without spawning tabs).
 */
export async function applyMultipleVaultsDirectFromPopup(bindings, opts = {}) {
  const list = (Array.isArray(bindings) ? bindings : []).filter(
    (b) => b?.domain?.trim() && (b?.noteId?.trim() || b?.syncId?.trim()),
  );
  if (!list.length) {
    return { ok: false, error: "Select at least one route to load.", directFallback: true };
  }
  const { auth } = await readDirectPopupAuth();
  if (!auth?.supabase_url || !auth?.supabase_anon_key || !auth?.access_token || isJwtExpired(auth)) {
    return {
      ok: false,
      error: "Data Box session is missing or expired — sign out and sign in again in Cookie Bridge.",
      directFallback: true,
    };
  }

  let appliedRoutes = 0;
  let appliedCookies = 0;
  let failCount = 0;
  const warnings = [];
  const errors = [];

  for (const b of list) {
    const isGoogle = isGoogleDomain(b.domain) || isGoogleOsidAppDomain(b.domain);
    const res = await applyVaultDirectFromPopup(b, {
      clearBeforeLoad: opts.clearBeforeLoad ?? !isGoogle,
      openSite: false,
      activateSite: false,
      skipGoogleTabConfirm: true,
      skipRefreshDelay: true,
      vaultPassOverride: opts.vaultPassOverride ?? "",
    });
    if (res?.ok) {
      appliedRoutes += 1;
      appliedCookies += Number(res.applied || 0);
      if (res.warning) warnings.push(`${b.noteTitle || b.domain}: ${res.warning}`);
    } else {
      failCount += 1;
      if (res?.error) errors.push(`${b.noteTitle || b.domain}: ${res.error}`);
    }
  }

  const warningText = [...warnings, ...errors].slice(0, 3).join(" · ") || null;
  return {
    ok: appliedRoutes > 0,
    appliedRoutes,
    appliedCookies,
    failCount,
    total: list.length,
    partial: failCount > 0 || warnings.length > 0,
    warning: warningText,
    error: appliedRoutes === 0 ? errors[0] || "No vaults could be loaded for selected routes." : null,
    directFallback: true,
  };
}
