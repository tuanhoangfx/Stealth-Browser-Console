"use strict";
/**
 * Multi-Domain Auto-Drainer for the unified P0003 Deferred User-Headed Queue SSOT.
 *
 * Maps every deferred `taskType` to its domain worker/handler (zero `unhandled_deferred_item`),
 * enforces per-domain PID + cooldown deduplication, and never touches `8000–8999` or
 * actively User-Headed (`headless: false`) profiles.
 */
const fs = require("node:fs");
const path = require("node:path");

const {
  TRANSIENT_GUARD_TASK_TYPES,
  completeDeferredItem,
  isCustomer8xxxProfileCode,
  normalizeQueueProfileCode,
  normalizeTaskType,
  readDeferredQueue,
} = require("./deferred-headed-queue-ssot.cjs");
const { extractProfileCode } = require("./profile-code.cjs");

const NODEW_EXE = "E:\\Dev\\.tools\\nodew.exe";
const SHIP_DIR = "E:\\Dev\\Tool\\.ship";
const SOCIAL_HUB_DATA_DIR = "E:\\Dev\\Tool\\P0002-Social-Hub\\data";

const DOMAIN_DISPATCH_TABLE = {
  antigravity_appeal: {
    taskTypes: new Set(["appeal-antigravity-tos", "reconcile-ag-appeal", "unlock-ag-validation"]),
    scriptPath: "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\appeal-antigravity-tos-fleet.mjs",
    buildArgs: () => ["--drain-deferred"],
    pidFile: path.join(SHIP_DIR, "appeal-antigravity-tos-drain.pid"),
    logFile: path.join(SHIP_DIR, "appeal-antigravity-tos-fleet.log"),
    callerId: "agent:deferred-ag-drain",
    cooldownMs: 120_000,
  },
  antigravity_cloud: {
    taskTypes: new Set(["reconcile-cloud-ag", "repair-youtube-api-key", "probe-ag"]),
    scriptPath: "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\reconcile-google-cloud-antigravity-fleet.mjs",
    buildArgs: (codes) => ["--daemon", ...(codes.length ? [`--codes=${codes.join(",")}`] : [])],
    pidFile: path.join(SHIP_DIR, "reconcile-cloud-ag-drain.pid"),
    logFile: path.join(SHIP_DIR, "reconcile-cloud-ag-drain.log"),
    callerId: "agent:deferred-cloud-ag-drain",
    cooldownMs: 120_000,
  },
  gmail_recover_2fa: {
    taskTypes: new Set(["recover-gmail-2fa"]),
    scriptPath: "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\recover-and-standardize-gmail-after-headed.mjs",
    buildArgs: () => ["--drain-deferred"],
    pidFile: path.join(SHIP_DIR, "recover-gmail-2fa-drain.pid"),
    logFile: path.join(SHIP_DIR, "recover-gmail-2fa-drain.log"),
    callerId: "agent:deferred-gmail-recover-drain",
    cooldownMs: 60_000,
  },
  expired_orders: {
    taskTypes: new Set(["revoke-expired-order"]),
    scriptPath: "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\revoke-expired-action-orders.mjs",
    buildArgs: (codes) => [
      "--drain-deferred",
      ...(codes.length === 1 && /^\d{4}$/.test(codes[0]) ? [codes[0]] : []),
      "--apply",
      "--telegram",
    ],
    pidFile: path.join(SOCIAL_HUB_DATA_DIR, "deferred-order-drain.pid"),
    logFile: path.join(SOCIAL_HUB_DATA_DIR, "deferred-order-drain.log"),
    callerId: "agent:deferred-order-drain",
    cooldownMs: 60_000,
  },
  outlook_2fa: {
    taskTypes: new Set(["outlook-2fa-pending", "autologin-outlook"]),
    scriptPath: "E:\\Dev\\Tool\\P0002-Social-Hub\\scripts\\run-outlook-2fa-pending-worker.mjs",
    buildArgs: (codes) => ["--drain-deferred", ...(codes.length ? [`--codes=${codes.join(",")}`] : [])],
    pidFile: path.join(SHIP_DIR, "deferred-outlook-2fa-drain.pid"),
    logFile: path.join(SHIP_DIR, "deferred-outlook-2fa-drain.log"),
    callerId: "agent:deferred-outlook-drain",
    cooldownMs: 90_000,
  },
  chatgpt_appeal: {
    taskTypes: new Set(["chatgpt-appeal-recheck", "autologin-chatgpt"]),
    scriptPath: "E:\\Dev\\Tool\\P0002-Social-Hub\\scripts\\run-chatgpt-appeal-recheck-worker.mjs",
    buildArgs: (codes) => ["--drain-deferred", ...(codes.length ? [`--codes=${codes.join(",")}`] : [])],
    pidFile: path.join(SHIP_DIR, "deferred-chatgpt-appeal-drain.pid"),
    logFile: path.join(SHIP_DIR, "deferred-chatgpt-appeal-drain.log"),
    callerId: "agent:deferred-chatgpt-drain",
    cooldownMs: 90_000,
  },
  elevenlabs_recovery: {
    taskTypes: new Set(["elevenlabs-password-recovery"]),
    scriptPath: "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\reset-elevenlabs-passwords.mjs",
    buildArgs: (codes) => ["--drain-deferred", ...(codes.length ? [`--codes=${codes.join(",")}`] : [])],
    pidFile: path.join(SHIP_DIR, "deferred-elevenlabs-reset-drain.pid"),
    logFile: path.join(SHIP_DIR, "deferred-elevenlabs-reset-drain.log"),
    callerId: "agent:deferred-elevenlabs-reset-drain",
    cooldownMs: 90_000,
  },
  elevenlabs_seed: {
    taskTypes: new Set(["elevenlabs-session-seed"]),
    scriptPath: "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\sweep-elevenlabs-login-and-plan.mjs",
    buildArgs: (codes) => ["--drain-deferred", ...(codes.length ? [`--codes=${codes.join(",")}`] : [])],
    pidFile: path.join(SHIP_DIR, "deferred-elevenlabs-seed-drain.pid"),
    logFile: path.join(SHIP_DIR, "deferred-elevenlabs-seed-drain.log"),
    callerId: "agent:deferred-elevenlabs-seed-drain",
    cooldownMs: 90_000,
  },
  vpn_verify: {
    taskTypes: new Set(["vpn-live-login-verify"]),
    scriptPath: "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\verify-nord-surfshark-stealth.mjs",
    buildArgs: (codes) => ["--drain-deferred", ...(codes.length ? [`--codes=${codes.join(",")}`] : [])],
    pidFile: path.join(SHIP_DIR, "deferred-vpn-verify-drain.pid"),
    logFile: path.join(SHIP_DIR, "deferred-vpn-verify-drain.log"),
    callerId: "agent:deferred-vpn-drain",
    cooldownMs: 120_000,
  },
  ai_prewarm: {
    taskTypes: new Set(["ai-service-prewarm"]),
    scriptPath: "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\prewarm-ai-service-profiles.mjs",
    buildArgs: (codes) => ["--drain-deferred", ...(codes.length ? [`--codes=${codes.join(",")}`] : [])],
    pidFile: path.join(SHIP_DIR, "deferred-ai-prewarm-drain.pid"),
    logFile: path.join(SHIP_DIR, "deferred-ai-prewarm-drain.log"),
    callerId: "agent:deferred-ai-prewarm-drain",
    cooldownMs: 90_000,
  },
  daemon4_relogin: {
    taskTypes: new Set([
      "gmail-totp-relogin",
      "autologin-gmail",
      "autologin-facebook",
      "autologin-claude",
      "autologin-service",
    ]),
    scriptPath: "E:\\Dev\\Tool\\P0002-Social-Hub\\scripts\\heal-gmail-totp-relogin-worker.mjs",
    buildArgs: (codes) => ["--drain-deferred", ...(codes.length ? [`--codes=${codes.join(",")}`] : [])],
    pidFile: path.join(SHIP_DIR, "deferred-daemon4-drain.pid"),
    logFile: path.join(SHIP_DIR, "deferred-daemon4-drain.log"),
    callerId: "agent:deferred-daemon4-drain",
    cooldownMs: 90_000,
  },
  g1_family_12m_appeal: {
    taskTypes: new Set([
      "g1_family_12m_appeal",
      "g1_probe_12m",
      "approve_gco_verify",
      "join_latest_family_invite",
    ]),
    scriptPath: "E:\\Dev\\Tool\\P0020-Data-Box\\scripts\\appeal-g1-family-12m-limit.mjs",
    buildArgs: (codes) => ["--drain-deferred", ...(codes.length ? [`--codes=${codes.join(",")}`] : [])],
    pidFile: path.join(SHIP_DIR, "deferred-g1-12m-appeal-drain.pid"),
    logFile: path.join(SHIP_DIR, "deferred-g1-12m-appeal-drain.log"),
    callerId: "agent:deferred-g1-12m-drain",
    cooldownMs: 30_000,
  },
};

const lastDomainDispatchAt = globalThis.__STEALTH_DEFERRED_DOMAIN_DISPATCH__ || new Map();
globalThis.__STEALTH_DEFERRED_DOMAIN_DISPATCH__ = lastDomainDispatchAt;

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

function isPidFileAlive(pidFile) {
  try {
    if (!pidFile || !fs.existsSync(pidFile)) return false;
    const raw = fs.readFileSync(pidFile, "utf8").trim();
    const pid = Number(raw);
    return isPidAlive(pid);
  } catch {
    return false;
  }
}

function resolveWinShellStartHidden() {
  const candidates = [
    path.resolve(__dirname, "../../../scripts/lib/win-shell-env.cjs"),
    "E:\\Dev\\Tool\\scripts\\lib\\win-shell-env.cjs",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const mod = require(p);
      if (typeof mod?.startHiddenDetachedProcess === "function") {
        return mod.startHiddenDetachedProcess;
      }
    }
  }
  return null;
}

function collectLiveHeadedSnapshot({ sessionManager, profileService }) {
  const runningHeadedCodes = new Set();
  const runningHeadedIds = new Set();
  try {
    const running = (typeof sessionManager?.listRunning === "function" ? sessionManager.listRunning() : []) || [];
    for (const r of running) {
      if (r && r.headless !== true && r.shadowLane !== true) {
        const pid = String(r.id || r.profileId || "").trim();
        if (pid) runningHeadedIds.add(pid);
        const c = extractProfileCode(r.name || "", pid);
        if (c) runningHeadedCodes.add(normalizeQueueProfileCode(c));
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const { listProfileChromeWindowsNative } = require("./taskbar-apply-worker.cjs");
    const wins = (typeof listProfileChromeWindowsNative === "function" ? listProfileChromeWindowsNative() : []) || [];
    for (const w of wins) {
      const c = extractProfileCode(w?.code || w?.title || "", "");
      if (c) runningHeadedCodes.add(normalizeQueueProfileCode(c));
    }
  } catch {
    /* ignore */
  }
  const resolveProfile = (idOrCode) => {
    if (!profileService || typeof profileService.getProfile !== "function") return null;
    const raw = String(idOrCode || "").trim();
    if (!raw) return null;
    const byId = profileService.getProfile(raw);
    if (byId) return byId;
    if (typeof profileService.findProfileByName === "function") {
      return profileService.findProfileByName(raw) || null;
    }
    return null;
  };
  return { runningHeadedCodes, runningHeadedIds, resolveProfile };
}

function classifyDomainForTaskType(taskType) {
  const norm = normalizeTaskType(taskType);
  if (TRANSIENT_GUARD_TASK_TYPES.has(norm)) return "transient_guard";
  for (const [domainKey, cfg] of Object.entries(DOMAIN_DISPATCH_TABLE)) {
    if (cfg.taskTypes.has(norm)) return domainKey;
  }
  return "generic_sync";
}

function drainReadyDeferredQueue({
  sessionManager = null,
  profileService = null,
  targetCodes = null,
  taskTypes = null,
  dryRun = false,
  queuePath = null,
} = {}) {
  const { runningHeadedCodes, runningHeadedIds, resolveProfile } = collectLiveHeadedSnapshot({
    sessionManager,
    profileService,
  });

  const q = readDeferredQueue({
    ...(queuePath ? { queuePath } : {}),
    runningHeadedCodes,
    runningHeadedIds,
    resolveProfile,
  });

  const codeFilter = Array.isArray(targetCodes) && targetCodes.length > 0
    ? new Set(targetCodes.map(normalizeQueueProfileCode).filter(Boolean))
    : null;
  const typeFilter = Array.isArray(taskTypes) && taskTypes.length > 0
    ? new Set(taskTypes.map((t) => normalizeTaskType(t)))
    : null;

  const now = Date.now();
  const readyItems = (q.items || []).filter((item) => {
    if (item.status !== "ready_for_retry" || !item.readyForAgentRetry) return false;
    if (isCustomer8xxxProfileCode(item.profileCode)) return false;
    if (item.nextRetryAt && Number(item.nextRetryAt) > now) return false;
    if (codeFilter && !codeFilter.has(normalizeQueueProfileCode(item.profileCode))) return false;
    if (typeFilter && !typeFilter.has(item.taskType)) return false;
    return true;
  });

  const byDomain = new Map();
  const genericItems = [];
  for (const item of readyItems) {
    const domain = classifyDomainForTaskType(item.taskType);
    if (domain === "generic_sync") {
      genericItems.push(item);
    } else if (domain !== "transient_guard") {
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain).push(item);
    }
  }

  const dispatched = [];
  const skippedCooldown = [];
  const settledGeneric = [];
  const startHiddenDetachedProcess = dryRun ? null : resolveWinShellStartHidden();
  const runtimeExe = fs.existsSync(NODEW_EXE) ? NODEW_EXE : process.execPath;

  for (const [domainKey, items] of byDomain.entries()) {
    const cfg = DOMAIN_DISPATCH_TABLE[domainKey];
    const codes = [...new Set(items.map((x) => normalizeQueueProfileCode(x.profileCode)).filter(Boolean))];
    if (!cfg || !fs.existsSync(cfg.scriptPath)) {
      continue;
    }
    const lastAt = Number(lastDomainDispatchAt.get(domainKey) || 0);
    if (now - lastAt < cfg.cooldownMs || isPidFileAlive(cfg.pidFile)) {
      skippedCooldown.push({ domain: domainKey, codes, count: items.length, reason: "cooldown_or_running" });
      continue;
    }
    if (dryRun || !startHiddenDetachedProcess) {
      dispatched.push({ domain: domainKey, codes, count: items.length, dryRun: true, script: cfg.scriptPath });
      continue;
    }
    lastDomainDispatchAt.set(domainKey, now);
    const args = [cfg.scriptPath, ...cfg.buildArgs(codes, items)];
    const pid = startHiddenDetachedProcess(runtimeExe, args, {
      cwd: "E:\\Dev",
      pidFile: cfg.pidFile,
      logFile: cfg.logFile,
      env: { ...process.env, STEALTH_AGENT_CALLER: cfg.callerId },
    });
    dispatched.push({ domain: domainKey, codes, count: items.length, pid, script: cfg.scriptPath });
  }

  if (!dryRun) {
    for (const item of genericItems) {
      completeDeferredItem(
        {
          id: item.id,
          ok: true,
          outcome: "reconciled_generic_no_pending_payload",
        },
        queuePath ? { queuePath } : {},
      );
      settledGeneric.push({ id: item.id, code: item.profileCode, taskType: item.taskType });
    }
  }

  return {
    ok: true,
    ssotPath: q.ssotPath,
    readyCount: readyItems.length,
    dispatched,
    skippedCooldown,
    settledGeneric,
  };
}

module.exports = {
  DOMAIN_DISPATCH_TABLE,
  collectLiveHeadedSnapshot,
  classifyDomainForTaskType,
  drainReadyDeferredQueue,
};
