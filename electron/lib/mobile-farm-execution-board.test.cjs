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
