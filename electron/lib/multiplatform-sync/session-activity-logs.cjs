"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  resolveVaultConfig,
  resolveScopedVaultUserId,
} = require("../twofa-vault-bridge.cjs");
const { emitStealthLiveSyncEvent } = require("./service-cookie-matchers.cjs");

const _stealthRowSessionLogDedup = new Map();
const _stealthProfileLaunchSessionByCode = new Map();
const _stealthRowLaunchLogState = new Map();

function markStealthProfileLaunchWindowState(code, isLiveWindow) {
  const cleanCode = String(code || "").trim() ? String(code).trim().padStart(4, "0") : "";
  if (!cleanCode) return "";
  const now = Date.now();
  const cur = _stealthProfileLaunchSessionByCode.get(cleanCode);
  if (isLiveWindow) {
    if (!cur || !cur.live) {
      const sessionId = `${cleanCode}:${now}`;
      _stealthProfileLaunchSessionByCode.set(cleanCode, {
        sessionId,
        startedAt: now,
        closedAt: 0,
        live: true,
      });
      return sessionId;
    }
    cur.live = true;
    cur.closedAt = 0;
    return cur.sessionId;
  }
  if (cur) {
    cur.live = false;
    cur.closedAt = now;
    return cur.sessionId;
  }
  return "";
}

function resolveStealthProfileLaunchSessionId(code, isLiveWindow = false) {
  const cleanCode = String(code || "").trim() ? String(code).trim().padStart(4, "0") : "";
  if (!cleanCode) return "default";
  if (isLiveWindow) {
    return markStealthProfileLaunchWindowState(cleanCode, true);
  }
  const now = Date.now();
  const cur = _stealthProfileLaunchSessionByCode.get(cleanCode);
  if (cur) {
    if (cur.live || (cur.closedAt > 0 && now - cur.closedAt <= 30_000) || now - cur.startedAt <= 120_000) {
      return cur.sessionId;
    }
  }
  const sessionId = `${cleanCode}:${now}`;
  _stealthProfileLaunchSessionByCode.set(cleanCode, {
    sessionId,
    startedAt: now,
    closedAt: 0,
    live: false,
  });
  return sessionId;
}

function shouldEmitStealthRowSessionLog(rowId, message, cooldownMs = 60_000) {
  const id = String(rowId || "").trim();
  const msg = String(message || "").trim();
  if (!id || !msg) return false;
  const now = Date.now();
  const key = `${id}|${msg}`;
  const prevAt = _stealthRowSessionLogDedup.get(key) || 0;
  if (now - prevAt < cooldownMs) return false;
  _stealthRowSessionLogDedup.set(key, now);
  if (_stealthRowSessionLogDedup.size > 4000) {
    const firstKey = _stealthRowSessionLogDedup.keys().next().value;
    if (firstKey) _stealthRowSessionLogDedup.delete(firstKey);
  }
  return true;
}

function resolveStealthRowLaunchLogDecision(
  rowId,
  code,
  message,
  { isLiveWindow = false, nowIso = new Date().toISOString() } = {},
) {
  const id = String(rowId || "").trim();
  const msg = String(message || "").trim();
  if (!id || !msg) return { shouldEmit: false, replaceAt: null, sessionId: "" };
  const sessionId = resolveStealthProfileLaunchSessionId(code, isLiveWindow);
  const prev = _stealthRowLaunchLogState.get(id);
  if (prev && prev.sessionId === sessionId) {
    if (prev.message === msg) {
      return { shouldEmit: false, replaceAt: null, sessionId };
    }
    const replaceAt = prev.at || null;
    _stealthRowLaunchLogState.set(id, {
      sessionId,
      at: nowIso,
      message: msg,
      updatedAt: Date.now(),
    });
    return { shouldEmit: true, replaceAt, sessionId };
  }
  if (!shouldEmitStealthRowSessionLog(id, msg, 60_000)) {
    return { shouldEmit: false, replaceAt: null, sessionId };
  }
  _stealthRowLaunchLogState.set(id, {
    sessionId,
    at: nowIso,
    message: msg,
    updatedAt: Date.now(),
  });
  if (_stealthRowLaunchLogState.size > 4000) {
    const firstKey = _stealthRowLaunchLogState.keys().next().value;
    if (firstKey) _stealthRowLaunchLogState.delete(firstKey);
  }
  return { shouldEmit: true, replaceAt: null, sessionId };
}

function formatStealthSessionLogMessage({
  code = "",
  service = "",
  account = "",
  status = "",
  resultCode = "",
  specificLabelText = "",
  customText = "",
} = {}) {
  const cleanCode = String(code || "").trim() ? String(code).trim().padStart(4, "0") : "";
  const prefix = cleanCode ? `#${cleanCode}` : "Profile";
  const svcLabel = String(service || "").trim();
  const acctLabel = String(account || "").trim();
  const targetIdentity =
    svcLabel && acctLabel
      ? `${svcLabel} (${acctLabel})`
      : svcLabel || acctLabel || "Account";
  const custom = String(customText || "")
    .trim()
    .replace(/^Stealth\s+(?=#\d{1,4}\b)/i, "");
  if (custom) {
    if (/^#\d{1,4}\s*·\s*[^—]+—/.test(custom)) {
      return custom.replace(/(\s*—\s*.+?)\s+·\s+/g, "$1: ").slice(0, 220);
    }
    const strippedCustom = custom
      .replace(/^(?:Stealth\s+)?(?:#\d{1,4}\s*·\s*)?/i, "")
      .replace(/\s+·\s+/g, ": ")
      .trim();
    const cleanedCustom = acctLabel
      ? strippedCustom.replace(
          new RegExp(`\\s+manager\\s+${acctLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
          " manager"
        )
      : strippedCustom;
    return `${prefix} · ${targetIdentity} — ${cleanedCustom}`.slice(0, 220);
  }
  const st = String(status || "").trim().toLowerCase();
  const rc = String(resultCode || "").trim();
  const spec = String(specificLabelText || "")
    .replace(/^[\p{Extended_Pictographic}\s️‍]+/u, "")
    .trim();
  if (st === "logged_in") {
    return `${prefix} · ${targetIdentity} — ✅ Logged In`.slice(0, 220);
  }
  if (st === "challenged") {
    const detail = spec || rc || "verification required";
    return `${prefix} · ${targetIdentity} — ⚠️ Challenged (${detail})`.slice(0, 220);
  }
  if (st === "skipped" || st === "quarantined_sms") {
    const detail = spec || rc || "awaiting new method";
    return `${prefix} · ${targetIdentity} — ⏭️ Skipped (${detail})`.slice(0, 220);
  }
  if (st === "not_logged_in" || st === "pending") {
    const detail = spec || rc || "login_page";
    return `${prefix} · ${targetIdentity} — ⏳ Pending (${detail})`.slice(0, 220);
  }
  return "";
}

/**
 * Strictly resolve ONLY the exact `twofa_accounts` row(s) on a profile that an activity log
 * belongs to. Never broadcasts a single-service/single-account activity to unrelated services
 * sharing the same Stealth browser profile.
 */
function filterActivityTargetRowsOnProfile(
  rows = [],
  { text = "", source = "", meta = {} } = {},
) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const explicitRowId = String(meta?.rowId || meta?.accountId || "").trim();
  if (explicitRowId) {
    return rows.filter((r) => String(r?.id || "") === explicitRowId);
  }

  const cleanText = String(text || "").trim();
  const textLower = cleanText.toLowerCase();
  const srcLower = String(source || meta?.source || "").trim().toLowerCase();
  const explicitService = String(meta?.service || "").trim().toLowerCase();
  const explicitAccount = String(meta?.account || meta?.email || "").trim().toLowerCase();

  // Extract any email addresses mentioned in the activity log text
  const mentionedEmails = Array.from(
    new Set(
      (cleanText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []).map((e) =>
        e.toLowerCase(),
      ),
    ),
  );
  if (explicitAccount && !mentionedEmails.includes(explicitAccount)) {
    mentionedEmails.unshift(explicitAccount);
  }

  // Case 1: Google One Family / Google Support activity (`g1-family-invite`, `G1 Family`, `G1 Support`)
  const isGoogleOneFamilyActivity =
    srcLower.includes("g1-family") ||
    srcLower.includes("g1_family") ||
    srcLower.includes("google-one") ||
    /\b(g1\s+(?:family|support)|google\s+one|family\.google|g\.co\/verify)\b/i.test(cleanText);

  if (isGoogleOneFamilyActivity) {
    const g1Rows = rows.filter(
      (r) => String(r?.service || "").trim().toLowerCase() === "google one",
    );
    const gmailRows = rows.filter(
      (r) => String(r?.service || "").trim().toLowerCase() === "gmail",
    );
    const candidatePool = g1Rows.length > 0 ? g1Rows : gmailRows;
    if (candidatePool.length === 0) return [];
    if (mentionedEmails.length > 0) {
      const exactAcctMatches = candidatePool.filter((r) =>
        mentionedEmails.includes(String(r?.account || "").trim().toLowerCase()),
      );
      if (exactAcctMatches.length > 0) return exactAcctMatches;
    }
    // When the log mentions a customer member email being invited by this profile's Family Manager,
    // bind strictly to the single Google One (or Gmail) row on this profile.
    return candidatePool.length === 1 ? candidatePool : [];
  }

  // Case 2: Match explicit service or service mentioned in text/source
  let serviceMatchedRows = rows;
  if (explicitService) {
    serviceMatchedRows = rows.filter(
      (r) => String(r?.service || "").trim().toLowerCase() === explicitService,
    );
  } else {
    const byMentionedService = rows.filter((r) => {
      const svc = String(r?.service || "").trim().toLowerCase();
      if (!svc) return false;
      return textLower.includes(svc) || srcLower.includes(svc.replace(/\s+/g, "-")) || srcLower.includes(svc.replace(/\s+/g, ""));
    });
    if (byMentionedService.length > 0) {
      serviceMatchedRows = byMentionedService;
    } else {
      serviceMatchedRows = [];
    }
  }

  // Case 3: Match by account/email on the profile
  const accountMatchedRows = rows.filter((r) => {
    const acct = String(r?.account || "").trim().toLowerCase();
    if (!acct) return false;
    if (explicitAccount && acct === explicitAccount) return true;
    if (mentionedEmails.includes(acct)) return true;
    return acct.length >= 4 && textLower.includes(acct);
  });

  if (serviceMatchedRows.length > 0 && accountMatchedRows.length > 0) {
    return serviceMatchedRows.filter((r) => accountMatchedRows.includes(r));
  }
  if (serviceMatchedRows.length > 0) {
    // If an explicit account/email was mentioned in the log but did NOT match any row on this profile, do not attach to another account!
    if (mentionedEmails.length > 0 || explicitAccount) return [];
    // Only bind when there is a single unambiguous row for that service on the profile
    return serviceMatchedRows.length === 1 ? serviceMatchedRows : [];
  }
  if (accountMatchedRows.length > 0) {
    if (accountMatchedRows.length === 1) return accountMatchedRows;
    // Prefer the identity Mail row if only an email address was specified without a service name
    const mailMatches = accountMatchedRows.filter((r) =>
      /^(gmail|outlook|hotmail|icloud|yahoo|proton|zoho|gmx|yandex)/i.test(String(r?.service || "").trim()),
    );
    return mailMatches.length === 1 ? mailMatches : [];
  }

  // Unscoped profile log with no identifiable service or account -> do NOT spam all rows on the profile
  return [];
}

async function appendStealthSessionLogToP0020Row({
  cfg,
  headers,
  accountId,
  at = new Date().toISOString(),
  message = "",
  origin = "p0003:stealth",
} = {}) {
  const cleanId = String(accountId || "").trim();
  const cleanMsg = String(message || "").trim();
  if (!cfg?.url || !headers || !cleanId || !cleanMsg) return false;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/twofa_insert_vault_log_entries`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_account_id: cleanId,
        p_entries: [
          {
            at,
            message: cleanMsg,
            origin,
          },
        ],
      }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function syncProfileActivityLogToP0020Rows({
  profileCode = "",
  profileId = null,
  text = "",
  source = "p0003:stealth",
  meta = {},
  at = new Date().toISOString(),
} = {}) {
  const rawCode = String(profileCode || "").trim();
  const m = rawCode.match(/\b(\d{1,4})\b/);
  if (!m) return { ok: false, reason: "invalid_profile_code", patchedCount: 0 };
  const code = m[1].padStart(4, "0");
  if (/^9\d{3}$/.test(code)) {
    return { ok: true, skipped: "ephemeral_agent_pool_9xxx", profileCode: code, patchedCount: 0 };
  }
  const cleanText = String(text || "").trim();
  if (!cleanText) return { ok: false, reason: "empty_text", patchedCount: 0 };

  // Zero-IO Pre-Flight 1: Ignore generic window open/close lifecycle events (0ms, zero DB/network calls)
  if (/^(?:🟢|⚪)?\s*Window\s+(?:opened|closed)\b/i.test(cleanText)) {
    return { ok: true, skipped: "window_lifecycle_ignored", profileCode: code, patchedCount: 0 };
  }

  // Zero-IO Pre-Flight 2: Skip intermediate running/polling progress steps unless explicitly forced
  const stageLower = String(meta?.stage || meta?.status || "").trim().toLowerCase();
  if (
    meta?.forceVaultLog !== true &&
    (stageLower === "running" || stageLower === "waiting" || /^(?:💬|🔍|⏳)\s/.test(cleanText))
  ) {
    return { ok: true, skipped: "transient_running_step", profileCode: code, patchedCount: 0 };
  }

  // Zero-IO Pre-Flight 3: Skip completely unscoped logs before making any Supabase network request
  const hasExplicitScope = Boolean(
    meta?.rowId ||
      meta?.accountId ||
      meta?.service ||
      meta?.account ||
      meta?.email ||
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(cleanText) ||
      /\b(g1\s+(?:family|support)|google\s+one|gmail|outlook|hotmail|facebook|tiktok|youtube|chatgpt|claude|gemini|cursor|github|twitter|elevenlabs|canva|capcut|suno|higgsfield|kling|heygen|kalodata)\b/i.test(
        `${cleanText} ${source}`,
      ),
  );
  if (!hasExplicitScope) {
    return { ok: true, skipped: "pre_flight_unscoped", profileCode: code, patchedCount: 0 };
  }

  let cfg;
  let userId;
  try {
    cfg = resolveVaultConfig();
    const scoped = await resolveScopedVaultUserId();
    userId = scoped.userId;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), patchedCount: 0 };
  }
  if (!cfg?.url || !cfg?.key || !userId) {
    return { ok: false, reason: "missing_vault_config", patchedCount: 0 };
  }

  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
  };

  const variants = [...new Set([code, String(Number(code))])];
  const inClause = variants.map((v) => `"${v}"`).join(",");
  const queryUrl = `${cfg.url}/rest/v1/twofa_accounts?select=id,service,account,browser,status,note,stealth_snapshot,stealth_checked_at&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&browser=in.(${encodeURIComponent(inClause)})&limit=50`;

  let rows = [];
  try {
    const res = await fetch(queryUrl, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { ok: false, reason: `http_${res.status}`, patchedCount: 0 };
    rows = await res.json();
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), patchedCount: 0 };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: true, patchedCount: 0 };
  }

  const targetRows = filterActivityTargetRowsOnProfile(rows, {
    text: cleanText,
    source,
    meta,
  });
  if (targetRows.length === 0) {
    return { ok: true, skipped: "unscoped_activity_log", profileCode: code, patchedCount: 0 };
  }

  const patchedRows = [];
  await Promise.all(
    targetRows.map(async (row) => {
      const logMessage = formatStealthSessionLogMessage({
        code,
        service: row.service,
        account: row.account,
        customText: cleanText,
      });
      if (!row?.id || !logMessage || !shouldEmitStealthRowSessionLog(row.id, logMessage, 45_000)) return;
      try {
        const pRes = await fetch(
          `${cfg.url}/rest/v1/twofa_accounts?id=eq.${encodeURIComponent(row.id)}&user_id=eq.${encodeURIComponent(userId)}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              log_tip_at: at,
              log_tip_message: logMessage,
              updated_at: at,
            }),
            signal: AbortSignal.timeout(6000),
          },
        );
        if (pRes.ok) {
          await appendStealthSessionLogToP0020Row({
            cfg,
            headers,
            accountId: row.id,
            at,
            message: logMessage,
            origin: source || "p0003:stealth",
          });
          patchedRows.push({
            ...row,
            _sessionLogEntry: {
              at,
              message: logMessage,
              origin: source || "p0003:stealth",
            },
          });
        }
      } catch {
        /* ignore transient network error */
      }
    }),
  );

  if (patchedRows.length > 0) {
    emitStealthLiveSyncEvent({
      profileCode: code,
      profileId: profileId || null,
      source: source || "p0003_activity_log",
      timestamp: at,
      patchedCount: patchedRows.length,
      rows: patchedRows.map((r) => ({
        rowId: r.id,
        code,
        service: r.service,
        account: r.account,
        stealthSnapshot: r.stealth_snapshot,
        logEntry: r._sessionLogEntry,
      })),
    });
  }

  return {
    ok: true,
    profileCode: code,
    patchedCount: patchedRows.length,
    patchedRowIds: patchedRows.map((r) => r.id),
  };
}

/**
 * Proposal 3 (`ok 3` — Instant Real-Time SSE Broadcast of Window Launch / Stop (`live_cdp: true/false` & `debug_port`)):
 * Immediately updates `stealth_snapshot.live_cdp` & `debug_port` on P0020 `twofa_accounts` rows for `profileCode`
 * and broadcasts via `emitStealthLiveSyncEvent` at the exact moment `sessionManager` launches or closes a profile
 * (`< 100ms` latency before the first page even finishes loading).
 */
async function syncProfileWindowLiveCdpStateToP0020({
  profileCode,
  profileId = null,
  userDataDir = null,
  liveCdp = false,
  debugPort = 0,
  source = "p0003_window_lifecycle",
} = {}) {
  const rawCode = String(profileCode || "").trim();
  const m = rawCode.match(/\b(\d{1,4})\b/);
  if (!m) return { ok: false, reason: "invalid_profile_code", patchedCount: 0, rows: [] };
  const code = m[1].padStart(4, "0");
  if (/^9\d{3}$/.test(code)) {
    return { ok: true, skipped: "ephemeral_agent_pool_9xxx", profileCode: code, patchedCount: 0, rows: [] };
  }
  const cleanDebugPort = Number.isFinite(Number(debugPort)) && Number(debugPort) > 0 ? Number(debugPort) : 0;
  const isLiveWindow = Boolean(liveCdp && cleanDebugPort > 0);
  markStealthProfileLaunchWindowState(code, isLiveWindow);

  if (!isLiveWindow && !/startup-reconciled|opening-stale/i.test(String(source || ""))) {
    const rawCloseDir =
      userDataDir ||
      (profileId &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(profileId)) &&
      fs.existsSync(path.join("D:\\StealthBrowser\\profiles", String(profileId), "Default"))
        ? path.join("D:\\StealthBrowser\\profiles", String(profileId))
        : null);
    const resolvedDir = rawCloseDir
      ? String(rawCloseDir).replace(/[\\/]p0003-agent-shadow(?=[\\/])/i, "")
      : null;
    if (resolvedDir) {
      const closeSyncTimer = setTimeout(() => {
        const { syncProfilePlatformsToP0020IfChanged } = require("../stealth-multiplatform-sync.cjs");
        void syncProfilePlatformsToP0020IfChanged({
          userDataDir: resolvedDir,
          profileCode: code,
          profileId,
          source: "p0003_window_close_sync",
          liveCdp: false,
          debugPort: 0,
        }).catch(() => undefined);
      }, 1200);
      if (typeof closeSyncTimer.unref === "function") closeSyncTimer.unref();
    }
  }

  let cfg;
  let userId;
  try {
    cfg = resolveVaultConfig();
    const scoped = await resolveScopedVaultUserId();
    userId = scoped.userId;
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), patchedCount: 0, rows: [] };
  }
  if (!cfg?.url || !cfg?.key || !userId) {
    return { ok: false, reason: "missing_vault_config", patchedCount: 0, rows: [] };
  }

  const headers = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    "Content-Type": "application/json",
  };

  const variants = [...new Set([code, String(Number(code))])];
  const inClause = variants.map((v) => `"${v}"`).join(",");
  const queryUrl = `${cfg.url}/rest/v1/twofa_accounts?select=id,service,account,browser,status,note,stealth_snapshot,stealth_checked_at&user_id=eq.${encodeURIComponent(userId)}&deleted_at=is.null&browser=in.(${encodeURIComponent(inClause)})&limit=100`;

  let rows = [];
  try {
    const res = await fetch(queryUrl, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return { ok: false, reason: `http_${res.status}`, patchedCount: 0, rows: [] };
    rows = await res.json();
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err), patchedCount: 0, rows: [] };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: true, patchedCount: 0, rows: [] };
  }

  const nowIso = new Date().toISOString();
  const rowsToPatch = rows.filter((row) => {
    const curSnap = row?.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : null;
    if (isLiveWindow) {
      return !curSnap?.live_cdp || Number(curSnap?.debug_port || 0) !== cleanDebugPort;
    }
    return Boolean(curSnap?.live_cdp);
  });

  if (rowsToPatch.length === 0) {
    return { ok: true, patchedCount: 0, rows: [] };
  }

  const patchedRows = [];
  await Promise.all(
    rowsToPatch.map(async (row) => {
      const svc = String(row.service || "").trim();
      const curSnap = row?.stealth_snapshot && typeof row.stealth_snapshot === "object" ? row.stealth_snapshot : {};
      const nextSnap = {
        ...curSnap,
        v: 1,
        assigned_browser: code,
        actual_browser: code,
        mismatch: false,
        profile_id: profileId || curSnap.profile_id || null,
        last_synced_at: nowIso,
      };
      if (isLiveWindow) {
        nextSnap.live_cdp = true;
        nextSnap.debug_port = cleanDebugPort;
        if (typeof nextSnap.note === "string" && /\(live session synced\)/i.test(nextSnap.note)) {
          nextSnap.note = nextSnap.note.replace(
            /\s*\(live session synced\)/gi,
            ` (Live Window · Port ${cleanDebugPort})`,
          );
        } else if (!nextSnap.note && String(nextSnap.status || "") === "logged_in") {
          nextSnap.note = `Logged into ${svc} on #${code} (Live Window · Port ${cleanDebugPort})`;
        }
      } else {
        delete nextSnap.live_cdp;
        delete nextSnap.debug_port;
        if (typeof nextSnap.note === "string") {
          nextSnap.note = nextSnap.note.replace(
            /\s*\(Live Window\s*·\s*Port\s*\d+\)/gi,
            " (live session synced)",
          );
        }
      }

      try {
        const pRes = await fetch(
          `${cfg.url}/rest/v1/twofa_accounts?id=eq.${encodeURIComponent(row.id)}&user_id=eq.${encodeURIComponent(userId)}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              stealth_snapshot: nextSnap,
              updated_at: nowIso,
            }),
            signal: AbortSignal.timeout(6000),
          },
        );
        if (pRes.ok) {
          patchedRows.push({
            ...row,
            stealth_snapshot: nextSnap,
          });
        }
      } catch {
        /* ignore transient network error */
      }
    }),
  );

  if (patchedRows.length > 0) {
    emitStealthLiveSyncEvent({
      profileCode: code,
      profileId: profileId || null,
      source,
      timestamp: nowIso,
      patchedCount: patchedRows.length,
      rows: patchedRows.map((r) => ({
        rowId: r.id,
        code,
        service: r.service,
        account: r.account,
        stealthSnapshot: r.stealth_snapshot,
      })),
    });
  }

  return {
    ok: true,
    profileCode: code,
    liveCdp: isLiveWindow,
    debugPort: isLiveWindow ? cleanDebugPort : 0,
    patchedCount: patchedRows.length,
    rows: patchedRows,
  };
}

module.exports = {
  markStealthProfileLaunchWindowState,
  resolveStealthProfileLaunchSessionId,
  shouldEmitStealthRowSessionLog,
  resolveStealthRowLaunchLogDecision,
  formatStealthSessionLogMessage,
  filterActivityTargetRowsOnProfile,
  appendStealthSessionLogToP0020Row,
  syncProfileActivityLogToP0020Rows,
  syncProfileWindowLiveCdpStateToP0020,
};
