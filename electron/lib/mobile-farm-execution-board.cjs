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
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || raw.includes("\u0000")) return null;
    return JSON.parse(raw);
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

function isEmulatorSerial(serial) {
  return /^(?:127\.0\.0\.1:|localhost:|emulator-)/i.test(String(serial || "").trim());
}

function formatFbMethodDisplayLabel(method = "") {
  const m = String(method || "").trim().toLowerCase();
  if (!m) return "idle";
  if (m === "android_mweb_gmail_direct") return "FB Signup (Gmail Pool · Android)";
  if (m === "android_mweb_sms_gmail") return "FB Signup (SMS + Gmail Pool · Android)";
  if (m === "android_mweb_outlook_direct") return "FB Signup (Outlook Pool · Android)";
  if (m === "android_mweb_phone_confirm_outlook") return "FB Signup (SIM + Outlook · Android)";
  if (m === "ios_safari_gmail_s9lte") return "FB Signup (Gmail Pool · iOS 4G LTE)";
  if (m === "ios_safari_gmail_vnproxy") return "FB Signup (Gmail Pool · iOS VN Proxy)";
  if (m === "ios_safari_outlook_pixel7lte") return "FB Signup (Outlook Pool · iOS Pixel7 LTE)";
  if (m === "ios_safari_outlook_vnproxy") return "FB Signup (Outlook Pool · iOS VN Proxy)";
  if (m === "handed_off_to_master_orchestrator") return "Handed off to Master Orchestrator";
  return method;
}

function formatMobileTaskDisplayLabel(task = "") {
  const t = String(task || "").trim();
  if (!t) return "Idle";
  if (t.startsWith("external:")) {
    const inner = t.slice("external:".length);
    if (inner === "fb-multi-method-100") return "FB Factory 200 (Gmail Pool / SMS)";
    return formatFbMethodDisplayLabel(inner);
  }
  if (t === "multi_platform_gmail_probe") return "Gmail Create Probe";
  if (t === "multi_platform_cross_fb") return "IG / Threads Cross-FB (Android 4G)";
  if (t === "mobile_claude_onboard") return "Claude Mobile 4G Onboard";
  if (t === "ios_safari_fb_factory_standby") return "iOS FB Factory Standby (0% Gmail Pruned)";
  return t;
}

function buildDevicesBoard(watchdogJson, masterOrch = null) {
  const rawDevices = Array.isArray(watchdogJson?.devices) ? watchdogJson.devices : [];
  const p7Usb = rawDevices.find((d) => d?.serial === "33241FDH2004B9");
  const p7Wifi = rawDevices.find((d) => d?.serial === "192.168.0.253:5555");
  const keepPixel7Serial =
    p7Wifi?.ok
      ? "192.168.0.253:5555"
      : p7Usb?.ok
        ? "33241FDH2004B9"
        : p7Wifi
          ? "192.168.0.253:5555"
          : "33241FDH2004B9";

  const bySerial = new Map();
  const emulators = [];
  for (const d of rawDevices) {
    if (!d?.serial) continue;
    if (isEmulatorSerial(d.serial)) {
      emulators.push({
        serial: d.serial,
        label: normalizeDeviceLabel(d.serial),
        platform: "android",
        ok: Boolean(d.ok),
        batteryLevel: d.batteryLevel ?? null,
        batteryTempC: d.batteryTempC ?? null,
        ramUsedPct: d.ramUsedPct ?? null,
      });
      continue;
    }
    if ((d.serial === "33241FDH2004B9" || d.serial === "192.168.0.253:5555") && d.serial !== keepPixel7Serial) {
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
      usbPresent: isIos ? (d.externalConnected ?? null) : (d.usbPresent ?? null),
      unpluggedElapsedMin: Number.isFinite(Number(d.unpluggedElapsedMin)) ? Number(d.unpluggedElapsedMin) : 0,
      attachedDev: d.attachedDev ?? (isIos && d.externalConnected ? "LIGHTNING" : null),
      chargeMode,
      storeMode: d.storeMode ?? null,
      slateMode: d.slateMode ?? null,
      chargeDisable: d.chargeDisable ?? null,
      batteryCurrentMa: d.batteryCurrentMa ?? null,
      usbInputCurrentLimit: d.usbInputCurrentLimit ?? null,
      usbVoltageMv: d.usbVoltageMv ?? null,
      tcpmOnline: typeof d.tcpmOnline === "boolean" ? d.tcpmOnline : null,
      chargeLimiterEnabled: d.chargeLimiterEnabled ?? null,
      storeModeRecoveryTriggered: Boolean(d.storeModeRecoveryTriggered),
      unreachableReason: d.ok ? null : (d.unreachableReason || (isIos ? "ios_wifi_offline" : "adb_device_offline")),
      ramUsedPct: d.ramUsedPct ?? null,
    });
  }

  const s9InOrchWhenNoWatchdog =
    !watchdogJson &&
    Array.isArray(masterOrch?.deviceAssignments) &&
    masterOrch.deviceAssignments.some((a) => a?.serial === "192.168.0.120:5555");
  const s9ExplicitlyEnabled =
    String(process.env.MOBILE_FARM_RETIRE_S9 || "0") !== "1" &&
    (String(process.env.ENABLE_S9PLUS_FARM || "0") === "1" ||
      rawDevices.some((d) => d?.serial === "192.168.0.120:5555") ||
      s9InOrchWhenNoWatchdog);
  const requiredSerials = [
    "192.168.0.208:5555",
    keepPixel7Serial,
    ...(s9ExplicitlyEnabled ? ["192.168.0.120:5555"] : []),
    "ios:192.168.0.222",
    "ios:192.168.0.183",
  ];
  for (const required of requiredSerials) {
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
        usbPresent: null,
        unpluggedElapsedMin: 0,
        attachedDev: null,
        chargeMode: "offline",
        storeMode: null,
        slateMode: null,
        chargeDisable: null,
        batteryCurrentMa: null,
        usbInputCurrentLimit: null,
        usbVoltageMv: null,
        tcpmOnline: null,
        chargeLimiterEnabled: null,
        storeModeRecoveryTriggered: false,
        unreachableReason: "watchdog_pending",
        ramUsedPct: null,
      });
    }
  }
  const devices = Array.from(bySerial.values());
  devices.emulators = emulators;
  return devices;
}

function buildFleetEfficiencyEvaluation({ devices = [], masterOrch = null, fbHistory = null, fbBatch = null } = {}) {
  const byNode = fbHistory?.byDeviceNode || {};
  const proxyHealth = fbHistory?.proxyHealth || {};
  const recentResults = Array.isArray(fbBatch?.recentResults) ? fbBatch.recentResults : [];
  const assignMap = new Map(
    (Array.isArray(masterOrch?.deviceAssignments) ? masterOrch.deviceAssignments : []).map((a) => [a?.serial, a]),
  );
  const evalDevices = devices.map((d) => {
    const assign =
      assignMap.get(d.serial) ||
      (d.serial === "33241FDH2004B9" ? assignMap.get("192.168.0.253:5555") : null) ||
      {};
    const nodeKey =
      d.serial === "192.168.0.208:5555"
        ? "pixel6a_208"
        : d.serial === "192.168.0.253:5555" || d.serial === "33241FDH2004B9"
          ? "pixel7_253"
          : d.serial === "192.168.0.120:5555"
            ? "s9plus_120"
            : d.serial === "ios:192.168.0.222"
              ? "ios_6splus_222"
              : "ios_6s_183";
    const nodeRec = byNode[nodeKey] || {};
    const proxyKey =
      nodeKey === "pixel6a_208"
        ? "http://192.168.0.208:31080"
        : nodeKey === "pixel7_253"
          ? "http://192.168.0.253:31082"
          : nodeKey === "s9plus_120"
            ? "http://192.168.0.120:31081"
            : "";
    const pRec = proxyKey ? proxyHealth[proxyKey] : null;
    const convPct = Number(nodeRec.conversionPct || 0);
    const tempOk = d.batteryTempC == null || d.batteryTempC < 38.8;
    const ramPct = d.ramUsedPct == null ? null : Number(d.ramUsedPct);
    const ramBonus = ramPct == null || ramPct < 78 ? 5 : ramPct < 85 ? 2 : -5;
    const productive = Boolean(d.ok && (assign.state === "dispatch" || assign.state === "leased"));
    const devRecent = recentResults.filter(
      (r) =>
        (r?.serial && (r.serial === d.serial || (nodeKey === "pixel7_253" && r.serial === "33241FDH2004B9"))) ||
        (nodeKey === "ios_6splus_222" && r?.iosHost === "192.168.0.222") ||
        (nodeKey === "ios_6s_183" && r?.iosHost === "192.168.0.183"),
    );
    const recentCdpOrPoolFails = devRecent.filter(
      (r) =>
        !r?.ok &&
        /browser_page_closed|chrome_cdp_not_ready|gmail_pool_unavailable|listener|safari_blank_page_timeout/i.test(
          String(r?.outcome || ""),
        ),
    ).length;
    const lastNodeOutcome = String(nodeRec?.lastOutcome || "");
    const nodeTailPenalty =
      recentCdpOrPoolFails >= 2
        ? 18
        : recentCdpOrPoolFails === 1 ||
            /browser_page_closed|chrome_cdp_not_ready|safari_blank_page_timeout/i.test(lastNodeOutcome)
          ? 8
          : 0;
    const lastAssignOutcome = String(assign.lastOutcome || "");
    const formStepStalled = /form_step|in_progress/i.test(lastAssignOutcome);
    const earlyVbusLossActive = Boolean(
      d.ok &&
        d.cableAttached === false &&
        d.acPowered === false &&
        d.usbPresent !== true &&
        Number(d.unpluggedElapsedMin || 0) >= 20 &&
        d.batteryLevel != null &&
        Number(d.batteryLevel) <= 85,
    );
    const isHoldMode = d.chargeDisable === 1 || String(d.chargeMode || "").startsWith("hold_");
    const weakPowerPathActive = Boolean(
      d.ok &&
        !isHoldMode &&
        d.chargeMode !== "unplugged" &&
        (d.usbInputCurrentLimit === 0 ||
          (typeof d.batteryCurrentMa === "number" && d.batteryCurrentMa <= -150)),
    );
    let score = d.ok ? 65 : 15;
    if (productive) score += 15;
    if (tempOk) score += 5;
    score += ramBonus;
    if (convPct >= 10) score += 10;
    else if (convPct >= 5) score += 6;
    if (pRec && /daily_quota_exhausted|captive_302/i.test(String(pRec.lastOutcome || ""))) score -= 12;
    if (formStepStalled) score -= 16;
    if (earlyVbusLossActive) score -= 8;
    if (weakPowerPathActive) score -= 8;
    score -= nodeTailPenalty;
    score = clampPct(score);
    const grade = score >= 85 ? "S" : score >= 75 ? "A" : score >= 60 ? "B" : "C";
    return {
      serial: d.serial,
      label: d.label,
      ok: d.ok,
      productive,
      state: assign.state || (d.ok ? "standby" : "offline"),
      assignedTask: assign.assignedTask || "idle",
      taskLabel: formatMobileTaskDisplayLabel(assign.assignedTask || "idle"),
      efficiencyScore: score,
      grade,
      conversionPct: convPct,
      proxyOutcome: pRec?.lastOutcome || null,
      earlyVbusLossActive,
      weakPowerPathActive,
      autoAction:
        assign.autoAction ||
        (earlyVbusLossActive
          ? "alert_check_usb_vbus_cable"
          : weakPowerPathActive
            ? "check_weak_charger_cable"
            : pRec && /quota_exhausted|captive/i.test(String(pRec.lastOutcome || ""))
              ? "quarantine_captive_proxy_302"
              : formStepStalled
                ? "heal_form_step_stall"
                : nodeTailPenalty >= 15
                  ? "stabilize_cdp_and_pool"
                  : "autonomous_dispatch"),
    };
  });
  if (masterOrch?.fleetEvaluation && typeof masterOrch.fleetEvaluation === "object") {
    const orchMap = new Map((masterOrch.fleetEvaluation.devices || []).map((x) => [x?.serial, x]));
    const mergedDevices = evalDevices.map((ed) => {
      const od = orchMap.get(ed.serial);
      if (!od) return ed;
      const mergedScore = Math.min(Number(od.efficiencyScore ?? ed.efficiencyScore), ed.efficiencyScore);
      const mergedGrade = mergedScore >= 85 ? "S" : mergedScore >= 75 ? "A" : mergedScore >= 60 ? "B" : "C";
      const weakActive = Boolean(ed.weakPowerPathActive || od.weakPowerPathActive);
      const vbusActive = Boolean(ed.earlyVbusLossActive || od.earlyVbusLossActive);
      return {
        ...od,
        taskLabel: od.taskLabel || formatMobileTaskDisplayLabel(od.assignedTask || ed.assignedTask || "idle"),
        efficiencyScore: mergedScore,
        grade: mergedGrade,
        earlyVbusLossActive: vbusActive,
        weakPowerPathActive: weakActive,
        autoAction: vbusActive
          ? "alert_check_usb_vbus_cable"
          : weakActive
            ? "check_weak_charger_cable"
            : od.autoAction || ed.autoAction,
      };
    });
    const mergedOverall =
      mergedDevices.length > 0
        ? Math.round(mergedDevices.reduce((acc, x) => acc + Number(x.efficiencyScore || 0), 0) / mergedDevices.length)
        : 0;
    return {
      ...masterOrch.fleetEvaluation,
      overallScore: mergedOverall,
      grade: mergedOverall >= 85 ? "S" : mergedOverall >= 75 ? "A" : mergedOverall >= 60 ? "B" : "C",
      devices: mergedDevices,
    };
  }
  const productiveDevices = evalDevices.filter((x) => x.productive).length;
  const overallScore =
    evalDevices.length > 0
      ? Math.round(evalDevices.reduce((acc, x) => acc + x.efficiencyScore, 0) / evalDevices.length)
      : 0;
  return {
    overallScore,
    grade: overallScore >= 85 ? "S" : overallScore >= 75 ? "A" : overallScore >= 60 ? "B" : "C",
    productiveDevices,
    totalDevices: evalDevices.length,
    devices: evalDevices,
  };
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
  const masterOrch = readJsonSafe(path.join(dataDir, "mobile-farm-master-orchestrator-status.json"));
  const fbHistory = readJsonSafe(path.join(dataDir, "mobile-vault", "fb-multi-method-100-history.json"));
  const musePid = readPidSafe(path.join(dataDir, "logs", "farm-muse-fleet-onboard.pid"));

  const devices = buildDevicesBoard(watchdog, masterOrch);
  const emulators = Array.isArray(devices.emulators) ? devices.emulators : [];
  const onlineDevices = devices.filter((d) => d.ok).length;
  const fleetEvaluation = buildFleetEfficiencyEvaluation({ devices, masterOrch, fbHistory, fbBatch });
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
      canControl: true,
      title: "FB Multi-Method 100 Campaign",
      kind: "campaign",
      status: live >= target ? "completed" : active ? "running" : "standby",
      phaseLabel:
        live >= target
          ? "DONE"
          : active && rawStatus === "cooldown"
            ? "COOLDOWN BURST"
            : active
              ? "RUNNING"
              : "STANDBY",
      percent: clampPct((live / Math.max(1, target)) * 100),
      progressLabel: `${live} / ${target} live`,
      currentStep: `Wave #${fbBatch.waveNumber || 0} · ${stepPrefix}${formatFbMethodDisplayLabel(fbBatch.activeMethod || "idle")}`,
      metricsText: `Remaining ${fbBatch.remainingTo100 ?? Math.max(0, target - live)} · Pool ${fbBatch.usableGmailPool ?? 0} Gmail · $${Number(fbBatch.grizzlyBalanceUsd || 0).toFixed(2)} SMS`,
      targetDevice: fbBatch.lastAttempt?.iosHost || fbBatch.lastAttempt?.serial || "Multi-Node",
      updatedAt: fbBatch.updatedAt || null,
      waveNumber: Number(fbBatch.waveNumber || 0),
      liveTotal: live,
      targetTotal: target,
      isCooldown: rawStatus === "cooldown",
      recentResults: Array.isArray(fbBatch.recentResults) ? fbBatch.recentResults.slice(-5) : [],
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

  let orchestrator = null;
  if (masterOrch) {
    const masterPidAlive = masterOrch.pid ? isPidAliveFn(masterOrch.pid) : isFreshTimestamp(masterOrch.updatedAt, nowMs, 10 * 60_000);
    const orchActive =
      masterPidAlive &&
      String(masterOrch.status || "").toLowerCase() !== "paused" &&
      isFreshTimestamp(masterOrch.updatedAt, nowMs, 10 * 60_000);
    const assignments = Array.isArray(masterOrch.deviceAssignments) ? masterOrch.deviceAssignments : [];
    const activeDispatchCount = assignments.filter((a) => a?.state === "dispatch" || a?.state === "leased").length;
    const backlogList = Array.isArray(masterOrch.goalBacklog) ? masterOrch.goalBacklog : [];
    const commentApproved = Number(masterOrch.teamAssist?.approvedCount || 0);
    const sentComments = Number(masterOrch.teamAssist?.sentThisSession || 0);
    orchestrator = {
      active: orchActive,
      status: String(masterOrch.status || "standby"),
      cycleNumber: Number(masterOrch.cycleNumber || 0),
      updatedAt: masterOrch.updatedAt || null,
      nextCycleAt: masterOrch.nextCycleAt || null,
      teamAssist: masterOrch.teamAssist || null,
      goalBacklog: backlogList.slice(0, 6),
      deviceAssignments: assignments,
      totals: masterOrch.totals || null,
      evaluation: fleetEvaluation,
    };
    tasks.push({
      id: "mobile-farm-master-orchestrator",
      canControl: true,
      title: `24/7 Master ${devices.length}-Device Orchestrator`,
      kind: "orchestrator",
      status: orchActive ? "running" : "standby",
      phaseLabel: orchActive ? "AUTONOMOUS 24/7" : undefined,
      percent: clampPct((activeDispatchCount / Math.max(1, devices.length)) * 100),
      progressLabel: `Cycle #${masterOrch.cycleNumber || 0} · ${activeDispatchCount}/${devices.length} active`,
      currentStep: `${backlogList[0]?.title || "Multi-Platform + Team Assist"}`,
      metricsText: `Comments ${commentApproved} queued (${sentComments} sent) · Done ${Number(masterOrch.totals?.tasksSucceeded || 0)}`,
      targetDevice: `${devices.length} Phones + PC Stealth`,
      updatedAt: masterOrch.updatedAt || null,
    });
  }

  const gmailFwdState = readJsonSafe(path.resolve(dataDir, "..", ".gmail-permanent-forward-worker.state.json"));
  if (gmailFwdState && typeof gmailFwdState === "object") {
    const gfAlive = gmailFwdState.pid && isPidAliveFn(gmailFwdState.pid);
    const gfPending = Number(gmailFwdState.pendingCount || 0);
    const gfVerified = Number(gmailFwdState.verifiedCount || 0);
    tasks.push({
      id: "gmail-forward-worker",
      canControl: true,
      title: "Gmail -> Infi Mail Server-Side Forwarder",
      kind: "daemon",
      status: gfAlive ? "running" : "standby",
      percent: gfPending === 0 ? 100 : clampPct((gfVerified / Math.max(1, gfVerified + gfPending)) * 100),
      progressLabel: `${gfPending} pending · ${gfVerified} verified`,
      currentStep: Array.isArray(gmailFwdState.activeBrowsers) && gmailFwdState.activeBrowsers[0]
        ? `Configuring #${gmailFwdState.activeBrowsers[0]}`
        : gfPending === 0
          ? "100% Gmail Pool Forwarded"
          : "Standing by",
      metricsText: `Processed ${Number(gmailFwdState.processedCount || 0)} · PID ${gmailFwdState.pid || "-"}`,
      targetDevice: "PC Stealth Headless (:6003)",
      updatedAt: gmailFwdState.updatedAt || null,
    });
  }

  const outlookFwdState = readJsonSafe(path.resolve(dataDir, "..", ".outlook-forwarding-sync.state.json"));
  if (outlookFwdState && typeof outlookFwdState === "object") {
    const ofAlive = outlookFwdState.pid && isPidAliveFn(outlookFwdState.pid);
    const ofPending = Number(outlookFwdState.pendingProfileCount || 0);
    const ofEnrolled = Number(outlookFwdState.enrolledProfiles || 0);
    const hasGraphMetrics =
      outlookFwdState.graphReadyCount !== undefined && Number(outlookFwdState.totalUsableCount || 0) > 0;
    const graphReady = Number(outlookFwdState.graphReadyCount || 0);
    const totalUsable = Number(outlookFwdState.totalUsableCount || 0);
    const missingGraph = Number(outlookFwdState.missingGraphCount ?? ofPending);
    const pct = hasGraphMetrics
      ? clampPct((graphReady / Math.max(1, totalUsable)) * 100)
      : ofPending === 0
        ? 100
        : clampPct((ofEnrolled / Math.max(1, ofEnrolled + ofPending)) * 100);
    const progLabel = hasGraphMetrics
      ? `${graphReady}/${totalUsable} Graph · ${missingGraph} OAuth pending`
      : `${ofPending} OWA pending · ${ofEnrolled} enrolled`;
    tasks.push({
      id: "outlook-forward-sync",
      canControl: true,
      title: "Outlook -> Infi Mail OWA & Graph Relay Sync",
      kind: "daemon",
      status: ofAlive ? "running" : "standby",
      percent: pct,
      progressLabel: progLabel,
      currentStep: Array.isArray(outlookFwdState.activeBrowsers) && outlookFwdState.activeBrowsers[0]
        ? `OAuth2/Graph #${outlookFwdState.activeBrowsers[0]}`
        : missingGraph === 0
          ? "100% Graph API Relay Ready"
          : "Enrolling OAuth2 Graph Tokens",
      metricsText: hasGraphMetrics
        ? `Verified ${Number(outlookFwdState.graphVerifiedCount || 0)} · Zero-Browser API`
        : `Processed ${Number(outlookFwdState.processedProfiles || 0)} · Graph+OWA`,
      targetDevice: "PC Stealth Headless (:6003)",
      updatedAt: outlookFwdState.updatedAt || null,
    });
  }

  const kaizenCoord = readJsonSafe(path.join(dataDir, "kaizen-production-coordinator-status.json"));
  const kcAlive = Boolean(
    kaizenCoord &&
      kaizenCoord.pid &&
      isPidAliveFn(kaizenCoord.pid) &&
      isFreshTimestamp(kaizenCoord.updatedAt, nowMs, 6 * 60_000),
  );
  tasks.unshift({
    id: "kaizen-coordinator",
    canControl: true,
    title: "24/7 Kaizen Multi-Platform Coordinator",
    kind: "orchestrator",
    status: kcAlive ? "running" : "standby",
    phaseLabel: kcAlive ? "KAIZEN 24/7" : undefined,
    percent: kcAlive ? clampPct(Number(kaizenCoord?.healthScore ?? 94)) : 0,
    progressLabel: kcAlive
      ? `Cycle #${Number(kaizenCoord?.cycleNumber || 1)} · ${Number(kaizenCoord?.productiveDevices ?? onlineDevices)}/${devices.length} phones`
      : "Standby · Ready to start",
    currentStep: String(
      kaizenCoord?.currentAction ||
        `Balancing Facebook · Claude · ChatGPT · Cursor · Muse · Instagram across ${devices.length} Mobile + Desktop`,
    ),
    metricsText: String(
      kaizenCoord?.metricsSummary ||
        `Auto-reaping RAM pressure · Routing Claude/FB/IG to ${devices.length} Mobile · Muse/ChatGPT/Cursor to Profile`,
    ),
    targetDevice: `${devices.length} Mobile + PC Stealth`,
    updatedAt: kaizenCoord?.updatedAt || null,
  });

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

  const claudeTel = readJsonSafe("E:\\Dev\\Tool\\.ship\\claude-multi-method-telemetry.json");
  const claudeMobGmail = claudeTel?.byMethodAndMail?.mobile_farm_pixel6a__gmail || {};
  const crossFbBest = kaizenStats?.bestByPlatform?.cross_fb || {};
  const mobileChLabel = `${devices.length} Mobile 4G`;
  const fallbackPlatformYield = [
    {
      platform: "Facebook",
      primaryChannel: mobileChLabel,
      desktopLive: 13,
      mobileLive: Number(fbBatch?.liveTotal || 63),
      totalLive: Number(fbBatch?.liveTotal || 63) + 13,
      recent7dLive: 29,
      conversionPct: Number(fbBatch?.kaizenByPlatform?.facebook?.conversionPct || 7.1),
      activeLane: String(fbBatch?.activeMethod || "android_mweb_gmail_direct"),
      routingRule: "100% 4G SIM (FPT :31080 + P7 :31082) + Clean Mail -> 72h Soak -> Profile",
    },
    {
      platform: "Claude",
      primaryChannel: mobileChLabel,
      desktopLive: 75,
      mobileLive: Number(claudeMobGmail.logged_in || 14),
      totalLive: 103,
      recent7dLive: 11,
      conversionPct: Number(claudeMobGmail.passRatePct || 72.7),
      activeLane: "mobile_farm_4g + gmail/outlook",
      routingRule: "Desktop 0% pruned -> 100% Android 4G Chrome CDP",
    },
    {
      platform: "Muse",
      primaryChannel: "Desktop Profile",
      desktopLive: 769,
      mobileLive: 4,
      totalLive: 773,
      recent7dLive: 4,
      conversionPct: 98.5,
      activeLane: "profile_6000_infi + jp_http",
      routingRule: "100% Profile 6000+ Infi Mail + >=6 Chats Warmup",
    },
    {
      platform: "ChatGPT",
      primaryChannel: "Desktop Profile",
      desktopLive: 342,
      mobileLive: 0,
      totalLive: 342,
      recent7dLive: 13,
      conversionPct: 72.9,
      activeLane: "warm_outlook_0100_5999 + qzx_alias",
      routingRule: "Warm Profile 0100-5999 + Clean Outlook / qzx Alias MS Graph OTP",
    },
    {
      platform: "Cursor",
      primaryChannel: "Desktop Profile",
      desktopLive: 68,
      mobileLive: 0,
      totalLive: 68,
      recent7dLive: 5,
      conversionPct: 68.4,
      activeLane: "warm_outlook_0100_5999 + qzx_alias",
      routingRule: "Warm Profile 0100-5999 + Clean Outlook / qzx Alias WorkOS OTP",
    },
    {
      platform: "Instagram",
      primaryChannel: mobileChLabel,
      desktopLive: 6,
      mobileLive: Math.max(35, Number(crossFbBest.createdLive || 35)),
      totalLive: Math.max(41, Number(crossFbBest.createdLive || 35) + 6),
      recent7dLive: Math.max(35, Number(crossFbBest.createdLive || 12)),
      conversionPct: Number(crossFbBest.conversionPct || 35.3),
      activeLane: "cross_fb + mobile_4g_email -> P0020 Auto-Sync",
      routingRule: "Cross-FB SSO & Mobile 4G Signup -> Real-time P0020 Vault Sync",
    },
    {
      platform: "Threads",
      primaryChannel: "Desktop + Mobile OIDC",
      desktopLive: 5,
      mobileLive: 0,
      totalLive: 5,
      recent7dLive: 5,
      conversionPct: 75.0,
      activeLane: "ig_oidc_1click + warmup_bio_post -> P0020",
      routingRule: "1-Click OIDC -> 24h Avatar + Bio + First Thread Warmup",
    },
    {
      platform: "Grok",
      primaryChannel: "Warm Outlook + 4G",
      desktopLive: 153,
      mobileLive: 0,
      totalLive: 153,
      recent7dLive: 4,
      conversionPct: 64.0,
      activeLane: "warm_outlook_0100_5999 + 9router_grok_cli",
      routingRule: "Warm Outlook MS Graph OTP -> P0020 + 9Router Grok Pool Sync",
    },
    {
      platform: "ElevenLabs",
      primaryChannel: "Warm Outlook + API",
      desktopLive: 425,
      mobileLive: 0,
      totalLive: 425,
      recent7dLive: 2,
      conversionPct: 80.0,
      activeLane: "warm_outlook_0100_5999 + xi_api_key",
      routingRule: "Warm Outlook + Firebase Verify -> Mint sk_ API Key + P0020 Sync",
    },
  ];
  const platformYield = Array.isArray(kaizenCoord?.platformYield) && kaizenCoord.platformYield.length > 0
    ? kaizenCoord.platformYield
    : fallbackPlatformYield;

  const stepBottlenecks =
    Array.isArray(kaizenCoord?.stepBottlenecks) && kaizenCoord.stepBottlenecks.length > 0
      ? kaizenCoord.stepBottlenecks
      : Array.isArray(kaizenStats?.stepBottlenecks)
        ? kaizenStats.stepBottlenecks.slice(0, 8).map((b) => ({
            source: "mobile_probe_steps",
            deviceOrChannel: String(b.device || "mobile"),
            platform: String(b.platform || "multi"),
            stage: String(b.stage || b.gate || b.status || "form_step"),
            occurrences: Number(b.occurrences || 1),
            autoAdaptation: "Adaptive lane / provider / 4G rotation",
          }))
        : [];

  const carrierLabels = {
    pixel6a_fpt_4g: "Pixel 6a FPT 4G (:31080)",
    pixel7_viettel_4g: "Pixel 7 Viettel 4G (:31082)",
    s9_viettel_4g: "S9+ Viettel 4G (:31081)",
    static_vn_proxy: "Static VN Proxy Pool",
  };
  const carrierKaizen = fbBatch?.kaizenByCarrierLane
    ? Object.entries(fbBatch.kaizenByCarrierLane).map(([laneId, st]) => ({
        laneId,
        label: carrierLabels[laneId] || laneId,
        attempts: Number(st?.attempts || 0),
        live: Number(st?.live || 0),
        conversionPct: Number(st?.conversionPct || 0),
        avgElapsedMs: Number(st?.avgElapsedMs || 0),
        latencyMs: Number(st?.lastLatencyMs || 0),
        lastOutcome: String(st?.lastOutcome || ""),
        updatedAt: st?.updatedAt || null,
      }))
    : [];

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
    emulators,
    fleetEvaluation,
    tasks,
    platformYield,
    stepBottlenecks,
    experiments,
    carrierKaizen,
    orchestrator,
  };
}

const CONTROLLED_DAEMONS = Object.freeze({
  "kaizen-coordinator": {
    scriptRel: path.join("scripts", "run-kaizen-account-production-coordinator.mjs"),
    args: ["--daemon", "--interval-sec", "90"],
    statusFile: "kaizen-production-coordinator-status.json",
    logName: "kaizen-production-coordinator.log",
  },
  "fb-multi-method-100": {
    scriptRel: path.join("scripts", "run-multi-method-fb-batch-100.mjs"),
    args: ["--daemon", "--parallel", "--target=200", "--batch=4", "--cooldown-min=2", "--allow-pixel7-worker"],
    statusFile: "fb-multi-method-100-daemon-status.json",
    logName: "farm-fb-multi-method-100.log",
  },
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
  "mobile-farm-master-orchestrator": {
    scriptRel: path.join("scripts", "run-mobile-farm-master-orchestrator.mjs"),
    args: ["--daemon", "--interval-sec=45"],
    statusFile: "mobile-farm-master-orchestrator-status.json",
    logName: "mobile-farm-master-orchestrator.log",
  },
  "gmail-forward-worker": {
    scriptRel: path.join("scripts", "run-gmail-permanent-forward-worker.mjs"),
    args: ["--standalone"],
    statusFile: path.join("..", ".gmail-permanent-forward-worker.state.json"),
    logName: "gmail-permanent-forward-worker.log",
  },
  "outlook-forward-sync": {
    scriptRel: path.join("scripts", "run-outlook-forwarding-sync.mjs"),
    args: [],
    statusFile: path.join("..", ".outlook-forwarding-sync.state.json"),
    logName: "outlook-forwarding-sync.log",
  },
});

function resolveNodeBinary() {
  if (process.env.P0002_NODE_BIN && fs.existsSync(process.env.P0002_NODE_BIN)) {
    return process.env.P0002_NODE_BIN;
  }
  const ssotNode = "E:\\Dev\\.tools\\node-v22\\node.exe";
  if (fs.existsSync(ssotNode)) return ssotNode;
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
  if (alive && action === "restart" && existingPid !== process.pid) {
    try {
      process.kill(existingPid);
    } catch {
      /* ignore */
    }
  }

  const logsDir = path.join(dataDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, cfg.logName);
  const winShellPath = "E:\\Dev\\Tool\\scripts\\lib\\win-shell-env.cjs";
  if (process.platform === "win32" && fs.existsSync(winShellPath)) {
    try {
      const { startHiddenDetachedProcess } = require(winShellPath);
      if (typeof startHiddenDetachedProcess === "function") {
        const pid = startHiddenDetachedProcess({
          command: resolveNodeBinary(),
          args: [scriptAbs, ...cfg.args],
          cwd: socialRoot,
          logFile,
        });
        if (pid) {
          return {
            ok: true,
            started: true,
            action,
            daemonId: id,
            pid,
            logFile,
          };
        }
      }
    } catch {
      /* fall through */
    }
  }
  const { spawn } = require("node:child_process");
  const outFd = fs.openSync(logFile, "a");
  try {
    const child = spawn(resolveNodeBinary(), [scriptAbs, ...cfg.args], {
      cwd: socialRoot,
      detached: process.platform !== "win32",
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
