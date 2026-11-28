"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  CONTROLLED_DAEMONS,
  collectMobileFarmExecutionBoard,
  controlMobileFarmDaemon,
} = require("./mobile-farm-execution-board.cjs");

test("collectMobileFarmExecutionBoard aggregates 5 real devices (including Pixel 7) and verifies daemon PID liveness", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-exec-board-"));
  const nowIso = "2026-11-21T15:30:00.000Z";
  const nowMs = Date.parse(nowIso);
  try {
    fs.writeFileSync(
      path.join(tmpDir, "android-hardware-watchdog-status.json"),
      JSON.stringify({
        ok: true,
        pid: 39296,
        updatedAt: nowIso,
        devices: [
          { serial: "33241FDH2004B9", ok: true, batteryLevel: 68, batteryTempC: 32.9, acPowered: false, cableAttached: true, chargeMode: "charging" },
          { serial: "192.168.0.208:5555", ok: true, batteryLevel: 82, batteryTempC: 34.1, acPowered: true, cableAttached: true, chargeMode: "charging" },
          { serial: "192.168.0.120:5555", ok: true, batteryLevel: 81, batteryTempC: 32.5, acPowered: true, cableAttached: true, attachedDev: "TA", chargeMode: "hold_store_mode", storeMode: 1, slateMode: 0 },
          { serial: "ios:192.168.0.222", ok: true, batteryLevel: 72, batteryTempC: 35.3, externalConnected: true, isCharging: true, chargeLimiterEnabled: true },
          { serial: "ios:192.168.0.183", ok: false, unreachableReason: "wifi_and_usb_offline" },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "fb-multi-method-100-daemon-status.json"),
      JSON.stringify({
        ok: true,
        pid: 41756,
        status: "cooldown",
        targetTotal: 100,
        liveTotal: 80,
        remainingTo100: 20,
        waveNumber: 230,
        activeMethod: "ios_safari_gmail_s9lte",
        usableGmailPool: 143,
        grizzlyBalanceUsd: 0.61,
        updatedAt: nowIso,
        lastAttempt: { iosHost: "192.168.0.222" },
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "fasttrack-totp-tiktok-healer-status.json"),
      JSON.stringify({
        pid: 78928,
        state: "running_tiktok_autologin",
        round: 2,
        totalTotpHealed: 5,
        totalTotpAttempted: 6,
        updatedAt: nowIso,
      }),
    );

    const board = collectMobileFarmExecutionBoard({
      dataDir: tmpDir,
      nowMs,
      isPidAliveFn: (pid) => Number(pid) === 41756 || Number(pid) === 39296,
    });
    assert.equal(board.ok, true);
    assert.equal(board.devices.length, 5);
    const p7 = board.devices.find((d) => d.serial === "33241FDH2004B9");
    assert.equal(p7.ok, true);
    assert.equal(p7.batteryLevel, 68);
    assert.match(p7.label, /Pixel 7/);
    const s9 = board.devices.find((d) => d.serial === "192.168.0.120:5555");
    assert.equal(s9.chargeMode, "hold_store_mode");
    assert.equal(s9.attachedDev, "TA");
    const ios183 = board.devices.find((d) => d.serial === "ios:192.168.0.183");
    assert.equal(ios183.unreachableReason, "wifi_and_usb_offline");

    const fbTask = board.tasks.find((t) => t.id === "fb-multi-method-100");
    assert.equal(fbTask.percent, 80);
    assert.equal(fbTask.status, "running");
    const ftTask = board.tasks.find((t) => t.id === "fasttrack-healer");
    assert.equal(ftTask.status, "standby");
    assert.equal(ftTask.canControl, true);
    assert.match(ftTask.currentStep, /Stopped/);
    assert.equal(board.summary.onlineDevices, 4);
    assert.equal(board.summary.totalDevices, 5);
    assert.ok(CONTROLLED_DAEMONS["gmail-daemon"]);
    assert.equal(controlMobileFarmDaemon({ daemonId: "invalid-id", dataDir: tmpDir }).ok, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("collectMobileFarmExecutionBoard exposes Multi-Platform & Geo Kaizen experiment matrix", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-exec-exp-"));
  const vaultDir = path.join(tmpDir, "mobile-vault");
  fs.mkdirSync(vaultDir, { recursive: true });
  try {
    fs.writeFileSync(
      path.join(vaultDir, "multi-platform-kaizen-stats.json"),
      JSON.stringify({
        updatedAt: "2026-11-21T16:00:00.000Z",
        totalRunsRecorded: 3,
        bestByPlatform: {
          tiktok: { platform: "tiktok", geo: "VPN_PH", conversionPct: 100, attempts: 1 },
        },
        summary: [
          {
            device: "pixel7",
            platform: "tiktok",
            geo: "VPN_PH",
            provider: "elixcard",
            attempts: 1,
            createdLive: 1,
            linkedOrPassed: 1,
            conversionPct: 100,
            otpRatePct: 100,
            avgElapsedSec: 18.4,
            gates: { none: 1 },
          },
        ],
      }),
    );
    const board = collectMobileFarmExecutionBoard({ dataDir: tmpDir, nowMs: Date.parse("2026-11-21T16:01:00.000Z") });
    assert.equal(board.experiments.totalRunsRecorded, 3);
    assert.equal(board.experiments.lanes.length, 1);
    assert.equal(board.experiments.lanes[0].geo, "VPN_PH");
    assert.equal(board.experiments.bestByPlatform.tiktok.conversionPct, 100);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("collectMobileFarmExecutionBoard deduplicates Pixel 7 USB vs Wi-Fi, exposes COOLDOWN BURST phaseLabel, and maps carrierKaizen", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-exec-dedup-"));
  const nowIso = "2026-11-22T03:30:00.000Z";
  try {
    fs.writeFileSync(
      path.join(tmpDir, "android-hardware-watchdog-status.json"),
      JSON.stringify({
        ok: true,
        pid: 13240,
        updatedAt: nowIso,
        devices: [
          { serial: "192.168.0.253:5555", ok: true, batteryLevel: 45, chargeMode: "charging" },
          { serial: "33241FDH2004B9", ok: false, unreachableReason: "offline" },
          { serial: "192.168.0.208:5555", ok: true, batteryLevel: 85, chargeMode: "hold_pixel_limit" },
          { serial: "192.168.0.120:5555", ok: true, batteryLevel: 58, chargeMode: "hold_slate_emergency" },
          { serial: "ios:192.168.0.222", ok: true, externalConnected: true, chargeLimiterEnabled: true },
          { serial: "ios:192.168.0.183", ok: true, externalConnected: true, chargeLimiterEnabled: true },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "fb-multi-method-100-daemon-status.json"),
      JSON.stringify({
        ok: true,
        pid: 16984,
        status: "cooldown",
        targetTotal: 100,
        liveTotal: 87,
        remainingTo100: 13,
        waveNumber: 250,
        activeMethod: "ios_safari_gmail_s9lte",
        updatedAt: nowIso,
        kaizenByCarrierLane: {
          pixel6a_fpt_4g: { attempts: 82, live: 12, conversionPct: 14.6, lastLatencyMs: 478 },
          pixel7_viettel_4g: { attempts: 2, live: 0, conversionPct: 0, lastLatencyMs: 740 },
        },
      }),
    );
    const board = collectMobileFarmExecutionBoard({
      dataDir: tmpDir,
      nowMs: Date.parse(nowIso),
      isPidAliveFn: (pid) => Number(pid) === 16984 || Number(pid) === 13240,
    });
    assert.equal(board.devices.length, 5);
    assert.equal(board.devices.filter((d) => /Pixel 7/.test(d.label)).length, 1);
    assert.equal(board.devices.find((d) => d.serial === "192.168.0.253:5555")?.ok, true);
    const fbTask = board.tasks.find((t) => t.id === "fb-multi-method-100");
    assert.equal(fbTask.phaseLabel, "COOLDOWN BURST");
    assert.equal(fbTask.isCooldown, true);
    assert.equal(board.carrierKaizen.length, 2);
    assert.equal(board.carrierKaizen[0].laneId, "pixel6a_fpt_4g");
    assert.equal(board.carrierKaizen[0].conversionPct, 14.6);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("collectMobileFarmExecutionBoard exposes 24/7 Master Orchestrator Dispatch Matrix and controllable daemon", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-exec-orch-"));
  const nowIso = "2026-11-22T06:22:00.000Z";
  try {
    fs.writeFileSync(
      path.join(tmpDir, "mobile-farm-master-orchestrator-status.json"),
      JSON.stringify({
        ok: true,
        pid: 44120,
        status: "running",
        cycleNumber: 7,
        updatedAt: nowIso,
        teamAssist: { approvedCount: 30, dueReplyChainIds: ["CM0126"], sentThisSession: 2 },
        goalBacklog: [
          { id: "g1", taskType: "team_group_comment_assist", title: "Team Group Feed Comment Assist (30 approved)", priority: 96, source: "team_comment_queue" },
        ],
        deviceAssignments: [
          { deviceKey: "pixel6a", serial: "192.168.0.208:5555", label: "Pixel 6a (.208)", state: "dispatch", assignedTask: "multi_platform_instagram_probe", platform: "instagram", completedCount: 4 },
          { deviceKey: "pixel7", serial: "192.168.0.253:5555", label: "Pixel 7 (.253)", state: "leased", assignedTask: "external:upgrade-g1-pro-android-frida", skipReason: "leased:frida_pid_999" },
          { deviceKey: "s9plus", serial: "192.168.0.120:5555", label: "Samsung S9+ (.120)", state: "skipped", assignedTask: "thermal_passive_sim_only", skipReason: "thermal_guard_43.1C" },
        ],
        totals: { cyclesRun: 7, tasksDispatched: 19, tasksSucceeded: 8, commentTasksExecuted: 2 },
      }),
    );

    const board = collectMobileFarmExecutionBoard({
      dataDir: tmpDir,
      nowMs: Date.parse(nowIso),
      isPidAliveFn: (pid) => Number(pid) === 44120,
    });

    assert.ok(CONTROLLED_DAEMONS["mobile-farm-master-orchestrator"]);
    assert.ok(board.orchestrator);
    assert.equal(board.orchestrator.active, true);
    assert.equal(board.orchestrator.cycleNumber, 7);
    assert.equal(board.orchestrator.deviceAssignments.length, 3);
    assert.ok(board.fleetEvaluation);
    assert.equal(board.fleetEvaluation.totalDevices, 5);
    const orchTask = board.tasks.find((t) => t.id === "mobile-farm-master-orchestrator");
    assert.ok(orchTask);
    assert.equal(orchTask.status, "running");
    assert.equal(orchTask.phaseLabel, "AUTONOMOUS 24/7");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("collectMobileFarmExecutionBoard separates local 127.0.0.1 emulator from 5 physical phones", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-exec-emu-"));
  const nowIso = "2026-11-22T12:15:00.000Z";
  try {
    fs.writeFileSync(
      path.join(tmpDir, "android-hardware-watchdog-status.json"),
      JSON.stringify({
        ok: true,
        pid: 24704,
        updatedAt: nowIso,
        devices: [
          { serial: "127.0.0.1:16384", ok: true, batteryLevel: 99, batteryTempC: 36, ramUsedPct: 17 },
          { serial: "192.168.0.208:5555", ok: true, batteryLevel: 85, batteryTempC: 35, ramUsedPct: 60 },
          { serial: "192.168.0.253:5555", ok: true, batteryLevel: 85, batteryTempC: 36.5, ramUsedPct: 52 },
          { serial: "192.168.0.120:5555", ok: true, batteryLevel: 70, batteryTempC: 34, ramUsedPct: 50, storeMode: 1 },
          { serial: "ios:192.168.0.222", ok: true, batteryLevel: 62, batteryTempC: 35.8, externalConnected: true, chargeLimiterEnabled: true },
          { serial: "ios:192.168.0.183", ok: true, batteryLevel: 61, batteryTempC: 34.1, externalConnected: true, chargeLimiterEnabled: true },
        ],
      }),
    );
    const board = collectMobileFarmExecutionBoard({
      dataDir: tmpDir,
      nowMs: Date.parse(nowIso),
      isPidAliveFn: () => true,
    });
    assert.equal(board.devices.length, 5);
    assert.equal(board.summary.onlineDevices, 5);
    assert.equal(board.summary.totalDevices, 5);
    assert.equal(board.emulators.length, 1);
    assert.equal(board.emulators[0].serial, "127.0.0.1:16384");
    assert.equal(board.fleetEvaluation.totalDevices, 5);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("collectMobileFarmExecutionBoard penalizes recent CDP/pool failures and high RAM instead of reporting grade S", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-exec-penalty-"));
  const nowIso = "2026-11-26T08:10:00.000Z";
  try {
    fs.writeFileSync(
      path.join(tmpDir, "android-hardware-watchdog-status.json"),
      JSON.stringify({
        ok: true,
        pid: 9288,
        updatedAt: nowIso,
        devices: [
          { serial: "192.168.0.208:5555", ok: true, batteryLevel: 76, batteryTempC: 35.5, ramUsedPct: 86 },
          { serial: "192.168.0.253:5555", ok: true, batteryLevel: 60, batteryTempC: 33.9, ramUsedPct: 53 },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "fb-multi-method-100-daemon-status.json"),
      JSON.stringify({
        ok: true,
        pid: 20280,
        status: "running",
        updatedAt: nowIso,
        liveTotal: 78,
        targetTotal: 200,
        recentResults: [
          { serial: "192.168.0.208:5555", ok: false, outcome: "browser_page_closed" },
          { serial: "192.168.0.208:5555", ok: false, outcome: "gmail_pool_unavailable: no_clean_logged_in_gmail_candidate" },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "mobile-farm-master-orchestrator-status.json"),
      JSON.stringify({
        ok: true,
        pid: 28060,
        status: "running",
        updatedAt: nowIso,
        fleetEvaluation: {
          overallScore: 100,
          grade: "S",
          devices: [
            { serial: "192.168.0.208:5555", efficiencyScore: 100, grade: "S" },
            { serial: "192.168.0.253:5555", efficiencyScore: 100, grade: "S" },
          ],
        },
        deviceAssignments: [
          { deviceKey: "pixel6a", serial: "192.168.0.208:5555", state: "leased", assignedTask: "external:fb" },
          { deviceKey: "pixel7", serial: "192.168.0.253:5555", state: "leased", assignedTask: "external:fb" },
        ],
      }),
    );
    const board = collectMobileFarmExecutionBoard({
      dataDir: tmpDir,
      nowMs: Date.parse(nowIso),
      isPidAliveFn: () => true,
    });
    const p6 = board.fleetEvaluation.devices.find((d) => d.serial === "192.168.0.208:5555");
    const p7 = board.fleetEvaluation.devices.find((d) => d.serial === "192.168.0.253:5555");
    assert.ok(p6.efficiencyScore < 85, `expected Pixel 6a penalty < 85, got ${p6.efficiencyScore}`);
    assert.notEqual(p6.grade, "S");
    assert.ok(p7.efficiencyScore >= 85);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("collectMobileFarmExecutionBoard sets adb_device_offline fallback unreachableReason and penalizes form_step stalls", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-exec-stall-"));
  const nowIso = "2026-11-26T20:00:00.000Z";
  try {
    fs.writeFileSync(
      path.join(tmpDir, "android-hardware-watchdog-status.json"),
      JSON.stringify({
        ok: true,
        pid: 26188,
        updatedAt: nowIso,
        devices: [
          { serial: "192.168.0.253:5555", ok: false, unreachableReason: null },
          { serial: "192.168.0.120:5555", ok: true, batteryLevel: 62, batteryTempC: 31.9, ramUsedPct: 57 },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "mobile-farm-master-orchestrator-status.json"),
      JSON.stringify({
        ok: true,
        pid: 26192,
        status: "running",
        updatedAt: nowIso,
        deviceAssignments: [
          { deviceKey: "s9plus", serial: "192.168.0.120:5555", state: "dispatch", assignedTask: "multi_platform_gmail_probe", lastOutcome: "attempted:form_step" },
        ],
      }),
    );
    const board = collectMobileFarmExecutionBoard({
      dataDir: tmpDir,
      nowMs: Date.parse(nowIso),
      isPidAliveFn: () => true,
    });
    const p7Dev = board.devices.find((d) => d.serial === "192.168.0.253:5555");
    assert.equal(p7Dev.unreachableReason, "adb_device_offline");
    const s9Eval = board.fleetEvaluation.devices.find((d) => d.serial === "192.168.0.120:5555");
    assert.ok(s9Eval.efficiencyScore < 80);
    assert.equal(s9Eval.autoAction, "heal_form_step_stall");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Proposal 3: collectMobileFarmExecutionBoard flags earlyVbusLossActive and alert_check_usb_vbus_cable when unplugged >=20m at <=85%", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-exec-vbus-"));
  const nowIso = "2026-11-26T21:30:00.000Z";
  try {
    fs.writeFileSync(
      path.join(tmpDir, "android-hardware-watchdog-status.json"),
      JSON.stringify({
        ok: true,
        pid: 31000,
        updatedAt: nowIso,
        devices: [
          {
            serial: "192.168.0.253:5555",
            ok: true,
            batteryLevel: 70,
            batteryTempC: 31.8,
            acPowered: false,
            cableAttached: false,
            usbPresent: false,
            unpluggedElapsedMin: 24,
            chargeMode: "unplugged",
          },
        ],
      }),
    );
    const board = collectMobileFarmExecutionBoard({
      dataDir: tmpDir,
      nowMs: Date.parse(nowIso),
      isPidAliveFn: () => true,
    });
    const p7Dev = board.devices.find((d) => d.serial === "192.168.0.253:5555");
    assert.equal(p7Dev.unpluggedElapsedMin, 24);
    assert.equal(p7Dev.usbPresent, false);
    const p7Eval = board.fleetEvaluation.devices.find((d) => d.serial === "192.168.0.253:5555");
    assert.equal(p7Eval.earlyVbusLossActive, true);
    assert.equal(p7Eval.autoAction, "alert_check_usb_vbus_cable");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Turn 3 Item 2: CONTROLLED_DAEMONS registers gmail-forward-worker & outlook-forward-sync and renders their task cards", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-exec-fwd-"));
  const dataDir = path.join(rootDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const nowIso = "2026-11-27T05:30:00.000Z";
  try {
    assert.ok(CONTROLLED_DAEMONS["gmail-forward-worker"]);
    assert.ok(CONTROLLED_DAEMONS["outlook-forward-sync"]);
    fs.writeFileSync(
      path.join(rootDir, ".gmail-permanent-forward-worker.state.json"),
      JSON.stringify({ pid: 51001, pendingCount: 4, verifiedCount: 241, processedCount: 12, updatedAt: nowIso }),
    );
    fs.writeFileSync(
      path.join(rootDir, ".outlook-forwarding-sync.state.json"),
      JSON.stringify({ pid: 51002, pendingProfileCount: 18, enrolledProfiles: 42, processedProfiles: 60, updatedAt: nowIso }),
    );
    const board = collectMobileFarmExecutionBoard({
      dataDir,
      nowMs: Date.parse(nowIso),
      isPidAliveFn: (pid) => Number(pid) === 51001 || Number(pid) === 51002,
    });
    const gf = board.tasks.find((t) => t.id === "gmail-forward-worker");
    const ofw = board.tasks.find((t) => t.id === "outlook-forward-sync");
    assert.equal(gf?.status, "running");
    assert.equal(ofw?.status, "running");
    assert.match(gf?.progressLabel || "", /4 pending · 241 verified/);
    assert.match(ofw?.progressLabel || "", /18 OWA pending · 42 enrolled/);

    fs.writeFileSync(
      path.join(rootDir, ".outlook-forwarding-sync.state.json"),
      JSON.stringify({
        pid: 51002,
        totalUsableCount: 4036,
        graphReadyCount: 3998,
        missingGraphCount: 38,
        graphVerifiedCount: 1200,
        pendingProfileCount: 38,
        enrolledProfiles: 42,
        updatedAt: nowIso,
      }),
    );
    const board2 = collectMobileFarmExecutionBoard({
      dataDir,
      nowMs: Date.parse(nowIso),
      isPidAliveFn: (pid) => Number(pid) === 51001 || Number(pid) === 51002,
    });
    const ofw2 = board2.tasks.find((t) => t.id === "outlook-forward-sync");
    assert.match(ofw2?.progressLabel || "", /3998\/4036 Graph · 38 OAuth pending/);
    assert.equal(ofw2?.percent, 99);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("collectMobileFarmExecutionBoard propagates batteryCurrentMa, usbInputCurrentLimit, usbVoltageMv, and tcpmOnline onto device board rows", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-exec-powerpath-"));
  const nowIso = "2026-11-27T14:30:00.000Z";
  try {
    fs.writeFileSync(
      path.join(tmpDir, "android-hardware-watchdog-status.json"),
      JSON.stringify({
        ok: true,
        pid: 31001,
        updatedAt: nowIso,
        devices: [
          {
            serial: "192.168.0.253:5555",
            ok: true,
            batteryLevel: 29,
            batteryTempC: 33.3,
            acPowered: true,
            chargeMode: "charging",
            batteryCurrentMa: 991,
            usbInputCurrentLimit: 2000,
            usbVoltageMv: 4625,
            tcpmOnline: true,
          },
        ],
      }),
    );
    const board = collectMobileFarmExecutionBoard({
      dataDir: tmpDir,
      nowMs: Date.parse(nowIso),
      isPidAliveFn: () => true,
    });
    const p7Dev = board.devices.find((d) => d.serial === "192.168.0.253:5555");
    assert.equal(p7Dev.batteryCurrentMa, 991);
    assert.equal(p7Dev.usbInputCurrentLimit, 2000);
    assert.equal(p7Dev.usbVoltageMv, 4625);
    assert.equal(p7Dev.tcpmOnline, true);
    const p7Eval = board.fleetEvaluation.devices.find((d) => d.serial === "192.168.0.253:5555");
    assert.equal(p7Eval.weakPowerPathActive, false);

    // Weak power path (ICL=0, Pin=-1761mA despite AC=true) flags weakPowerPathActive & check_weak_charger_cable and lowers grade/score
    fs.writeFileSync(
      path.join(tmpDir, "android-hardware-watchdog-status.json"),
      JSON.stringify({
        ok: true,
        pid: 31001,
        updatedAt: nowIso,
        devices: [
          {
            serial: "192.168.0.253:5555",
            ok: true,
            batteryLevel: 25,
            batteryTempC: 33.4,
            acPowered: true,
            chargeMode: "idle_plugged",
            batteryCurrentMa: -1761,
            usbInputCurrentLimit: 0,
            usbVoltageMv: 4600,
            tcpmOnline: false,
          },
        ],
      }),
    );
    const weakBoard = collectMobileFarmExecutionBoard({
      dataDir: tmpDir,
      nowMs: Date.parse(nowIso),
      isPidAliveFn: () => true,
    });
    const weakEval = weakBoard.fleetEvaluation.devices.find((d) => d.serial === "192.168.0.253:5555");
    assert.equal(weakEval.weakPowerPathActive, true);
    assert.equal(weakEval.autoAction, "check_weak_charger_cable");
    assert.equal(weakEval.efficiencyScore, p7Eval.efficiencyScore - 8);
    // When S9+ is retired/absent from watchdog, board cleanly reports 4 total devices (no phantom offline S9+)
    assert.equal(weakBoard.summary.totalDevices, 4);
    assert.equal(weakBoard.devices.some((d) => d.serial === "192.168.0.120:5555"), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("collectMobileFarmExecutionBoard labels FB Gmail-pool methods clearly so they are distinct from Gmail account creation", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "p0003-exec-labels-"));
  const nowIso = "2026-11-28T06:00:00.000Z";
  try {
    fs.writeFileSync(
      path.join(tmpDir, "android-hardware-watchdog-status.json"),
      JSON.stringify({
        ok: true,
        pid: 31001,
        updatedAt: nowIso,
        devices: [
          { serial: "192.168.0.253:5555", ok: true, batteryLevel: 85, batteryTempC: 31.0, ramUsedPct: 55 },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "fb-multi-method-100-daemon-status.json"),
      JSON.stringify({
        ok: true,
        pid: 32020,
        status: "running",
        waveNumber: 491,
        liveTotal: 63,
        targetTotal: 200,
        activeMethod: "android_mweb_gmail_direct",
        updatedAt: nowIso,
      }),
    );
    fs.writeFileSync(
      path.join(tmpDir, "mobile-farm-master-orchestrator-status.json"),
      JSON.stringify({
        ok: true,
        pid: 31896,
        status: "running",
        updatedAt: nowIso,
        deviceAssignments: [
          { deviceKey: "pixel7", serial: "192.168.0.253:5555", state: "leased", assignedTask: "external:android_mweb_gmail_direct" },
        ],
      }),
    );
    const board = collectMobileFarmExecutionBoard({
      dataDir: tmpDir,
      nowMs: Date.parse(nowIso),
      isPidAliveFn: () => true,
    });
    const fbTask = board.tasks.find((t) => t.id === "fb-multi-method-100");
    assert.match(fbTask.currentStep, /FB Signup \(Gmail Pool · Android\)/);
    const p7Eval = board.fleetEvaluation.devices.find((d) => d.serial === "192.168.0.253:5555");
    assert.equal(p7Eval.taskLabel, "FB Signup (Gmail Pool · Android)");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
