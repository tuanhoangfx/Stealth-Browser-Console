"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SOCIAL_DATA_DIR = "E:\\Dev\\Tool\\P0002-Social-Hub\\data";
const KNOWN_USB_ALIAS_MAP = {
  "33241FDH2004B9": "192.168.0.253:5555",
};

function readJsonSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readPidSafe(pidFile) {
  try {
    if (!pidFile || !fs.existsSync(pidFile)) return null;
    const n = Number(String(fs.readFileSync(pidFile, "utf8") || "").trim());
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function isPidAliveDefault(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

function clampPct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function isFreshTimestamp(isoOrMs, nowMs, staleAfterMs = 15 * 60_000) {
  if (!isoOrMs) return false;
  const ts = typeof isoOrMs === "number" ? isoOrMs : Date.parse(String(isoOrMs));
  return Number.isFinite(ts) && nowMs - ts <= staleAfterMs;
}

function normalizeDeviceLabel(serial) {
  if (serial === "192.168.0.208:5555") return "Pixel 6a (.208)";
  if (serial === "33241FDH2004B9" || serial === "192.168.0.253:5555") return "Pixel 7 (.253 / USB)";
  if (serial === "192.168.0.120:5555") return "Samsung S9+ (.120)";
  if (serial === "ios:192.168.0.222") return "iPhone 6s Plus (.222)";
  if (serial === "ios:192.168.0.183") return "iPhone 6s (.183)";
  return serial;
}

function normalizeIosChargeMode(d) {
  if (!d?.ok) return "offline";
  if (d.isCharging) return "charging";
  if (d.externalConnected) {
    return d.chargeLimiterEnabled ? "hold_store_mode" : "idle_plugged";
  }
  return "unplugged";
}

function buildDevicesBoard(watchdogJson) {
  const rawDevices = Array.isArray(watchdogJson?.devices) ? watchdogJson.devices : [];
  const onlineSet = new Set(rawDevices.filter((d) => d?.ok).map((d) => d.serial));
  const filtered = rawDevices.filter((d) => {
    const alias = KNOWN_USB_ALIAS_MAP[d?.serial];
    if (alias && (onlineSet.has(alias) || rawDevices.some((x) => x?.serial === alias))) {
      return false;
    }
    return true;
  });

  const bySerial = new Map();
  for (const d of rawDevices) {
    if (!d?.serial) continue;
    // Deduplicate Pixel 7 USB (33241FDH2004B9) vs Wi-Fi (192.168.0.253:5555): keep whichever is online (ok=true).
    if (d.serial === "192.168.0.253:5555" && !d.ok && rawDevices.some((x) => x?.serial === "33241FDH2004B9" && x?.ok)) {
      continue;
    }
    if (d.serial === "33241FDH2004B9" && !d.ok && rawDevices.some((x) => x?.serial === "192.168.0.253:5555" && x?.ok)) {
      continue;
    }
    if (d.serial === "192.168.0.253:5555" && rawDevices.some((x) => x?.serial === "33241FDH2004B9" && x?.ok)) {
      continue;
    }
    const isIos = String(d.serial).startsWith("ios:");
    const chargeMode = isIos
      ? normalizeIosChargeMode(d)
      : d.chargeMode ||
        (!d.ok
          ? "offline"
          : d.cableAttached === false && d.acPowered === false
            ? "unplugged"
            : d.storeMode === 1
              ? "hold_store_mode"
              : "charging");
    bySerial.set(d.serial, {
      serial: d.serial,
      label: normalizeDeviceLabel(d.serial),
      platform: isIos ? "ios" : "android",
      ok: Boolean(d.ok),
      batteryLevel: d.batteryLevel ?? null,
      batteryTempC: d.batteryTempC ?? null,
      acPowered: isIos ? (d.externalConnected ?? null) : (d.acPowered ?? null),
      cableAttached: isIos ? (d.externalConnected ?? null) : (d.cableAttached ?? d.acPowered ?? null),
      attachedDev: d.attachedDev ?? (isIos && d.externalConnected ? "LIGHTNING" : null),
      chargeMode,
      storeMode: d.storeMode ?? null,
      slateMode: d.slateMode ?? null,
      chargeDisable: d.chargeDisable ?? null,
      chargeLimiterEnabled: d.chargeLimiterEnabled ?? null,
      storeModeRecoveryTriggered: Boolean(d.storeModeRecoveryTriggered),
      unreachableReason: d.ok ? null : (d.unreachableReason || null),
      ramUsedPct: d.ramUsedPct ?? null,
    });
  }

  for (const required of [
    "192.168.0.208:5555",
    "33241FDH2004B9",
    "192.168.0.120:5555",
    "ios:192.168.0.222",
    "ios:192.168.0.183",
  ]) {
    if (!bySerial.has(required)) {
      bySerial.set(required, {
        serial: required,
        label: normalizeDeviceLabel(required),
        platform: required.startsWith("ios:") ? "ios" : "android",
        ok: false,
        batteryLevel: null,
        batteryTempC: null,
        acPowered: null,
        cableAttached: null,
        attachedDev: null,
        chargeMode: "offline",
        storeMode: null,
        slateMode: null,
        chargeDisable: null,
        chargeLimiterEnabled: null,
        storeModeRecoveryTriggered: false,
        unreachableReason: "watchdog_pending",
        ramUsedPct: null,
      });
    }
  }
  return Array.from(bySerial.values());
}

/**
 * Builds the live Mobile Farm Execution Progress & Task Board payload from P0002 runtime status files.
 */
function collectMobileFarmExecutionBoard({
  dataDir = process.env.P0002_SOCIAL_DATA_DIR || DEFAULT_SOCIAL_DATA_DIR,
  nowMs = Date.now(),
  isPidAliveFn = isPidAliveDefault,
} = {}) {
  const watchdog = readJsonSafe(path.join(dataDir, "android-hardware-watchdog-status.json"));
  const fbBatch = readJsonSafe(path.join(dataDir, "fb-multi-method-100-daemon-status.json"));
  const gmailDaemon = readJsonSafe(path.join(dataDir, "gmail-daemon4-status.json"));
  const outlookDaemon = readJsonSafe(path.join(dataDir, "outlook-daemon1-status.json"));
  const fasttrack = readJsonSafe(path.join(dataDir, "fasttrack-totp-tiktok-healer-status.json"));
  const fanpage = readJsonSafe(path.join(dataDir, "fanpage-fleet-daemon-status.json"));
  const musePid = readPidSafe(path.join(dataDir, "logs", "farm-muse-fleet-onboard.pid"));

  const devices = buildDevicesBoard(watchdog);
  const onlineDevices = devices.filter((d) => d.ok).length;
  const tasks = [];

  if (fbBatch) {
    const target = Number(fbBatch.targetTotal || 100);
    const live = Number(fbBatch.liveTotal || 0);
    const rawStatus = String(fbBatch.status || "").toLowerCase();
    const pidAlive = fbBatch.pid ? isPidAliveFn(fbBatch.pid) : isFreshTimestamp(fbBatch.updatedAt, nowMs, 20 * 60_000);
    const active =
      pidAlive &&
      (rawStatus === "running" || rawStatus === "cooldown" || rawStatus.startsWith("circuit_breaker")) &&
      isFreshTimestamp(fbBatch.updatedAt, nowMs, 25 * 60_000);
    const stepPrefix =
      rawStatus === "cooldown"
        ? "Cooldown -> "
        : rawStatus.startsWith("circuit_breaker")
          ? "Backoff 15m -> "
          : "";
    tasks.push({
      id: "fb-multi-method-100",
      title: "FB Multi-Method 100 Campaign",
      kind: "campaign",
      status: live >= target ? "completed" : active ? "running" : "standby",
      percent: clampPct((live / Math.max(1, target)) * 100),
      progressLabel: `${live} / ${target} live`,
      currentStep: `Wave #${fbBatch.waveNumber || 0} · ${stepPrefix}${fbBatch.activeMethod || "idle"}`,
      metricsText: `Remaining ${fbBatch.remainingTo100 ?? Math.max(0, target - live)} · Pool ${fbBatch.usableGmailPool ?? 0} Gmail · $${Number(fbBatch.grizzlyBalanceUsd || 0).toFixed(2)} SMS`,
      targetDevice: fbBatch.lastAttempt?.iosHost || fbBatch.lastAttempt?.serial || "Multi-Node",
      updatedAt: fbBatch.updatedAt || null,
    });
  }

  if (gmailDaemon) {
    const attempted = Number(gmailDaemon.totalAttempted || 0);
    const loggedIn = Number(gmailDaemon.totalLoggedIn || 0);
    const rem = Number(gmailDaemon.totalQueueRemaining || 0);
    const denom = loggedIn + rem;
    const pidAlive = gmailDaemon.pid ? isPidAliveFn(gmailDaemon.pid) : true;
    const active = pidAlive && isFreshTimestamp(gmailDaemon.updatedAt || gmailDaemon.lastBatchAt, nowMs, 20 * 60_000);
    tasks.push({
      id: "gmail-daemon",
      title: "Gmail Pool & Recovery Daemon",
      kind: "daemon",
      status: rem === 0 && attempted > 0 ? "completed" : active ? "running" : "standby",
      percent: denom > 0 ? clampPct((loggedIn / denom) * 100) : rem === 0 ? 100 : 0,
      progressLabel: `${loggedIn} live · ${rem} queued`,
      currentStep: `Batch #${gmailDaemon.batchesRun || 0} · ${gmailDaemon.currentFastBrowserCode ? `#${gmailDaemon.currentFastBrowserCode}` : "Queue Sweep"}`,
      metricsText: `Attempted ${attempted} · Challenged ${gmailDaemon.challengedTotpRemaining ?? 0} · Not Logged ${gmailDaemon.notLoggedInRemaining ?? 0}`,
      targetDevice: "PC Stealth Pool",
      updatedAt: gmailDaemon.updatedAt || gmailDaemon.lastBatchAt || null,
    });
  }

  if (outlookDaemon) {
    const attempted = Number(outlookDaemon.totalAttempted || 0);
    const rem = Number(outlookDaemon.totalQueueRemaining || 0);
    const denom = Math.max(1, attempted + rem);
    const pidAlive = outlookDaemon.pid ? isPidAliveFn(outlookDaemon.pid) : true;
    const active = pidAlive && isFreshTimestamp(outlookDaemon.updatedAt || outlookDaemon.lastBatchAt, nowMs, 20 * 60_000);
    tasks.push({
      id: "outlook-daemon",
      title: "Outlook & OWA Heal Daemon",
      kind: "daemon",
      status: rem === 0 && attempted > 0 ? "completed" : active ? "running" : "standby",
      percent: rem === 0 ? 100 : clampPct((attempted / denom) * 100),
      progressLabel: `${attempted} processed · ${rem} left`,
      currentStep: `Batch #${outlookDaemon.batchesRun || 0} · Active ${outlookDaemon.currentBrowserCode ? `#${outlookDaemon.currentBrowserCode}` : "Idle"}`,
      metricsText: `Challenged ${outlookDaemon.challengedHealRemaining ?? 0} · Shared Sync ${outlookDaemon.totalSharedServicesSynced ?? 0}`,
      targetDevice: "PC Stealth Pool",
      updatedAt: outlookDaemon.updatedAt || outlookDaemon.lastBatchAt || null,
    });
  }

  if (fasttrack) {
    const totalHealed =
      Number(fasttrack.totalTotpHealed || 0) +
      Number(fasttrack.totalOutlookHealed || 0) +
      Number(fasttrack.totalGmailHealed || 0) +
      Number(fasttrack.totalTikTokHealed || 0);
    const totalAtt =
      Number(fasttrack.totalTotpAttempted || 0) +
      Number(fasttrack.totalOutlookAttempted || 0) +
      Number(fasttrack.totalGmailAttempted || 0) +
      Number(fasttrack.totalTikTokAttempted || 0);
    const pidAlive = fasttrack.pid ? isPidAliveFn(fasttrack.pid) : false;
    const active = pidAlive && isFreshTimestamp(fasttrack.updatedAt, nowMs, 25 * 60_000);
    tasks.push({
      id: "fasttrack-healer",
      canControl: true,
      title: "FastTrack TOTP / Mail / TikTok Healer",
      kind: "healer",
      status: active ? "running" : "standby",
      percent: totalAtt > 0 ? clampPct((totalHealed / totalAtt) * 100) : active ? 100 : 0,
      progressLabel: `Round #${fasttrack.round || 1} · ${totalHealed}/${Math.max(1, totalAtt)} healed`,
      currentStep: active ? `Phase: ${fasttrack.state || "running"}` : `Stopped (${fasttrack.state || "idle"})`,
      metricsText: `TOTP ${fasttrack.totalTotpHealed || 0}/${fasttrack.totalTotpAttempted || 0} · Mail ${(fasttrack.totalGmailHealed || 0) + (fasttrack.totalOutlookHealed || 0)} · TikTok ${fasttrack.totalTikTokHealed || 0}`,
      targetDevice: "Cross-Account",
      updatedAt: fasttrack.updatedAt || null,
    });
  }

  if (fanpage) {
    const total = Number(fanpage.totalPagesInDb || 0);
    const live = Number(fanpage.liveTotalPages || 0);
    const pidAlive = fanpage.pid ? isPidAliveFn(fanpage.pid) : false;
    const active = pidAlive && isFreshTimestamp(fanpage.updatedAt, nowMs, 60 * 60_000);
    tasks.push({
      id: "fanpage-fleet",
      canControl: true,
      title: "Fanpage Fleet Monitor",
      kind: "fleet",
      status: active ? "running" : "standby",
      percent: total > 0 ? clampPct((live / total) * 100) : 0,
      progressLabel: `${live} / ${total} pages live`,
      currentStep: `${active ? "Active" : "Standby"} (${fanpage.state || "idle"}) · Proxy ${fanpage.proxyPoolSummary?.aliveVaultProxiesCount ?? 0} alive`,
      metricsText: String(fanpage.lastNote || `${fanpage.liveCrmPages || 0} CRM + ${fanpage.liveCommunityPages || 0} Community`).slice(0, 95),
      targetDevice: "P0002 Fleet",
      updatedAt: fanpage.updatedAt || null,
    });
  }

  if (musePid) {
    const alive = isPidAliveFn(musePid);
    tasks.push({
      id: "muse-fleet-onboard",
      title: "Muse Fleet Onboard",
      kind: "onboard",
      status: alive ? "running" : "standby",
      percent: alive ? 50 : 100,
      progressLabel: alive ? `PID ${musePid} active` : "Completed / Idle",
      currentStep: alive ? "Running Muse onboard sweep" : "Idle",
      metricsText: "Worker: farm-muse-fleet-onboard",
      targetDevice: "Stealth / Mail",
      updatedAt: null,
    });
  }

  if (watchdog) {
    const s9 = devices.find((d) => d.serial === "192.168.0.120:5555");
    const hasOffline = onlineDevices < devices.length;
    tasks.push({
      id: "hardware-watchdog",
      canControl: true,
      title: "24/7 Device Power & Thermal Guard",
      kind: "guard",
      status: hasOffline ? "attention" : isFreshTimestamp(watchdog.updatedAt, nowMs, 10 * 60_000) ? "running" : "standby",
      percent: clampPct((onlineDevices / Math.max(1, devices.length)) * 100),
      progressLabel: `${onlineDevices} / ${devices.length} online`,
      currentStep: s9?.ok
        ? `S9+ ${s9.batteryLevel ?? "?"}% (${s9.chargeMode || "ok"}${s9.attachedDev ? ` · ${s9.attachedDev}` : ""})`
        : "Scanning USB / Wi-Fi / SSH nodes",
      metricsText: `Watchdog PID ${watchdog.pid || "?"} · Offline: ${devices.filter((d) => !d.ok).map((d) => d.label).join(", ") || "None"}`,
      targetDevice: `${devices.length}-Node Farm`,
      updatedAt: watchdog.updatedAt || null,
    });
  }

  const runningTasks = tasks.filter((t) => t.status === "running").length;
  const attentionTasks = tasks.filter((t) => t.status === "attention").length;
  const overallProgressPct =
    tasks.length > 0
      ? Math.round(tasks.reduce((acc, t) => acc + Number(t.percent || 0), 0) / tasks.length)
      : 0;

  const kaizenStats =
    readJsonSafe(path.join(dataDir, "mobile-vault", "multi-platform-kaizen-stats.json")) ||
    readJsonSafe(path.join(dataDir, "multi-platform-kaizen-stats.json"));
  const experiments = kaizenStats
    ? {
        updatedAt: kaizenStats.updatedAt || null,
        totalRunsRecorded: Number(kaizenStats.totalRunsRecorded || 0),
        bestByPlatform: kaizenStats.bestByPlatform || {},
        lanes: Array.isArray(kaizenStats.summary) ? kaizenStats.summary.slice(0, 14) : [],
      }
    : null;

  return {
    ok: true,
    updatedAt: new Date(nowMs).toISOString(),
    summary: {
      runningTasks,
      attentionTasks,
      totalTasks: tasks.length,
      overallProgressPct,
      onlineDevices,
      totalDevices: devices.length,
    },
    devices,
    tasks,
    experiments,
  };
}

const CONTROLLED_DAEMONS = Object.freeze({
  "gmail-daemon": {
    scriptRel: path.join("scripts", "run-gmail-daemon.mjs"),
    args: [],
    statusFile: "gmail-daemon4-status.json",
    logName: "gmail-daemon4.log",
  },
  "fasttrack-healer": {
    scriptRel: path.join("scripts", "run-fasttrack-totp-and-tiktok-healer.mjs"),
    args: ["--daemon", "--interval-min", "10"],
    statusFile: "fasttrack-totp-tiktok-healer-status.json",
    logName: "fasttrack-healer.log",
  },
  "fanpage-fleet": {
    scriptRel: path.join("scripts", "fanpage-fleet-daemon.mjs"),
    args: ["--daemon", "--interval-min", "15"],
    statusFile: "fanpage-fleet-daemon-status.json",
    logName: "fanpage-fleet.log",
  },
  "hardware-watchdog": {
    scriptRel: path.join("scripts", "run-android-hardware-watchdog.mjs"),
    args: ["--daemon", "--interval-sec", "45"],
    statusFile: "android-hardware-watchdog-status.json",
    logName: "hardware-watchdog.log",
  },
});

function resolveNodeBinary() {
  if (process.env.P0002_NODE_BIN && fs.existsSync(process.env.P0002_NODE_BIN)) {
    return process.env.P0002_NODE_BIN;
  }
  const winNode = "C:\\Program Files\\nodejs\\node.exe";
  if (fs.existsSync(winNode)) return winNode;
  return process.versions?.electron ? "node" : process.execPath;
}

function controlMobileFarmDaemon({
  daemonId = "",
  action = "start",
  dataDir = process.env.P0002_SOCIAL_DATA_DIR || DEFAULT_SOCIAL_DATA_DIR,
  isPidAliveFn = isPidAliveDefault,
} = {}) {
  const id = String(daemonId || "").trim();
  const cfg = CONTROLLED_DAEMONS[id];
  if (!cfg) {
    return { ok: false, error: `Unknown controllable daemonId: ${id}` };
  }
  const socialRoot = path.resolve(dataDir, "..");
  const scriptAbs = path.join(socialRoot, cfg.scriptRel);
  if (!fs.existsSync(scriptAbs)) {
    return { ok: false, error: `Script not found: ${scriptAbs}` };
  }

  const st = readJsonSafe(path.join(dataDir, cfg.statusFile));
  const existingPid = Number(st?.pid || 0);
  const alive = existingPid > 0 && isPidAliveFn(existingPid);
  if (alive && action !== "restart") {
    return { ok: true, daemonId: id, pid: existingPid, alreadyRunning: true };
  }
  if (alive && action === "restart") {
    try {
      process.kill(existingPid);
    } catch {
      /* ignore */
    }
  }

  const logsDir = path.join(dataDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, cfg.logName);
  const { spawn } = require("node:child_process");
  const outFd = fs.openSync(logFile, "a");
  try {
    const child = spawn(resolveNodeBinary(), [scriptAbs, ...cfg.args], {
      cwd: socialRoot,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", outFd, outFd],
    });
    child.unref();
    return {
      ok: true,
      started: true,
      action,
      daemonId: id,
      pid: child.pid || null,
      logFile,
    };
  } finally {
    try {
      fs.closeSync(outFd);
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  collectMobileFarmExecutionBoard,
  controlMobileFarmDaemon,
  CONTROLLED_DAEMONS,
  DEFAULT_SOCIAL_DATA_DIR,
};
