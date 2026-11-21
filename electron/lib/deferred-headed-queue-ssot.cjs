"use strict";
/**
 * Single Source of Truth (SSOT) for the P0003 Deferred User-Headed Queue.
 *
 * Physical store:
 *   %APPDATA%\stealth-browser-console\data\deferred-user-headed-queue.json
 *   (overridable via `process.env.STEALTH_DEFERRED_QUEUE_FILE` for tests).
 *
 * Enforces:
 * - Strict rejection & quarantine of customer profiles `8000–8999`.
 * - Atomic temp+rename persistence with deduplication by `profileCode::taskType::entityKey`.
 * - Automatic reconcile against live User Headed (`headless: false`) sessions.
 * - Automatic expiry (`expired_transient_guard`) for non-payload launch/CDP guard events.
 * - Short-lease worker claiming + exponential error backoff + bounded `completedHistory` (max 100).
 * - Idempotent one-time migration from the 3 legacy fragmented queue files.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const SCHEMA_VERSION = 2;
const DEFAULT_LEASE_MS = 120_000;
const DEFAULT_TRANSIENT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_HISTORY = 100;
const DEFAULT_MAX_ATTEMPTS = 8;

const LEGACY_QUEUE_FILES = [
  {
    id: "p0002",
    filePath: "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\deferred-user-headed-queue.json",
    stubKind: "object",
  },
  {
    id: "p0020",
    filePath: "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\deferred-user-headed-queue.json",
    stubKind: "items",
  },
  {
    id: "p0003",
    filePath: "E:\\Dev\\Tool\\P0003-Stealth-Browser-Console\\data\\deferred-user-headed-queue.json",
    stubKind: "items",
  },
];

const TRANSIENT_GUARD_TASK_TYPES = new Set([
  "agent_cdp_route_while_user_headed",
  "agent_launch_while_user_headed",
  "agent_cdp_while_user_headed",
]);

function resolveDeferredQueuePath() {
  const override = String(process.env.STEALTH_DEFERRED_QUEUE_FILE || "").trim();
  if (override) return path.resolve(override);
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "stealth-browser-console", "data", "deferred-user-headed-queue.json");
}

function normalizeQueueProfileCode(codeOrId) {
  const raw = String(codeOrId ?? "")
    .replace(/^#/, "")
    .trim();
  if (!raw) return "";
  if (/^\d{1,4}$/.test(raw)) return raw.padStart(4, "0");
  const lead = raw.match(/^(\d{1,4})(?:\b|[-_\s])/);
  if (lead) return lead[1].padStart(4, "0");
  return raw;
}

function isCustomer8xxxProfileCode(codeOrId) {
  const raw = String(codeOrId ?? "")
    .replace(/^#/, "")
    .trim();
  if (!/^\d{1,4}$/.test(raw)) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 8000 && n <= 8999;
}

function normalizeTaskType(rawReason, item = null) {
  const raw = String(rawReason || item?.taskType || item?.taskReason || "").trim();
  if (item && (item.externalOrderId || item.orderId || item.category === "user_headed_deferred")) {
    return "revoke-expired-order";
  }
  if (!raw) return "unspecified";
  const lower = raw.toLowerCase();
  if (TRANSIENT_GUARD_TASK_TYPES.has(lower)) return lower;
  if (lower === "user_interactive_session" || lower === "user_interactive_session_active") {
    return "agent_launch_while_user_headed";
  }
  if (/recaptcha.*graph otp recovery|recover-gmail-2fa/i.test(raw)) {
    return "recover-gmail-2fa";
  }
  if (/^user_interactive_session:(.+)$/i.test(raw)) {
    return raw.split(":")[1].trim().toLowerCase().replace(/_/g, "-");
  }
  if (lower === "elevenlabs_password_recovery") return "elevenlabs-password-recovery";
  if (lower === "elevenlabs_session_seed") return "elevenlabs-session-seed";
  if (lower === "vpn_live_login_verify") return "vpn-live-login-verify";
  if (/expired[-_ ]?order|revoke[-_ ]?expired/i.test(raw)) return "revoke-expired-order";
  if (lower === "user_headed_active_during_ai_prewarm") return "ai-service-prewarm";
  if (lower === "profile_open_in_user_headed_mode" && item?.service && /nord|surfshark/i.test(item.service)) {
    return "vpn-live-login-verify";
  }
  if (lower === "user_headed_open" && item?.service) {
    const svc = String(item.service).toLowerCase();
    if (svc.includes("chatgpt")) return "chatgpt-appeal-recheck";
    if (svc.includes("outlook") || svc.includes("hotmail")) return "outlook-2fa-pending";
    return `autologin-${svc.replace(/[^a-z0-9]+/g, "-")}`;
  }
  return raw;
}

function normalizeEntityKey({ entityKey, externalOrderId, orderId, account, accountId, taskType }) {
  const raw = String(entityKey || externalOrderId || orderId || account || accountId || taskType || "default").trim();
  if (!raw) return "default";
  return raw.includes("@") ? raw.toLowerCase() : raw;
}

function buildItemDedupeKey({ profileCode, taskType, entityKey }) {
  return `${String(profileCode || "").trim()}::${String(taskType || "unspecified").trim()}::${String(entityKey || "default").trim()}`;
}

function makeStableItemId(dedupeKey) {
  return crypto.createHash("sha1").update(String(dedupeKey)).digest("hex").slice(0, 16);
}

function readJsonSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8").replace(/\0/g, "").trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tmpPath, filePath);
}

function toEpochMs(val, fallback = 0) {
  if (typeof val === "number" && Number.isFinite(val) && val > 0) return val;
  if (typeof val === "string" && val.trim()) {
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function buildLegacyStubPayload(stubKind) {
  const nowIso = new Date().toISOString();
  const base = {
    schemaVersion: SCHEMA_VERSION,
    migratedToSsot: true,
    ssotMovedTo: "%APPDATA%\\stealth-browser-console\\data\\deferred-user-headed-queue.json",
    apiEndpoint: "http://127.0.0.1:6003/api/automation/deferred-queue",
    migratedAt: nowIso,
  };
  if (stubKind === "object") {
    return {
      ...base,
      updatedAt: nowIso,
      pendingWhileUserHeaded: [],
      readyForRetry: [],
    };
  }
  return {
    ...base,
    updatedAt: nowIso,
    items: [],
  };
}

function isLegacyStub(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  if (parsed.migratedToSsot === true || typeof parsed.ssotMovedTo === "string") {
    const p = Array.isArray(parsed.pendingWhileUserHeaded) ? parsed.pendingWhileUserHeaded : [];
    const r = Array.isArray(parsed.readyForRetry) ? parsed.readyForRetry : [];
    const it = Array.isArray(parsed.items) ? parsed.items : [];
    return p.length === 0 && r.length === 0 && it.length === 0;
  }
  return false;
}

function expandLegacyEntryToCanonicalItems(raw, { defaultStatus = "pending_user_headed", resolveProfile } = {}) {
  if (!raw || typeof raw !== "object") return [];
  const rawCodeOrId = raw.profileCode || raw.code || raw.profileSlot || raw.profileId || raw.stealthProfileId || "";
  let profileId = String(raw.profileId || raw.stealthProfileId || "").trim();
  if (!profileId && typeof raw.profileSlot === "string" && raw.profileSlot.includes("-") && raw.profileSlot.length >= 30) {
    profileId = raw.profileSlot.trim();
  }
  let profileCode = normalizeQueueProfileCode(rawCodeOrId);

  if (typeof resolveProfile === "function") {
    try {
      const resolved = resolveProfile(profileId || profileCode);
      if (resolved) {
        if (resolved.id && !profileId) profileId = String(resolved.id);
        const resCode = normalizeQueueProfileCode(resolved.name || resolved.code || "");
        if (resCode && /^\d{4}$/.test(resCode)) profileCode = resCode;
      }
    } catch {
      /* ignore */
    }
  }

  // Handle canonical v2 flat item directly
  if (raw.dedupeKey && raw.taskType) {
    const pCode = normalizeQueueProfileCode(raw.profileCode || profileCode || profileId);
    const taskType = normalizeTaskType(raw.taskType, raw);
    const entityKey = normalizeEntityKey({
      entityKey: raw.entityKey,
      externalOrderId: raw.payload?.externalOrderId,
      orderId: raw.payload?.orderId,
      account: raw.account,
      taskType,
    });
    const dedupeKey = buildItemDedupeKey({ profileCode: pCode, taskType, entityKey });
    return [
      {
        ...raw,
        id: raw.id || makeStableItemId(dedupeKey),
        dedupeKey,
        profileCode: pCode,
        ...(profileId ? { profileId } : {}),
        taskType,
        entityKey,
        status: raw.status || defaultStatus,
        readyForAgentRetry: Boolean(raw.readyForAgentRetry ?? raw.status === "ready_for_retry"),
      },
    ];
  }

  const now = Date.now();
  const baseFirst = toEpochMs(raw.firstDeferredAt, toEpochMs(raw.queuedAt, toEpochMs(raw.deferredAt, now)));
  const baseLast = toEpochMs(raw.lastDeferredAt, toEpochMs(raw.queuedAt, toEpochMs(raw.deferredAt, baseFirst)));
  const windowClosedAt = toEpochMs(raw.windowClosedAt, 0) || null;
  const status =
    raw.readyForAgentRetry === true || defaultStatus === "ready_for_retry"
      ? "ready_for_retry"
      : "pending_user_headed";

  // P0020 expired order item shape
  if (raw.externalOrderId || raw.orderId || raw.category === "user_headed_deferred") {
    const taskType = "revoke-expired-order";
    const entityKey = normalizeEntityKey({
      externalOrderId: raw.externalOrderId,
      orderId: raw.orderId,
      account: raw.extractedEmail,
      taskType,
    });
    const pCode = profileCode || profileId || "unknown";
    const dedupeKey = buildItemDedupeKey({ profileCode: pCode, taskType, entityKey });
    return [
      {
        id: makeStableItemId(dedupeKey),
        dedupeKey,
        profileCode: pCode,
        ...(profileId ? { profileId } : {}),
        taskType,
        entityKey,
        account: raw.extractedEmail || raw.twofaAccount || undefined,
        status,
        readyForAgentRetry: status === "ready_for_retry",
        firstDeferredAt: baseFirst,
        lastDeferredAt: baseLast,
        windowClosedAt,
        count: Number(raw.count) || 1,
        reason: String(raw.reason || "user_headed_deferred"),
        payload: {
          orderId: raw.orderId || null,
          externalOrderId: raw.externalOrderId || null,
          productName: raw.productName || null,
          liveUntilDate: raw.liveUntilDate || null,
          extractedEmail: raw.extractedEmail || null,
          twofaAccountId: raw.twofaAccountId || null,
          twofaPassword: raw.twofaPassword || null,
          twofaStatus: raw.twofaStatus || null,
          ownership: raw.ownership || null,
          profileSlot: raw.profileSlot || null,
          activeCoOrders: Array.isArray(raw.activeCoOrders) ? raw.activeCoOrders : [],
          category: raw.category || "user_headed_deferred",
          safeAutoCloseWithoutRotate: Boolean(raw.safeAutoCloseWithoutRotate),
        },
        claim: null,
        attempts: raw.lastRetryError ? 1 : 0,
        lastError: raw.lastRetryError || null,
        lastAttemptAt: toEpochMs(raw.lastRetryAt, 0) || null,
        nextRetryAt: null,
      },
    ];
  }

  // Legacy tasks[] array or single taskReason/reason
  const rawTasks = Array.isArray(raw.tasks) && raw.tasks.length > 0 ? raw.tasks : [null];
  const results = [];
  for (const t of rawTasks) {
    const rawReason =
      (t && typeof t === "object" ? t.taskReason || t.type || t.reason || t.service : t) ||
      raw.taskReason ||
      raw.service ||
      raw.reason ||
      "unspecified";
    const taskType = normalizeTaskType(rawReason, {
      ...(t && typeof t === "object" ? t : {}),
      service: (t && typeof t === "object" && t.service) || raw.service,
    });
    const acct = (t && typeof t === "object" ? t.account || t.email : null) || raw.account || raw.email || undefined;
    const entityKey = normalizeEntityKey({
      entityKey: t?.entityKey || t?.accountId || raw.entityKey,
      account: acct,
      accountId: t?.accountId || raw.accountId,
      taskType,
    });
    const pCode = profileCode || profileId || "unknown";
    const dedupeKey = buildItemDedupeKey({ profileCode: pCode, taskType, entityKey });
    const queuedAtMs = toEpochMs(t?.queuedAt || t?.requestedAt, baseFirst);
    results.push({
      id: makeStableItemId(dedupeKey),
      dedupeKey,
      profileCode: pCode,
      ...(profileId ? { profileId } : {}),
      taskType,
      entityKey,
      ...(acct ? { account: String(acct).trim() } : {}),
      status,
      readyForAgentRetry: status === "ready_for_retry",
      firstDeferredAt: Math.min(baseFirst, queuedAtMs),
      lastDeferredAt: Math.max(baseLast, queuedAtMs),
      windowClosedAt,
      count: Number(raw.count) || 1,
      reason: String((t && typeof t === "object" && (t.reason || t.taskReason)) || raw.reason || taskType),
      payload: {
        ...(t && typeof t === "object" ? t : {}),
        ...(raw.service ? { service: raw.service } : {}),
      },
      claim: null,
      attempts: 0,
      lastError: null,
      lastAttemptAt: null,
      nextRetryAt: null,
    });
  }
  return results;
}

function mergeCanonicalItems(existingItems, incomingItems) {
  const byKey = new Map();
  const upsert = (item) => {
    if (!item || !item.profileCode) return;
    const key = item.dedupeKey || buildItemDedupeKey(item);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...item, dedupeKey: key, id: item.id || makeStableItemId(key) });
      return;
    }
    const mergedPayload = { ...(prev.payload || {}), ...(item.payload || {}) };
    const statusPriority = { claimed: 3, ready_for_retry: 2, pending_user_headed: 1 };
    const nextStatus =
      (statusPriority[item.status] || 0) >= (statusPriority[prev.status] || 0) ? item.status : prev.status;
    byKey.set(key, {
      ...prev,
      ...item,
      id: prev.id || item.id || makeStableItemId(key),
      dedupeKey: key,
      profileId: item.profileId || prev.profileId,
      account: item.account || prev.account,
      status: nextStatus,
      readyForAgentRetry: nextStatus === "ready_for_retry",
      firstDeferredAt: Math.min(Number(prev.firstDeferredAt) || Date.now(), Number(item.firstDeferredAt) || Date.now()),
      lastDeferredAt: Math.max(Number(prev.lastDeferredAt) || 0, Number(item.lastDeferredAt) || 0),
      windowClosedAt: item.windowClosedAt || prev.windowClosedAt || null,
      count: Math.max(Number(prev.count) || 1, Number(item.count) || 1),
      payload: mergedPayload,
      claim: item.claim || prev.claim || null,
      attempts: Math.max(Number(prev.attempts) || 0, Number(item.attempts) || 0),
      lastError: item.lastError ?? prev.lastError ?? null,
      lastAttemptAt: item.lastAttemptAt ?? prev.lastAttemptAt ?? null,
      nextRetryAt: item.nextRetryAt ?? prev.nextRetryAt ?? null,
    });
  };
  for (const it of Array.isArray(existingItems) ? existingItems : []) upsert(it);
  for (const it of Array.isArray(incomingItems) ? incomingItems : []) upsert(it);
  return [...byKey.values()];
}

function appendHistory(history, entry, maxHistory = DEFAULT_MAX_HISTORY) {
  const prev = Array.isArray(history) ? history : [];
  const next = [{ ...entry, recordedAt: entry.recordedAt || new Date().toISOString() }, ...prev];
  return next.slice(0, maxHistory);
}

function buildGroupedLegacyViews(items, now = Date.now()) {
  const groupForStatus = (targetStatuses, honorBackoff = false) => {
    const byCode = new Map();
    for (const item of items) {
      if (!targetStatuses.has(item.status)) continue;
      if (honorBackoff && item.nextRetryAt && Number(item.nextRetryAt) > now) continue;
      const code = item.profileCode;
      if (!code || isCustomer8xxxProfileCode(code)) continue;
      let grp = byCode.get(code);
      if (!grp) {
        grp = {
          code,
          ...(item.profileId ? { profileId: item.profileId } : {}),
          ...(item.account ? { account: item.account } : {}),
          firstDeferredAt: item.firstDeferredAt,
          lastDeferredAt: item.lastDeferredAt,
          ...(item.windowClosedAt ? { windowClosedAt: item.windowClosedAt } : {}),
          count: item.count || 1,
          reason: item.reason || item.taskType,
          readyForAgentRetry: item.status === "ready_for_retry",
          tasks: [],
        };
        byCode.set(code, grp);
      } else {
        if (!grp.profileId && item.profileId) grp.profileId = item.profileId;
        if (!grp.account && item.account) grp.account = item.account;
        grp.firstDeferredAt = Math.min(grp.firstDeferredAt, item.firstDeferredAt || grp.firstDeferredAt);
        grp.lastDeferredAt = Math.max(grp.lastDeferredAt, item.lastDeferredAt || grp.lastDeferredAt);
        if (item.windowClosedAt) grp.windowClosedAt = Math.max(grp.windowClosedAt || 0, item.windowClosedAt);
        grp.count = Math.max(grp.count, item.count || 1);
      }
      grp.tasks.push({
        ...(item.payload && typeof item.payload === "object" ? item.payload : {}),
        id: item.id,
        dedupeKey: item.dedupeKey,
        taskReason: item.taskType,
        taskType: item.taskType,
        entityKey: item.entityKey,
        ...(item.account ? { account: item.account } : {}),
        queuedAt: new Date(item.firstDeferredAt || Date.now()).toISOString(),
      });
    }
    return [...byCode.values()];
  };

  return {
    pendingWhileUserHeaded: groupForStatus(new Set(["pending_user_headed"]), false),
    readyForRetry: groupForStatus(new Set(["ready_for_retry", "claimed"]), true),
  };
}

function readRawStore({ queuePath = resolveDeferredQueuePath() } = {}) {
  const parsed = readJsonSafe(queuePath);
  if (!parsed) {
    return {
      schemaVersion: SCHEMA_VERSION,
      ssotPath: queuePath,
      updatedAt: null,
      items: [],
      completedHistory: [],
      migratedSources: {},
    };
  }
  if (Array.isArray(parsed)) {
    return {
      schemaVersion: SCHEMA_VERSION,
      ssotPath: queuePath,
      updatedAt: null,
      items: parsed.flatMap((x) => expandLegacyEntryToCanonicalItems(x)),
      completedHistory: [],
      migratedSources: {},
    };
  }
  let items = Array.isArray(parsed.items) ? [...parsed.items] : [];
  if (items.length === 0) {
    const legacyPend = Array.isArray(parsed.pendingWhileUserHeaded) ? parsed.pendingWhileUserHeaded : [];
    const legacyReady = Array.isArray(parsed.readyForRetry) ? parsed.readyForRetry : [];
    items = [
      ...legacyPend.flatMap((x) => expandLegacyEntryToCanonicalItems(x, { defaultStatus: "pending_user_headed" })),
      ...legacyReady.flatMap((x) => expandLegacyEntryToCanonicalItems(x, { defaultStatus: "ready_for_retry" })),
    ];
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    ssotPath: queuePath,
    updatedAt: parsed.updatedAt || null,
    items: mergeCanonicalItems([], items),
    completedHistory: Array.isArray(parsed.completedHistory) ? parsed.completedHistory.slice(0, DEFAULT_MAX_HISTORY) : [],
    migratedSources:
      parsed.migratedSources && typeof parsed.migratedSources === "object" ? { ...parsed.migratedSources } : {},
  };
}

function formatStorePayload(store, queuePath) {
  const items = mergeCanonicalItems([], store.items || []);
  const { pendingWhileUserHeaded, readyForRetry } = buildGroupedLegacyViews(items);
  const completedHistory = Array.isArray(store.completedHistory)
    ? store.completedHistory.slice(0, DEFAULT_MAX_HISTORY)
    : [];
  const pendingCount = items.filter((x) => x.status === "pending_user_headed").length;
  const readyCount = items.filter((x) => x.status === "ready_for_retry").length;
  const claimedCount = items.filter((x) => x.status === "claimed").length;
  return {
    schemaVersion: SCHEMA_VERSION,
    ssotPath: queuePath,
    updatedAt: store.updatedAt || new Date().toISOString(),
    migratedSources: store.migratedSources || {},
    pendingWhileUserHeadedCount: pendingCount,
    readyForRetryCount: readyCount,
    claimedCount,
    completedHistoryCount: completedHistory.length,
    totalActiveCount: items.length,
    items,
    pendingWhileUserHeaded,
    readyForRetry,
    completedHistory,
  };
}

function writeStore(store, { queuePath = resolveDeferredQueuePath() } = {}) {
  const nextStore = {
    ...store,
    updatedAt: new Date().toISOString(),
  };
  const payload = formatStorePayload(nextStore, queuePath);
  writeJsonAtomic(queuePath, payload);
  return payload;
}

/**
 * Reconciles items against live headed sessions, expired leases, `8xxx` guards,
 * and transient launch/CDP guard TTLs.
 */
function reconcileStoreInMemory(
  store,
  {
    runningHeadedCodes = null,
    runningHeadedIds = null,
    resolveProfile = null,
    now = Date.now(),
    transientTtlMs = DEFAULT_TRANSIENT_TTL_MS,
  } = {},
) {
  let mutated = false;
  let history = Array.isArray(store.completedHistory) ? [...store.completedHistory] : [];
  const headedCodeSet =
    runningHeadedCodes instanceof Set
      ? new Set([...runningHeadedCodes].map(normalizeQueueProfileCode).filter(Boolean))
      : Array.isArray(runningHeadedCodes)
        ? new Set(runningHeadedCodes.map(normalizeQueueProfileCode).filter(Boolean))
        : null;
  const headedIdSet =
    runningHeadedIds instanceof Set
      ? new Set([...runningHeadedIds].map((x) => String(x || "").trim()).filter(Boolean))
      : Array.isArray(runningHeadedIds)
        ? new Set(runningHeadedIds.map((x) => String(x || "").trim()).filter(Boolean))
        : null;
  const hasLiveHeadedSnapshot = Boolean(headedCodeSet || headedIdSet);

  const nextItems = [];
  for (const rawItem of store.items || []) {
    let item = { ...rawItem };
    if (typeof resolveProfile === "function" && (!item.profileId || !/^\d{4}$/.test(String(item.profileCode || "")))) {
      try {
        const prof = resolveProfile(item.profileId || item.profileCode);
        if (prof) {
          const resolvedCode = normalizeQueueProfileCode(prof.name || prof.code || "");
          if (resolvedCode && resolvedCode !== item.profileCode) {
            item.profileCode = resolvedCode;
            item.dedupeKey = buildItemDedupeKey(item);
            item.id = makeStableItemId(item.dedupeKey);
            mutated = true;
          }
          if (prof.id && String(prof.id) !== item.profileId) {
            item.profileId = String(prof.id);
            mutated = true;
          }
        }
      } catch {
        /* ignore */
      }
    }

    // 1. Quarantine customer 8xxx immediately
    if (isCustomer8xxxProfileCode(item.profileCode)) {
      history = appendHistory(history, {
        id: item.id,
        dedupeKey: item.dedupeKey,
        profileCode: item.profileCode,
        taskType: item.taskType,
        entityKey: item.entityKey,
        outcome: "quarantined_customer_8xxx",
        completedAt: new Date(now).toISOString(),
      });
      mutated = true;
      continue;
    }

    // 2. Expire stale claim lease
    if (item.status === "claimed" && item.claim && Number(item.claim.expiresAt || 0) <= now) {
      item.claim = null;
      item.status = "ready_for_retry";
      item.readyForAgentRetry = true;
      mutated = true;
    }

    const isCurrentlyHeaded = hasLiveHeadedSnapshot
      ? Boolean(
          (headedCodeSet && headedCodeSet.has(normalizeQueueProfileCode(item.profileCode))) ||
            (headedIdSet && item.profileId && headedIdSet.has(String(item.profileId))),
        )
      : null;

    // 3. Auto-expire transient non-payload launch/CDP guards once window closes OR past 24h TTL
    const isTransient = TRANSIENT_GUARD_TASK_TYPES.has(String(item.taskType || ""));
    const ageMs = now - Number(item.lastDeferredAt || item.firstDeferredAt || now);
    if (isTransient && ((hasLiveHeadedSnapshot && !isCurrentlyHeaded) || ageMs > transientTtlMs)) {
      history = appendHistory(history, {
        id: item.id,
        dedupeKey: item.dedupeKey,
        profileCode: item.profileCode,
        profileId: item.profileId || null,
        taskType: item.taskType,
        entityKey: item.entityKey,
        outcome: "expired_transient_guard",
        reason: hasLiveHeadedSnapshot && !isCurrentlyHeaded ? "window_closed_no_payload" : "ttl_24h_expired",
        completedAt: new Date(now).toISOString(),
      });
      mutated = true;
      continue;
    }

    // 4. Reconcile pending <-> ready transitions against live headed state
    if (hasLiveHeadedSnapshot) {
      if (!isCurrentlyHeaded && item.status === "pending_user_headed") {
        item.status = "ready_for_retry";
        item.readyForAgentRetry = true;
        item.windowClosedAt = Number(item.windowClosedAt) || now;
        mutated = true;
      } else if (isCurrentlyHeaded && item.status === "ready_for_retry") {
        item.status = "pending_user_headed";
        item.readyForAgentRetry = false;
        item.claim = null;
        item.nextRetryAt = null;
        item.lastDeferredAt = now;
        mutated = true;
      }
    }

    nextItems.push(item);
  }

  return {
    mutated,
    store: {
      ...store,
      items: mergeCanonicalItems([], nextItems),
      completedHistory: history.slice(0, DEFAULT_MAX_HISTORY),
    },
  };
}

/**
 * Idempotent one-time migration from the 3 legacy fragmented queue files into the single SSOT file.
 */
function migrateLegacyQueuesOnce({
  queuePath = resolveDeferredQueuePath(),
  legacyFiles = LEGACY_QUEUE_FILES,
  resolveProfile = null,
  runningHeadedCodes = null,
  runningHeadedIds = null,
} = {}) {
  let store = readRawStore({ queuePath });
  const incoming = [];
  let history = [...(store.completedHistory || [])];
  const migratedNow = [];

  for (const legacy of legacyFiles) {
    if (!legacy?.filePath || path.resolve(legacy.filePath) === path.resolve(queuePath)) continue;
    if (!fs.existsSync(legacy.filePath)) continue;
    const parsed = readJsonSafe(legacy.filePath);
    if (!parsed || isLegacyStub(parsed)) continue;

    let rawEntries = [];
    if (Array.isArray(parsed)) {
      rawEntries = parsed.map((entry) => ({ entry, defaultStatus: "pending_user_headed" }));
    } else if (typeof parsed === "object") {
      if (Array.isArray(parsed.pendingWhileUserHeaded)) {
        for (const entry of parsed.pendingWhileUserHeaded) {
          rawEntries.push({ entry, defaultStatus: "pending_user_headed" });
        }
      }
      if (Array.isArray(parsed.readyForRetry)) {
        for (const entry of parsed.readyForRetry) {
          rawEntries.push({ entry, defaultStatus: "ready_for_retry" });
        }
      }
      if (Array.isArray(parsed.items)) {
        for (const entry of parsed.items) {
          rawEntries.push({ entry, defaultStatus: "pending_user_headed" });
        }
      }
    }

    let expandedCount = 0;
    for (const { entry, defaultStatus } of rawEntries) {
      const items = expandLegacyEntryToCanonicalItems(entry, { defaultStatus, resolveProfile });
      for (const it of items) {
        if (isCustomer8xxxProfileCode(it.profileCode)) {
          history = appendHistory(history, {
            id: it.id,
            dedupeKey: it.dedupeKey,
            profileCode: it.profileCode,
            taskType: it.taskType,
            entityKey: it.entityKey,
            outcome: "quarantined_customer_8xxx",
            migratedFrom: legacy.id,
            completedAt: new Date().toISOString(),
          });
        } else {
          incoming.push(it);
          expandedCount += 1;
        }
      }
    }

    store.migratedSources = {
      ...(store.migratedSources || {}),
      [legacy.id]: {
        path: legacy.filePath,
        migratedAt: new Date().toISOString(),
        importedItems: expandedCount,
      },
    };
    migratedNow.push(legacy);
  }

  if (migratedNow.length === 0) {
    return { migrated: false, migratedSources: [], store: formatStorePayload(store, queuePath) };
  }

  store.items = mergeCanonicalItems(store.items, incoming);
  store.completedHistory = history.slice(0, DEFAULT_MAX_HISTORY);
  const reconciled = reconcileStoreInMemory(store, {
    runningHeadedCodes,
    runningHeadedIds,
    resolveProfile,
  });
  const saved = writeStore(reconciled.store, { queuePath });

  for (const legacy of migratedNow) {
    try {
      writeJsonAtomic(legacy.filePath, buildLegacyStubPayload(legacy.stubKind));
    } catch {
      /* ignore non-fatal legacy stub error */
    }
  }

  return {
    migrated: true,
    migratedSources: migratedNow.map((l) => l.id),
    importedCount: incoming.length,
    store: saved,
  };
}

function readDeferredQueue(opts = {}) {
  const queuePath = opts.queuePath || resolveDeferredQueuePath();
  if (!process.env.STEALTH_DEFERRED_QUEUE_FILE && opts.skipLegacyMigrate !== true) {
    migrateLegacyQueuesOnce({
      queuePath,
      resolveProfile: opts.resolveProfile,
      runningHeadedCodes: opts.runningHeadedCodes,
      runningHeadedIds: opts.runningHeadedIds,
    });
  }
  const store = readRawStore({ queuePath });
  const { mutated, store: reconciled } = reconcileStoreInMemory(store, opts);
  if (mutated && fs.existsSync(queuePath)) {
    return writeStore(reconciled, { queuePath });
  }
  return formatStorePayload(reconciled, queuePath);
}

function enqueueDeferredItem(input = {}, opts = {}) {
  const queuePath = opts.queuePath || resolveDeferredQueuePath();
  if (!process.env.STEALTH_DEFERRED_QUEUE_FILE && opts.skipLegacyMigrate !== true) {
    migrateLegacyQueuesOnce({ queuePath, resolveProfile: opts.resolveProfile });
  }
  let profileId = String(input.profileId || "").trim();
  let profileCode = normalizeQueueProfileCode(input.code || input.profileCode || input.profileSlot || profileId);
  if (typeof opts.resolveProfile === "function") {
    try {
      const prof = opts.resolveProfile(profileId || profileCode);
      if (prof) {
        if (prof.id && !profileId) profileId = String(prof.id);
        const rc = normalizeQueueProfileCode(prof.name || prof.code || "");
        if (rc && /^\d{4}$/.test(rc)) profileCode = rc;
      }
    } catch {
      /* ignore */
    }
  }
  if (!profileCode || isCustomer8xxxProfileCode(profileCode)) {
    return {
      ok: false,
      skippedCustomer8xxx: isCustomer8xxxProfileCode(profileCode),
      quarantined: isCustomer8xxxProfileCode(profileCode),
      code: profileCode,
      error: isCustomer8xxxProfileCode(profileCode) ? "customer_8xxx_forbidden" : "invalid_profile_code",
    };
  }

  const now = Date.now();
  const taskType = normalizeTaskType(input.taskType || input.taskReason || input.reason || "unspecified", input);
  const account = input.account ? String(input.account).trim() : undefined;
  const entityKey = normalizeEntityKey({
    entityKey: input.entityKey,
    externalOrderId: input.externalOrderId || input.payload?.externalOrderId,
    orderId: input.orderId || input.payload?.orderId,
    account,
    accountId: input.accountId || input.payload?.accountId,
    taskType,
  });
  const dedupeKey = buildItemDedupeKey({ profileCode, taskType, entityKey });
  const id = makeStableItemId(dedupeKey);
  const isHeaded = input.isHeaded !== undefined ? Boolean(input.isHeaded) : true;
  const status = isHeaded ? "pending_user_headed" : "ready_for_retry";

  const store = readRawStore({ queuePath });
  const existing = (store.items || []).find((x) => x.dedupeKey === dedupeKey);
  const nextItem = {
    id,
    dedupeKey,
    profileCode,
    ...(profileId ? { profileId } : {}),
    taskType,
    entityKey,
    ...(account ? { account } : {}),
    status: existing?.status === "claimed" ? "claimed" : status,
    readyForAgentRetry: status === "ready_for_retry" && existing?.status !== "claimed",
    firstDeferredAt: existing?.firstDeferredAt || now,
    lastDeferredAt: now,
    windowClosedAt: isHeaded ? null : existing?.windowClosedAt || now,
    count: (Number(existing?.count) || 0) + 1,
    reason: String(input.reason || input.taskReason || existing?.reason || taskType),
    payload: {
      ...(existing?.payload || {}),
      ...(input.payload && typeof input.payload === "object" ? input.payload : {}),
    },
    claim: existing?.claim || null,
    attempts: Number(existing?.attempts) || 0,
    lastError: input.lastError !== undefined ? input.lastError : existing?.lastError || null,
    lastAttemptAt: input.lastAttemptAt !== undefined ? input.lastAttemptAt : existing?.lastAttemptAt || null,
    nextRetryAt:
      input.nextRetryAt !== undefined
        ? input.nextRetryAt
        : Number(input.backoffMs) > 0
          ? now + Number(input.backoffMs)
          : existing?.nextRetryAt || null,
  };

  store.items = mergeCanonicalItems(store.items, [nextItem]);
  const saved = writeStore(store, { queuePath });
  return {
    ok: true,
    deduped: Boolean(existing),
    code: profileCode,
    item: saved.items.find((x) => x.dedupeKey === dedupeKey) || nextItem,
    queue: saved,
  };
}

function claimDeferredItems(
  {
    owner = "worker",
    taskTypes = null,
    codes = null,
    limit = 10,
    leaseMs = DEFAULT_LEASE_MS,
  } = {},
  opts = {},
) {
  const queuePath = opts.queuePath || resolveDeferredQueuePath();
  if (!process.env.STEALTH_DEFERRED_QUEUE_FILE && opts.skipLegacyMigrate !== true) {
    migrateLegacyQueuesOnce({
      queuePath,
      resolveProfile: opts.resolveProfile,
      runningHeadedCodes: opts.runningHeadedCodes,
      runningHeadedIds: opts.runningHeadedIds,
    });
  }
  const now = Date.now();
  const rawStore = readRawStore({ queuePath });
  const { store } = reconcileStoreInMemory(rawStore, { ...opts, now });

  const taskFilter = Array.isArray(taskTypes) && taskTypes.length > 0
    ? new Set(taskTypes.map((t) => normalizeTaskType(t)))
    : null;
  const codeFilter = Array.isArray(codes) && codes.length > 0
    ? new Set(codes.map(normalizeQueueProfileCode).filter(Boolean))
    : null;

  const claimed = [];
  const nextItems = (store.items || []).map((item) => {
    if (claimed.length >= Math.max(1, Number(limit) || 10)) return item;
    if (item.status !== "ready_for_retry" || !item.readyForAgentRetry) return item;
    if (isCustomer8xxxProfileCode(item.profileCode)) return item;
    if (item.nextRetryAt && Number(item.nextRetryAt) > now) return item;
    if (taskFilter && !taskFilter.has(item.taskType)) return item;
    if (codeFilter && !codeFilter.has(item.profileCode)) return item;
    const claimedItem = {
      ...item,
      status: "claimed",
      readyForAgentRetry: false,
      claim: {
        owner: String(owner || "worker"),
        claimedAt: now,
        expiresAt: now + Math.max(5_000, Number(leaseMs) || DEFAULT_LEASE_MS),
      },
    };
    claimed.push(claimedItem);
    return claimedItem;
  });

  const saved = writeStore({ ...store, items: nextItems }, { queuePath });
  return {
    ok: true,
    claimed,
    count: claimed.length,
    queue: saved,
  };
}

function completeDeferredItem(
  {
    id = null,
    dedupeKey = null,
    code = null,
    taskType = null,
    taskReason = null,
    entityKey = null,
    account = null,
    ok = true,
    outcome = null,
    error = null,
    backoffMs = null,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
  } = {},
  opts = {},
) {
  const queuePath = opts.queuePath || resolveDeferredQueuePath();
  const store = readRawStore({ queuePath });
  const now = Date.now();
  const normCode = code ? normalizeQueueProfileCode(code) : "";
  const normType = taskType || taskReason ? normalizeTaskType(taskType || taskReason) : "";
  const normAcct = account ? String(account).trim().toLowerCase() : "";
  const normEntity = entityKey ? String(entityKey).trim() : "";

  const matchesItem = (item) => {
    if (id) return item.id === id;
    if (dedupeKey) return item.dedupeKey === dedupeKey;
    if (!normCode) return false;
    if (item.profileCode !== normCode) return false;
    if (normType && item.taskType !== normType) return false;
    if (normEntity && item.entityKey.toLowerCase() !== normEntity.toLowerCase()) return false;
    if (normAcct && item.account && item.account.toLowerCase() !== normAcct) return false;
    return true;
  };

  let history = [...(store.completedHistory || [])];
  const remaining = [];
  const affected = [];

  for (const item of store.items || []) {
    if (!matchesItem(item)) {
      remaining.push(item);
      continue;
    }
    if (ok !== false) {
      const doneRecord = {
        id: item.id,
        dedupeKey: item.dedupeKey,
        profileCode: item.profileCode,
        profileId: item.profileId || null,
        taskType: item.taskType,
        entityKey: item.entityKey,
        account: item.account || null,
        outcome: String(outcome || "completed"),
        attempts: (Number(item.attempts) || 0) + 1,
        completedAt: new Date(now).toISOString(),
      };
      history = appendHistory(history, doneRecord);
      affected.push(doneRecord);
    } else {
      const attempts = (Number(item.attempts) || 0) + 1;
      const errMsg = String(error || outcome || "retry_failed");
      if (attempts >= Math.max(1, Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS)) {
        const exhaustedRecord = {
          id: item.id,
          dedupeKey: item.dedupeKey,
          profileCode: item.profileCode,
          profileId: item.profileId || null,
          taskType: item.taskType,
          entityKey: item.entityKey,
          account: item.account || null,
          outcome: "failed_exhausted",
          error: errMsg,
          attempts,
          completedAt: new Date(now).toISOString(),
        };
        history = appendHistory(history, exhaustedRecord);
        affected.push(exhaustedRecord);
      } else {
        const computedBackoff =
          Number(backoffMs) > 0
            ? Number(backoffMs)
            : Math.min(30 * 60_000, 30_000 * Math.pow(2, Math.max(0, attempts - 1)));
        const retriedItem = {
          ...item,
          status: "ready_for_retry",
          readyForAgentRetry: true,
          claim: null,
          attempts,
          lastError: errMsg,
          lastAttemptAt: now,
          nextRetryAt: now + computedBackoff,
        };
        remaining.push(retriedItem);
        affected.push(retriedItem);
      }
    }
  }

  const saved = writeStore(
    {
      ...store,
      items: remaining,
      completedHistory: history,
    },
    { queuePath },
  );

  return {
    ok: true,
    matchedCount: affected.length,
    affected,
    completedHistoryCount: saved.completedHistoryCount,
    queue: saved,
  };
}

module.exports = {
  SCHEMA_VERSION,
  LEGACY_QUEUE_FILES,
  TRANSIENT_GUARD_TASK_TYPES,
  resolveDeferredQueuePath,
  normalizeQueueProfileCode,
  isCustomer8xxxProfileCode,
  normalizeTaskType,
  normalizeEntityKey,
  buildItemDedupeKey,
  migrateLegacyQueuesOnce,
  reconcileStoreInMemory,
  readDeferredQueue,
  enqueueDeferredItem,
  claimDeferredItems,
  completeDeferredItem,
};
