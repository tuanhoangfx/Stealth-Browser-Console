"use strict";
/**
 * Accurately computes the exact set of Stealth Profiles that AI Agents are currently
 * waiting to execute in Headless mode (`⏳ WAITING` KPI & `status=waiting` filter),
 * along with per-profile `waitingReasons` (`Waiting Reason / Worker Lane`) and
 * exact `headedRunningIds` (only User-opened Headed sessions).
 */
const fs = require("node:fs");
const path = require("node:path");
const { getDb, isDatabaseReady } = require("../db/init.cjs");
const { extractProfileCode } = require("./profile-code.cjs");

const P0002_ROOT = "E:\\Dev\\Tool\\P0002-Social-Hub";
const P0002_DATA_DIR = path.join(P0002_ROOT, "data");
const PRIORITY_BOOST_FILE = path.join(P0002_DATA_DIR, "priority-boost-profiles.json");
const ACTIVITY_LOGS_FILE = path.join(P0002_DATA_DIR, "profile-activity-logs.json");
const G1_SESSIONS_FILE = "E:\\Dev\\.cache\\g1-family-unlock-sessions.json";
const WORKER_LOCKS_DIR = "E:\\Dev\\Tool\\.ship\\worker-locks";

function formatElapsedDuration(ms) {
  const sec = Math.max(1, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
}

function readPriorityBoostMap() {
  const parsed = readJsonSafe(PRIORITY_BOOST_FILE);
  if (!parsed || typeof parsed !== "object") return {};
  const boosts = parsed.boosts && typeof parsed.boosts === "object" ? parsed.boosts : {};
  const now = Date.now();
  const active = {};
  for (const [code, entry] of Object.entries(boosts)) {
    const exp = Number(entry?.expiresAt || 0);
    if (exp > now) active[code] = entry;
  }
  return active;
}

function boostWaitingAgentProfile(profileIdOrCode) {
  const raw = String(profileIdOrCode || "").trim();
  if (!raw) return { ok: false, error: "Profile ID or code is required." };
  let code = normalizeCode(raw);
  let profileId = raw;
  if (isDatabaseReady()) {
    try {
      const db = getDb();
      const row = /^\d{4}$/.test(raw)
        ? db.prepare("SELECT id, name FROM profiles WHERE name = ? LIMIT 1").get(raw)
        : db.prepare("SELECT id, name FROM profiles WHERE id = ? OR name = ? LIMIT 1").get(raw, raw);
      if (row) {
        profileId = String(row.id || raw);
        code = normalizeCode(row.name) || code;
      }
    } catch {
      /* ignore */
    }
  }
  if (!code) return { ok: false, error: "Could not resolve 4-digit profile code." };
  try {
    fs.mkdirSync(P0002_DATA_DIR, { recursive: true });
    const existing = readPriorityBoostMap();
    const now = Date.now();
    existing[code] = {
      code,
      profileId,
      boostedAt: now,
      expiresAt: now + 30 * 60 * 1000,
    };
    fs.writeFileSync(
      PRIORITY_BOOST_FILE,
      JSON.stringify({ updatedAt: new Date(now).toISOString(), boosts: existing }, null, 2),
      "utf8",
    );
    return { ok: true, code, profileId, boostedAt: now };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === "EPERM");
  }
}

function normalizeCode(raw) {
  const s = String(raw || "").trim();
  if (/^\d{1,4}$/.test(s)) return s.padStart(4, "0");
  const m = s.match(/\b(\d{4})\b/);
  return m ? m[1] : "";
}

function readJsonSafe(fp) {
  try {
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

function readProfileActivityLogsMap() {
  const memMap = global.__stealthProfileActivityLogs || {};
  const diskParsed = readJsonSafe(ACTIVITY_LOGS_FILE);
  const diskLogs = diskParsed && typeof diskParsed.logs === "object" && diskParsed.logs ? diskParsed.logs : {};
  return { ...diskLogs, ...memMap };
}

function recordProfileActivityLog(idOrCode, text, meta = {}) {
  const rawKey = String(idOrCode || "").trim();
  const cleanText = String(text || "").trim();
  if (!rawKey || !cleanText) return { ok: false, error: "idOrCode and text are required." };
  let code = normalizeCode(rawKey);
  let profileId = rawKey;
  if (isDatabaseReady()) {
    try {
      const db = getDb();
      const row = /^\d{4}$/.test(rawKey)
        ? db.prepare("SELECT id, name FROM profiles WHERE name = ? LIMIT 1").get(rawKey)
        : db.prepare("SELECT id, name FROM profiles WHERE id = ? OR name = ? LIMIT 1").get(rawKey, rawKey);
      if (row) {
        profileId = String(row.id || rawKey);
        code = normalizeCode(row.name) || code;
      }
    } catch {
      /* ignore */
    }
  }
  const nowIso = new Date().toISOString();
  const memMap = global.__stealthProfileActivityLogs || {};
  global.__stealthProfileActivityLogs = memMap;
  const existing = readProfileActivityLogsMap();
  const prevEntry = (code && existing[code]) || existing[profileId] || {};
  const prevHistory = Array.isArray(prevEntry.history) ? prevEntry.history : [];
  const nextHistory = [
    { text: cleanText, at: nowIso },
    ...prevHistory.filter((h) => h && String(h.text || "") !== cleanText),
  ].slice(0, 5);
  const entry = {
    code: code || undefined,
    profileId,
    text: cleanText,
    stage: meta?.stage ? String(meta.stage) : prevEntry.stage,
    source: meta?.source ? String(meta.source) : prevEntry.source,
    updatedAt: nowIso,
    history: nextHistory,
  };
  if (code) {
    memMap[code] = entry;
    existing[code] = entry;
  }
  if (profileId) {
    memMap[profileId] = entry;
    existing[profileId] = entry;
  }
  _waitingStateCache = { at: 0, value: null };
  try {
    fs.mkdirSync(P0002_DATA_DIR, { recursive: true });
    fs.writeFileSync(
      ACTIVITY_LOGS_FILE,
      JSON.stringify({ updatedAt: nowIso, logs: existing }, null, 2),
      "utf8",
    );
  } catch {
    /* ignore disk write failure */
  }
  let p0020SyncPromise = null;
  if (code && /^\d{4}$/.test(code) && !/^9\d{3}$/.test(code)) {
    try {
      const { syncProfileActivityLogToP0020Rows } = require("./stealth-multiplatform-sync.cjs");
      if (typeof syncProfileActivityLogToP0020Rows === "function") {
        p0020SyncPromise = syncProfileActivityLogToP0020Rows({
          profileCode: code,
          profileId,
          text: cleanText,
          source: meta?.source ? String(meta.source) : "p0003:stealth",
          meta,
          at: nowIso,
        }).catch((err) => ({ ok: false, error: err instanceof Error ? err.message : String(err) }));
      }
    } catch (err) {
      p0020SyncPromise = Promise.resolve({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { ok: true, code, profileId, entry, p0020SyncPromise };
}

function isWorkerLockAlive(workerName) {
  const lockFp = path.join(WORKER_LOCKS_DIR, `${workerName}.lock.json`);
  const data = readJsonSafe(lockFp);
  if (!data) return false;
  const pid = Number(data.pid || 0);
  const expiresAt = Number(data.expiresAt || 0);
  if (expiresAt > 0 && Date.now() > expiresAt) return false;
  return isPidAlive(pid);
}

/**
 * Heals profiles stuck in `status = 'failed'` from past transient headless launches
 * once their browser process is no longer alive (older than 60s), removing any stale `stealth-pid.json`.
 */
let _lastHealFailedAt = 0;
let _waitingStateCache = { at: 0, value: null };

function healStaleFailedProfiles(aliveIdSet = new Set()) {
  if (!isDatabaseReady()) return 0;
  const nowCheck = Date.now();
  if (nowCheck - _lastHealFailedAt < 15_000) return 0;
  _lastHealFailedAt = nowCheck;
  let healed = 0;
  try {
    const db = getDb();
    const failedRows = db
      .prepare("SELECT id, name, updated_at FROM profiles WHERE status = 'failed'")
      .all();
    if (!failedRows.length) return 0;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const updateStmt = db.prepare(
      `UPDATE profiles
          SET status = 'closed',
              proxy = CASE WHEN COALESCE(static_ip, 0) = 1 THEN proxy ELSE NULL END,
              updated_at = ?
        WHERE id = ?`,
    );
    for (const row of failedRows) {
      const id = String(row.id || "");
      if (!id || aliveIdSet.has(id)) continue;
      const updatedMs = row.updated_at ? Date.parse(row.updated_at) : 0;
      if (updatedMs && now - updatedMs < 60_000) continue;
      const sidecarFp = path.join("D:\\StealthBrowser\\profiles", id, "stealth-pid.json");
      if (fs.existsSync(sidecarFp)) {
        const sc = readJsonSafe(sidecarFp);
        if (sc?.pid && isPidAlive(Number(sc.pid))) continue;
        try {
          fs.unlinkSync(sidecarFp);
        } catch {
          /* ignore */
        }
      }
      updateStmt.run(nowIso, id);
      healed += 1;
    }
  } catch {
    /* ignore */
  }
  return healed;
}

/**
 * @param {{ sessionManager?: any, profileService?: any, jobQueue?: any }} [ctx]
 * @returns {{
 *   waitingIds: string[],
 *   waitingCodes: string[],
 *   waitingReasons: Record<string, string>,
 *   waitingCount: number,
 *   runningHeadlessIds: string[],
 *   runningHeadlessCodes: string[],
 *   headedRunningIds: string[],
 * }}
 */
function collectWaitingAgentHeadlessState(ctx = {}) {
  const nowCache = Date.now();
  if (!ctx?.force && _waitingStateCache.value && nowCache - _waitingStateCache.at < 1500) {
    return _waitingStateCache.value;
  }
  const sessionManager = ctx.sessionManager || global.__stealthSessionManager || null;
  const jobQueue = ctx.jobQueue || global.__stealthJobQueue || null;

  const runningHeadlessIdSet = new Set();
  const runningHeadlessCodeSet = new Set();
  const runningHeadlessLaunchedAt = new Map();
  const headedRunningIdSet = new Set();
  const allAliveIdSet = new Set();

  try {
    const sessions = sessionManager?.listRunning?.() || [];
    for (const row of Array.isArray(sessions) ? sessions : []) {
      const id = String(row?.id || row?.profileId || "").trim();
      if (!id) continue;
      allAliveIdSet.add(id);
      if (row?.headless !== true && row?.shadowLane !== true) {
        headedRunningIdSet.add(id);
      }
    }
    for (const row of Array.isArray(sessions) ? sessions : []) {
      const id = String(row?.id || row?.profileId || "").trim();
      if (!id || headedRunningIdSet.has(id)) continue;
      if (row?.headless === true || row?.shadowLane === true) {
        runningHeadlessIdSet.add(id);
        const code = extractProfileCode(row?.name || "", id) || normalizeCode(row?.name);
        if (code) runningHeadlessCodeSet.add(code);
        if (Number(row?.launchedAt) > 0) {
          runningHeadlessLaunchedAt.set(id, Number(row.launchedAt));
          if (code) runningHeadlessLaunchedAt.set(code, Number(row.launchedAt));
        }
      }
    }
  } catch {
    /* ignore */
  }

  healStaleFailedProfiles(allAliveIdSet);

  const candidateIds = new Set();
  const candidateCodes = new Set();
  const rawReasons = new Map();

  const addReason = (key, reason) => {
    if (!key || !reason) return;
    const prev = rawReasons.get(key);
    if (!prev) {
      rawReasons.set(key, reason);
    } else if (!prev.includes(reason)) {
      rawReasons.set(key, `${prev} · ${reason}`);
    }
  };

  const addCandidate = (idOrCode, reason = "AI Agent Headless Queue") => {
    const val = String(idOrCode || "").trim();
    if (!val) return;
    if (/^\d{4}$/.test(val)) {
      candidateCodes.add(val);
      addReason(val, reason);
      return;
    }
    const extracted = extractProfileCode(val, val);
    if (extracted && /^\d{4}$/.test(extracted) && val.length <= 6) {
      candidateCodes.add(extracted);
      addReason(extracted, reason);
    } else {
      candidateIds.add(val);
      addReason(val, reason);
    }
  };

  // 1. In-flight headless launches waiting in `sessionManager._waitingHeadlessIds`
  try {
    if (sessionManager?._waitingHeadlessIds instanceof Set) {
      for (const id of sessionManager._waitingHeadlessIds) {
        addCandidate(id, "Launching Headless (Waiting for browser slot)");
      }
    }
    if (sessionManager?._waitingHeadlessCodes instanceof Set) {
      for (const c of sessionManager._waitingHeadlessCodes) {
        addCandidate(c, "Launching Headless (Waiting for browser slot)");
      }
    }
  } catch {
    /* ignore */
  }

  // 2. Deferred tasks waiting for User Headed window to close
  try {
    if (sessionManager?._deferredAgentTasksMap instanceof Map) {
      for (const entry of sessionManager._deferredAgentTasksMap.values()) {
        const label = "Deferred: Waiting for User Headed window to close";
        if (entry?.profileId) addCandidate(entry.profileId, label);
        if (entry?.code) addCandidate(entry.code, label);
      }
    }
    const defParsed = readJsonSafe(path.join(P0002_DATA_DIR, "deferred-user-headed-queue.json"));
    if (defParsed) {
      const pending = Array.isArray(defParsed.pendingWhileUserHeaded) ? defParsed.pendingWhileUserHeaded : [];
      const ready = Array.isArray(defParsed.readyForRetry) ? defParsed.readyForRetry : [];
      const cutoff = Date.now() - 2 * 60 * 60 * 1000;
      for (const item of pending) {
        const label = "Deferred: Waiting for User Headed window to close";
        if (item?.profileId) addCandidate(item.profileId, label);
        if (item?.code) addCandidate(item.code, label);
      }
      for (const item of ready) {
        if (Number(item?.windowClosedAt || 0) > cutoff) {
          const label = "Deferred: Ready for Headless retry after window close";
          if (item?.profileId) addCandidate(item.profileId, label);
          if (item?.code) addCandidate(item.code, label);
        }
      }
    }
  } catch {
    /* ignore */
  }

  // 3. Queued jobs in `jobQueue`
  try {
    const jobs = jobQueue?.list?.() || [];
    for (const job of Array.isArray(jobs) ? jobs : []) {
      if (job?.status === "queued") {
        const p = job.payload || {};
        const wf = p.workflowId || p.workflow_id || p.workflowAction || job.type || "open-url";
        addCandidate(
          p.profileId || p.profile_id || p.profile_name || p.profileName,
          `Queued Job (${wf})`,
        );
      }
    }
  } catch {
    /* ignore */
  }

  // 4. Active cross-process AI Agent locks (`active-agent-locks.json` & `priority-agent-locks.json`)
  const now = Date.now();
  for (const fileName of ["priority-agent-locks.json", "active-agent-locks.json"]) {
    const parsed = readJsonSafe(path.join(P0002_DATA_DIR, fileName));
    if (!parsed || typeof parsed !== "object") continue;
    const locks = parsed.locks && typeof parsed.locks === "object" ? parsed.locks : parsed;
    const isPriority = fileName.startsWith("priority");
    for (const [k, raw] of Object.entries(locks)) {
      if (!/^\d{4}$/.test(k)) continue;
      const exp = typeof raw === "object" && raw ? Number(raw.expiresAt || 0) : Number(raw || 0);
      const ownerPid = typeof raw === "object" && raw ? Number(raw.ownerPid || raw.pid || 0) : 0;
      if (exp > now && (ownerPid <= 0 || isPidAlive(ownerPid))) {
        const reasonTag =
          typeof raw === "object" && raw?.reason
            ? `Priority Lock (${raw.reason})`
            : isPriority
              ? "Priority Agent Lock"
              : ownerPid > 0
                ? `Active Agent Lock (PID ${ownerPid})`
                : "Active Agent Lock";
        addCandidate(k, reasonTag);
      }
    }
  }

  // 5. Active AI Agent Worker state files
  const activeWorkerByCode = new Map();
  const addActiveWorkerReason = (code, label) => {
    const c = normalizeCode(code);
    if (!c || !label) return;
    const prev = activeWorkerByCode.get(c);
    if (!prev) activeWorkerByCode.set(c, label);
    else if (!prev.includes(label)) activeWorkerByCode.set(c, `${prev} · ${label}`);
  };

  const mailState = readJsonSafe(path.join(P0002_ROOT, ".continuous-check-mail-worker.state.json"));
  if (mailState && typeof mailState === "object") {
    const statePidAlive = Number(mailState.pid) > 0 && isPidAlive(Number(mailState.pid));
    const lockAlive = isWorkerLockAlive("continuous-check-mail-worker");
    if (statePidAlive || lockAlive) {
      const pidSuffix = Number(mailState.pid) > 0 ? ` (PID ${mailState.pid})` : "";
      const bSteps = mailState.browserSteps && typeof mailState.browserSteps === "object" ? mailState.browserSteps : {};
      for (const [bCode, stepLabel] of Object.entries(bSteps)) {
        if (stepLabel) addActiveWorkerReason(bCode, `${stepLabel}${pidSuffix}`);
      }
      if (mailState.currentGmailBrowser) {
        const gc = normalizeCode(mailState.currentGmailBrowser);
        const acct = mailState.currentGmailAccount ? ` · ${mailState.currentGmailAccount}` : "";
        addCandidate(gc, `Gmail Auto-Login Lane${acct}`);
        if (!bSteps[gc]) addActiveWorkerReason(gc, `🔐 Gmail Auto-Login${acct}${pidSuffix}`);
      }
      if (mailState.currentOutlookBrowser) {
        const oc = normalizeCode(mailState.currentOutlookBrowser);
        const acct = mailState.currentOutlookAccount ? ` · ${mailState.currentOutlookAccount}` : "";
        addCandidate(oc, `Outlook Auto-Login / Alias Lane${acct}`);
        if (!bSteps[oc]) addActiveWorkerReason(oc, `📧 Outlook Auto-Login & Alias${acct}${pidSuffix}`);
      }
      if (mailState.currentServiceBrowser) {
        const sc = normalizeCode(mailState.currentServiceBrowser);
        const svc = mailState.currentServiceName ? ` (${mailState.currentServiceName})` : "";
        const acct = mailState.currentServiceAccount ? ` · ${mailState.currentServiceAccount}` : "";
        addCandidate(sc, `Service Auto-Login Lane${svc}${acct}`);
        if (!bSteps[sc]) addActiveWorkerReason(sc, `🌐 Service Auto-Login${svc}${acct}${pidSuffix}`);
      }
      for (const b of Array.isArray(mailState.gmailActiveBrowsers) ? mailState.gmailActiveBrowsers : []) {
        const c = normalizeCode(b);
        if (c && !activeWorkerByCode.has(c)) addActiveWorkerReason(c, `🔐 Gmail Auto-Login Worker${pidSuffix}`);
      }
      for (const b of Array.isArray(mailState.outlookActiveBrowsers) ? mailState.outlookActiveBrowsers : []) {
        const c = normalizeCode(b);
        if (c && !activeWorkerByCode.has(c)) addActiveWorkerReason(c, `📧 Outlook Auto-Login / Alias Worker${pidSuffix}`);
      }
      for (const b of Array.isArray(mailState.serviceActiveBrowsers) ? mailState.serviceActiveBrowsers : []) {
        const c = normalizeCode(b);
        if (c && !activeWorkerByCode.has(c)) addActiveWorkerReason(c, `🌐 AI/Media Service Auto-Login Worker${pidSuffix}`);
      }
      for (const b of Array.isArray(mailState.gmailWaitingBrowsers) ? mailState.gmailWaitingBrowsers : []) {
        const c = normalizeCode(b);
        if (c) addCandidate(c, "Gmail Auto-Login Lane");
      }
      for (const b of Array.isArray(mailState.outlookWaitingBrowsers) ? mailState.outlookWaitingBrowsers : []) {
        const c = normalizeCode(b);
        if (c) addCandidate(c, "Outlook Auto-Login / Alias Lane");
      }
      for (const b of Array.isArray(mailState.serviceWaitingBrowsers) ? mailState.serviceWaitingBrowsers : []) {
        const c = normalizeCode(b);
        if (c) addCandidate(c, "AI/Media Service Auto-Login Lane");
      }
      for (const b of Array.isArray(mailState.waitingBrowsers) ? mailState.waitingBrowsers : []) {
        const c = normalizeCode(b);
        if (c) addCandidate(c, "Continuous Mail/Service Worker");
      }
    }
  }

  const fwdState = readJsonSafe(path.join(P0002_ROOT, ".gmail-permanent-forward-worker.state.json"));
  if (fwdState && typeof fwdState === "object") {
    const statePidAlive = Number(fwdState.pid) > 0 && isPidAlive(Number(fwdState.pid));
    const lockAlive = isWorkerLockAlive("gmail-permanent-forward-worker");
    if (statePidAlive || lockAlive) {
      const pidSuffix = Number(fwdState.pid) > 0 ? ` (PID ${fwdState.pid})` : "";
      const fSteps = fwdState.browserSteps && typeof fwdState.browserSteps === "object" ? fwdState.browserSteps : {};
      for (const [bCode, stepLabel] of Object.entries(fSteps)) {
        if (stepLabel) addActiveWorkerReason(bCode, `${stepLabel}${pidSuffix}`);
      }
      if (fwdState.currentBrowser) {
        const fc = normalizeCode(fwdState.currentBrowser);
        const acct = fwdState.currentAccount ? ` · ${fwdState.currentAccount}` : "";
        addCandidate(fc, `Gmail Permanent Forward (c${fc}@infi28.com)${acct}`);
        if (!fSteps[fc]) {
          addActiveWorkerReason(fc, `📨 Gmail Server Forward (c${fc}@infi28.com)${acct}${pidSuffix}`);
        }
      }
      for (const b of Array.isArray(fwdState.activeBrowsers) ? fwdState.activeBrowsers : []) {
        const c = normalizeCode(b);
        if (c && !activeWorkerByCode.has(c)) {
          addActiveWorkerReason(c, `📨 Gmail Server Forward (c${c}@infi28.com)${pidSuffix}`);
        }
      }
      for (const b of Array.isArray(fwdState.waitingBrowsers) ? fwdState.waitingBrowsers : []) {
        const c = normalizeCode(b);
        if (c) addCandidate(c, `Gmail Permanent Forward (c${c}@infi28.com)`);
      }
    }
  }

  const boostMap = readPriorityBoostMap();
  for (const [boostCode] of Object.entries(boostMap)) {
    if (/^\d{4}$/.test(boostCode)) {
      addCandidate(boostCode, "⚡ Priority Boosted (#1 in Queue)");
    }
  }

  const customWaiting = readJsonSafe(path.join(P0002_DATA_DIR, "agent-waiting-profiles.json"));
  if (customWaiting && typeof customWaiting === "object") {
    const batches = customWaiting.batches && typeof customWaiting.batches === "object" ? customWaiting.batches : {};
    for (const [batchKey, entry] of Object.entries(batches)) {
      if (!entry || typeof entry !== "object") continue;
      const exp = Number(entry.expiresAt || 0);
      const pid = Number(entry.pid || 0);
      if (exp > now && (pid <= 0 || isPidAlive(pid)) && Array.isArray(entry.codes)) {
        const label = entry.label || batchKey || "Agent Batch Queue";
        for (const rawCode of entry.codes) {
          const c = normalizeCode(rawCode);
          if (c) addCandidate(c, label);
        }
      }
    }
  }

  const g1Sessions = readJsonSafe(G1_SESSIONS_FILE);
  if (g1Sessions && typeof g1Sessions.sessions === "object" && g1Sessions.sessions) {
    for (const s of Object.values(g1Sessions.sessions)) {
      if (!s || typeof s !== "object") continue;
      const code = normalizeCode(s.profileCode);
      if (!code) continue;
      const updatedMs = s.updatedAt ? Date.parse(s.updatedAt) : 0;
      const pidAlive = Number(s.pid) > 0 && isPidAlive(Number(s.pid));
      if (pidAlive || (updatedMs > 0 && now - updatedMs < 45 * 60_000)) {
        const stageStr = s.stage ? ` · ${s.stage}` : "";
        const emailStr = s.memberEmail ? ` (${s.memberEmail})` : "";
        addActiveWorkerReason(code, `💬 G1 Support${emailStr}${stageStr}`);
      }
    }
  }

  // Remove any code/id that is ALREADY running in Headless mode
  for (const c of runningHeadlessCodeSet) candidateCodes.delete(c);
  for (const id of runningHeadlessIdSet) candidateIds.delete(id);

  // 6. Resolve against SQLite `profiles` table
  const waitingIds = [];
  const waitingCodes = [];
  const waitingReasons = {};
  const headlessReasons = {};
  if (isDatabaseReady()) {
    try {
      const db = getDb();
      if (runningHeadlessIdSet.size > 0 || runningHeadlessCodeSet.size > 0) {
        const hIds = [...runningHeadlessIdSet];
        const hCodes = [...runningHeadlessCodeSet];
        const hClauses = [];
        const hParams = [];
        if (hIds.length > 0) {
          hClauses.push(`id IN (${hIds.map(() => "?").join(", ")})`);
          hParams.push(...hIds);
        }
        if (hCodes.length > 0) {
          hClauses.push(`name IN (${hCodes.map(() => "?").join(", ")})`);
          hParams.push(...hCodes);
        }
        const hRows = db
          .prepare(`SELECT id, name FROM profiles WHERE ${hClauses.join(" OR ")}`)
          .all(...hParams);
        for (const hr of hRows) {
          const hid = String(hr.id || "");
          const hname = String(hr.name || "");
          const numCode = Number(hname);
          const workerDesc =
            activeWorkerByCode.get(hname) ||
            rawReasons.get(hname) ||
            rawReasons.get(hid) ||
            (Number.isInteger(numCode) && numCode >= 9000 && numCode <= 9999
              ? "Agent Smoke / Ephemeral Pool (9000–9999)"
              : "AI Agent Headless Session");
          let launchedMs = runningHeadlessLaunchedAt.get(hid) || runningHeadlessLaunchedAt.get(hname) || 0;
          if (!launchedMs) {
            const sc = readJsonSafe(path.join("D:\\StealthBrowser\\profiles", hid, "stealth-pid.json"));
            if (Number(sc?.launchedAt) > 0) launchedMs = Number(sc.launchedAt);
          }
          const elapsedStr = launchedMs > 0 ? ` · Elapsed: ${formatElapsedDuration(now - launchedMs)}` : "";
          const fullDesc = `${workerDesc}${elapsedStr}`;
          if (hid) headlessReasons[hid] = fullDesc;
          if (hname) headlessReasons[hname] = fullDesc;
        }
      }

      const openingRows = db
        .prepare("SELECT id, name FROM profiles WHERE status = 'opening'")
        .all();
      for (const r of openingRows) {
        const rid = String(r.id || "");
        if (!rid || runningHeadlessIdSet.has(rid) || headedRunningIdSet.has(rid)) continue;
        addCandidate(rid, "Opening Headless Browser");
      }

      const codesArr = [...candidateCodes];
      const idsArr = [...candidateIds];
      if (codesArr.length > 0 || idsArr.length > 0) {
        const clauses = [];
        const params = [];
        if (codesArr.length > 0) {
          clauses.push(`name IN (${codesArr.map(() => "?").join(", ")})`);
          params.push(...codesArr);
        }
        if (idsArr.length > 0) {
          clauses.push(`id IN (${idsArr.map(() => "?").join(", ")})`);
          params.push(...idsArr);
        }
        const matchedRows = db
          .prepare(`SELECT id, name FROM profiles WHERE ${clauses.join(" OR ")} ORDER BY name ASC`)
          .all(...params);
        const seenIds = new Set();
        for (const row of matchedRows) {
          const rid = String(row.id || "");
          const rname = String(row.name || "");
          if (!rid || seenIds.has(rid) || runningHeadlessIdSet.has(rid) || runningHeadlessCodeSet.has(rname)) {
            continue;
          }
          seenIds.add(rid);
          waitingIds.push(rid);
          waitingCodes.push(rname);
          const combinedReason =
            [rawReasons.get(rname), rawReasons.get(rid)].filter(Boolean).join(" · ") ||
            "AI Agent Headless Queue";
          waitingReasons[rid] = combinedReason;
          waitingReasons[rname] = combinedReason;
        }
      }
    } catch {
      /* ignore DB query error */
    }
  }

  const activityLogs = readProfileActivityLogsMap();
  const piggybackMap = global.__stealthPiggybackActivityLogs || {};
  global.__stealthPiggybackActivityLogs = piggybackMap;
  const nowIso = new Date(now).toISOString();
  const stripElapsed = (s) => String(s || "").replace(/\s*·\s*Elapsed:\s*[^·]+$/i, "").trim();

  const upsertPiggyback = (key, fullText, stage = "active", source = "state-piggyback") => {
    if (!key || !fullText) return;
    const explicit = activityLogs[key];
    // Preserve explicit real-time logs pushed within the last 10 minutes (e.g. G1 Support Watcher)
    if (explicit && explicit.source && explicit.source !== "state-piggyback") {
      const expMs = explicit.updatedAt ? Date.parse(explicit.updatedAt) : 0;
      if (expMs > 0 && now - expMs < 10 * 60_000) return;
    }
    const prev = piggybackMap[key] || explicit || {};
    const prevHistory = Array.isArray(prev.history) ? prev.history : [];
    const baseKey = stripElapsed(fullText);
    const topBaseKey = prevHistory[0]?.text ? stripElapsed(prevHistory[0].text) : "";
    let nextHistory;
    if (topBaseKey && topBaseKey === baseKey) {
      nextHistory = [{ text: fullText, at: prevHistory[0].at || nowIso }, ...prevHistory.slice(1)].slice(0, 5);
    } else {
      nextHistory = [
        { text: fullText, at: nowIso },
        ...prevHistory.filter((h) => h && stripElapsed(h.text) !== baseKey),
      ].slice(0, 5);
    }
    const entry = {
      ...(prev.code ? { code: prev.code } : /^\d{4}$/.test(key) ? { code: key } : {}),
      text: fullText,
      stage,
      source,
      updatedAt: nowIso,
      history: nextHistory,
    };
    piggybackMap[key] = entry;
    activityLogs[key] = entry;
  };

  for (const [k, hr] of Object.entries(headlessReasons)) {
    upsertPiggyback(k, `👻 ${hr}`, "headless", "state-piggyback");
  }
  for (const [k, wr] of Object.entries(waitingReasons)) {
    if (!headlessReasons[k]) {
      upsertPiggyback(k, `⏳ ${wr}`, "waiting", "state-piggyback");
    }
  }
  for (const [code, wDesc] of activeWorkerByCode.entries()) {
    if (!headlessReasons[code] && !waitingReasons[code]) {
      upsertPiggyback(code, `⚙️ ${wDesc}`, "worker", "state-piggyback");
    }
  }
  // Retain recent piggybacked logs in RAM (up to 30m) after a profile finishes & closes
  for (const [k, pEntry] of Object.entries(piggybackMap)) {
    if (!activityLogs[k] && pEntry?.updatedAt) {
      const ageMs = now - (Date.parse(pEntry.updatedAt) || 0);
      if (ageMs >= 0 && ageMs < 30 * 60_000) {
        activityLogs[k] = pEntry;
      }
    }
  }

  const result = {
    waitingIds,
    waitingCodes,
    waitingReasons,
    headlessReasons,
    activityLogs,
    waitingCount: waitingIds.length,
    runningHeadlessIds: [...runningHeadlessIdSet],
    runningHeadlessCodes: [...runningHeadlessCodeSet],
    headedRunningIds: [...headedRunningIdSet],
  };
  _waitingStateCache = { at: Date.now(), value: result };
  return result;
}

module.exports = {
  collectWaitingAgentHeadlessState,
  healStaleFailedProfiles,
  boostWaitingAgentProfile,
  readPriorityBoostMap,
  recordProfileActivityLog,
  readProfileActivityLogsMap,
};
