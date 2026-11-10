"use strict";
/**
 * Agent Worker Memory Guard (`:6004`) & Staged ASAR Auto-Swap (`ok 2` + `ok 3`)
 *
 * 1. Reaps headless Chrome sessions on `:6004` that have had no CDP/API activity
 *    for more than `MAX_IDLE_MS` (default 90 seconds).
 * 2. Enforces a hard RAM ceiling (`MAX_HEADLESS_RAM_MB`, default 1536 MB = 1.5 GB)
 *    across all headless Chrome processes managed by `:6004`, evicting the oldest
 *    session(s) first when exceeded.
 * 3. Automatically swaps `resources/app.asar.staged` -> `resources/app.asar` when
 *    unlocked (e.g., on `will-quit` or when the desktop app closes).
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_MAX_RAM_MB = Number(process.env.STEALTH_WORKER_MAX_RAM_MB || 4096);
const DEFAULT_MAX_IDLE_MS = Number(process.env.STEALTH_WORKER_MAX_IDLE_MS || 180_000);
const DEFAULT_SWEEP_INTERVAL_MS = Number(process.env.STEALTH_WORKER_GUARD_INTERVAL_MS || 20_000);

const sessionActivityMap =
  globalThis.__stealthWorkerSessionActivityMap instanceof Map
    ? globalThis.__stealthWorkerSessionActivityMap
    : (globalThis.__stealthWorkerSessionActivityMap = new Map());
const activeOpenUrlProfiles =
  globalThis.__stealthActiveOpenUrlProfiles instanceof Set
    ? globalThis.__stealthActiveOpenUrlProfiles
    : (globalThis.__stealthActiveOpenUrlProfiles = new Set());
let guardState = {
  enabled: false,
  maxRamMb: DEFAULT_MAX_RAM_MB,
  maxIdleMs: DEFAULT_MAX_IDLE_MS,
  intervalMs: DEFAULT_SWEEP_INTERVAL_MS,
  lastSweepAt: null,
  lastTotalHeadlessRamMb: 0,
  lastRunningHeadlessCount: 0,
  totalIdleEvicted: 0,
  totalRamEvicted: 0,
  lastEvictedProfiles: [],
  asarStagedReady: false,
  asarLastSwappedAt: null,
};

function touchWorkerSessionActivity(profileId) {
  const id = String(profileId || "").trim();
  if (!id) return;
  sessionActivityMap.set(id, Date.now());
}

function setOpenUrlProfileActive(profileId, active = true) {
  const id = String(profileId || "").trim();
  if (!id) return;
  if (active) {
    activeOpenUrlProfiles.add(id);
    sessionActivityMap.set(id, Date.now());
  } else {
    activeOpenUrlProfiles.delete(id);
  }
}

function getWorkerSessionLastActivity(profileId, fallbackStartedAt) {
  const id = String(profileId || "").trim();
  const touched = sessionActivityMap.get(id);
  if (Number.isFinite(touched) && touched > 0) return touched;
  const parsed = fallbackStartedAt ? Date.parse(fallbackStartedAt) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/**
 * Queries total RAM (MB) of headless Chrome processes on Windows without spawning PowerShell.
 * Uses `tasklist /FI "IMAGENAME eq chrome.exe" /FO CSV /NH` (~25ms, hidden).
 */
function measureHeadlessChromeRamMb(runningHeadlessSessions = []) {
  if (!Array.isArray(runningHeadlessSessions) || runningHeadlessSessions.length === 0) {
    return 0;
  }
  // Always use non-blocking O(1) estimate on Electron Main Thread — never call spawnSync(tasklist.exe)
  return runningHeadlessSessions.length * 175;
}

function isStealthDesktopProcessRunningWin32() {
  if (process.platform !== "win32") return false;
  if (process.versions && process.versions.electron && process.env.STEALTH_AGENT_WORKER !== "1") {
    return true;
  }
  return true;
}

function computeFileSha256Sync(filePath) {
  const crypto = require("node:crypto");
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const stat = fs.fstatSync(fd);
    const chunk = Buffer.allocUnsafe(8 * 1024 * 1024);
    let pos = 0;
    while (pos < stat.size) {
      const toRead = Math.min(chunk.length, stat.size - pos);
      const bytesRead = fs.readSync(fd, chunk, 0, toRead, pos);
      if (bytesRead <= 0) break;
      hash.update(chunk.subarray(0, bytesRead));
      pos += bytesRead;
    }
    return { sha256: hash.digest("hex"), size: stat.size };
  } finally {
    fs.closeSync(fd);
  }
}

function verifyStagedAsarIntegrity(stagedAsar) {
  const metaPath = `${stagedAsar}.sha256.json`;
  try {
    if (!fs.existsSync(stagedAsar)) {
      return { ok: false, reason: "no_staged_asar" };
    }
    const stat = fs.statSync(stagedAsar);
    if (stat.size < 10_000_000) {
      return { ok: false, reason: "staged_too_small", size: stat.size };
    }
    // Check ASAR magic header (first uint32 must be 4)
    const fd = fs.openSync(stagedAsar, "r");
    let headerMagic = 0;
    try {
      const prefix = Buffer.alloc(16);
      fs.readSync(fd, prefix, 0, 16, 0);
      headerMagic = prefix.readUInt32LE(0);
    } finally {
      fs.closeSync(fd);
    }
    if (headerMagic !== 4) {
      return { ok: false, reason: "invalid_asar_magic_header", headerMagic };
    }
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (Number(meta.size) > 0 && Number(meta.size) !== stat.size) {
        return {
          ok: false,
          reason: "sha256_meta_size_mismatch",
          expectedSize: meta.size,
          actualSize: stat.size,
        };
      }
      if (meta.sha256) {
        const computed = computeFileSha256Sync(stagedAsar);
        if (computed.sha256 !== String(meta.sha256).toLowerCase()) {
          return {
            ok: false,
            reason: "sha256_digest_mismatch",
            expectedSha256: meta.sha256,
            actualSha256: computed.sha256,
          };
        }
        return { ok: true, verifiedSha256: computed.sha256, size: stat.size, version: meta.version || null };
      }
    }
    return { ok: true, verifiedHeaderOnly: true, size: stat.size };
  } catch (err) {
    return { ok: false, reason: "verify_exception", error: err instanceof Error ? err.message : String(err) };
  }
}

function trySwapStagedAsar({ allowWrite = false } = {}) {
  const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\CzP\\AppData\\Local";
  const resDir = path.join(localAppData, "Programs", "stealth-browser-console", "resources");
  const targetAsar = path.join(resDir, "app.asar");
  const stagedAsar = path.join(resDir, "app.asar.staged");
  const stagedMeta = `${stagedAsar}.sha256.json`;
  try {
    if (!fs.existsSync(stagedAsar)) {
      guardState.asarStagedReady = false;
      return { swapped: false, reason: "no_staged_asar" };
    }
    guardState.asarStagedReady = true;
    // Never overwrite app.asar during periodic background sweeps — Electron memory-maps app.asar,
    // and overwriting it while Stealth Browser Console.exe is running causes an immediate V8/OS crash!
    if (!allowWrite && process.env.STEALTH_FORCE_ASAR_SWAP !== "1") {
      return { swapped: false, reason: "staged_ready_for_next_cold_boot" };
    }
    if (process.platform === "win32" && process.env.STEALTH_FORCE_ASAR_SWAP !== "1") {
      if (isStealthDesktopProcessRunningWin32()) {
        return { swapped: false, reason: "desktop_app_running_staged_for_quit" };
      }
    }
    const integrity = verifyStagedAsarIntegrity(stagedAsar);
    if (!integrity.ok) {
      // Zero-Corruption Rollback: discard corrupted staged file and keep original app.asar untouched
      try {
        fs.unlinkSync(stagedAsar);
      } catch {
        /* ignore */
      }
      try {
        if (fs.existsSync(stagedMeta)) fs.unlinkSync(stagedMeta);
      } catch {
        /* ignore */
      }
      guardState.asarStagedReady = false;
      return { swapped: false, rolledBackCorruptStaged: true, ...integrity };
    }
    const backupAsar = path.join(resDir, "app.asar.prev");
    try {
      if (fs.existsSync(targetAsar)) {
        try {
          fs.chmodSync(targetAsar, 0o666);
        } catch {
          /* ignore */
        }
        fs.copyFileSync(targetAsar, backupAsar);
      }
    } catch {
      /* ignore backup error */
    }
    fs.copyFileSync(stagedAsar, targetAsar);
    try {
      fs.chmodSync(targetAsar, 0o444);
    } catch {
      /* ignore */
    }
    fs.unlinkSync(stagedAsar);
    try {
      if (fs.existsSync(stagedMeta)) fs.unlinkSync(stagedMeta);
    } catch {
      /* ignore */
    }
    guardState.asarStagedReady = false;
    guardState.asarLastSwappedAt = new Date().toISOString();
    return { swapped: true, at: guardState.asarLastSwappedAt, integrity };
  } catch (err) {
    return { swapped: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const USER_RESERVED_PROFILE_CODES = new Set([
  ...Array.from({ length: 21 }, (_, idx) => String(idx + 1).padStart(4, "0")),
  "0059",
  "0069",
  "0120",
  "4220",
  "8000",
  "8001",
  "8002",
  "8003",
  "8999",
]);

function readProtectedCrossProcessAgentCodes(now = Date.now()) {
  const lockedCodes = new Set();
  const candidateDirs = ["E:\\Dev\\Tool\\P0002-Social-Hub\\data"];
  for (const dataDir of candidateDirs) {
    for (const fileName of ["active-agent-locks.json", "priority-agent-locks.json"]) {
      try {
        const fp = path.join(dataDir, fileName);
        if (!fs.existsSync(fp)) continue;
        const parsed = JSON.parse(fs.readFileSync(fp, "utf8")) || {};
        const locks = parsed && typeof parsed.locks === "object" && parsed.locks ? parsed.locks : {};
        let dirty = false;
        for (const [code, val] of Object.entries(locks)) {
          const exp = typeof val === "object" && val ? Number(val.expiresAt || 0) : Number(val || 0);
          const ownerPid = typeof val === "object" && val ? Number(val.ownerPid || val.pid || 0) : 0;
          const pidAlive = ownerPid > 0 ? isPidAliveWin(ownerPid) : true;
          if (exp > now && pidAlive) {
            lockedCodes.add(String(code).trim().padStart(4, "0"));
            if (typeof val === "object" && val && val.stealthId) {
              lockedCodes.add(String(val.stealthId).trim());
            }
          } else if (exp <= now || !pidAlive) {
            delete locks[code];
            dirty = true;
          }
        }
        if (dirty) {
          try {
            fs.writeFileSync(fp, JSON.stringify({ ...parsed, locks }, null, 2), "utf8");
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore lock read errors */
      }
    }
  }
  return lockedCodes;
}

function extractSessionProfileCode(s) {
  const rawName = String(s?.name || s?.profileCode || s?.id || s?.profileId || "").trim();
  const m = rawName.match(/^(?:#)?(\d{1,5})\b/);
  return m ? m[1].padStart(4, "0") : "";
}

function isPidAliveWin(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === "EPERM");
  }
}

function ensureP0002BulkWorkersRunning() {
  if (process.env.STEALTH_PAUSE_BULK_WORKERS === "1") return [];
  const restarted = [];
  const p0002Root = "E:\\Dev\\Tool\\P0002-Social-Hub";
  const nodewExe = "E:\\Dev\\.tools\\nodew.exe";
  if (!fs.existsSync(p0002Root) || !fs.existsSync(nodewExe)) return restarted;
  try {
    const opCtrlPath = "E:\\Dev\\Tool\\.ship\\daemon-operator-control.json";
    if (fs.existsSync(opCtrlPath)) {
      const opCtrl = JSON.parse(fs.readFileSync(opCtrlPath, "utf8")) || {};
      if (opCtrl.pauseAllBulkWorkers === true) return restarted;
      const jobs = opCtrl.jobs || {};
      if (
        jobs["gmail-daemon"]?.paused &&
        jobs["outlook-daemon"]?.paused &&
        jobs["services-daemon"]?.paused
      ) {
        return restarted;
      }
    }
    const supPath = "E:\\Dev\\Tool\\P0004-Tool-Hub\\data\\farm-supervisor.json";
    if (fs.existsSync(supPath)) {
      const sup = JSON.parse(fs.readFileSync(supPath, "utf8")) || {};
      if (sup.enabled === false) return restarted;
      const jobCfg = Array.isArray(sup.jobs)
        ? sup.jobs.find((j) => j && j.id === "continuous-check-mail-worker")
        : null;
      if (jobCfg && jobCfg.autoResume === false) return restarted;
    }
  } catch {
    /* ignore */
  }
  const daemons = [
    {
      name: "continuous-check-mail-worker",
      stateFile: path.join(p0002Root, ".continuous-check-mail-worker.state.json"),
      scriptPath: path.join(p0002Root, "scripts", "continuous-check-mail-worker.mjs"),
    },
  ];
  for (const d of daemons) {
    try {
      if (!fs.existsSync(d.scriptPath)) continue;
      let alive = false;
      if (fs.existsSync(d.stateFile)) {
        const st = JSON.parse(fs.readFileSync(d.stateFile, "utf8")) || {};
        if (st.paused === true) continue;
        if (Number(st.pid) > 0 && isPidAliveWin(Number(st.pid))) {
          alive = true;
        }
      }
      if (!alive) {
        const { spawn } = require("node:child_process");
        const child = spawn(nodewExe, [d.scriptPath], {
          cwd: p0002Root,
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();
        restarted.push({ name: d.name, pid: child.pid });
      }
    } catch {
      /* ignore */
    }
  }
  return restarted;
}

async function runWorkerGuardSweep({
  sessionManager,
  maxRamMb = guardState.maxRamMb,
  maxIdleMs = guardState.maxIdleMs,
} = {}) {
  const now = Date.now();
  const evicted = [];

  trySwapStagedAsar();
  ensureP0002BulkWorkersRunning();
  try {
    const { reapOrphanAdbScrcpyProcessesNative } = require("./profile-browser-orphan.cjs");
    if (typeof reapOrphanAdbScrcpyProcessesNative === "function") {
      reapOrphanAdbScrcpyProcessesNative();
    }
  } catch {
    /* ignore */
  }

  if (!sessionManager || typeof sessionManager.listRunning !== "function") {
    guardState.lastSweepAt = new Date(now).toISOString();
    return { ...guardState };
  }

  const running = sessionManager.listRunning() || [];
  const headlessList = running.filter((s) => {
    if (!s || (s.headless !== true && s.shadowLane !== true)) return false;
    const id = String(s.profileId || s.id || "");
    if (typeof sessionManager.isUserInteractiveSession === "function" && sessionManager.isUserInteractiveSession(id)) {
      return false;
    }
    return true;
  });
  const protectedCodes = readProtectedCrossProcessAgentCodes(now);

  // 1. Reap idle headless sessions (> maxIdleMs), strictly skipping active/priority locked or Support-Chat profiles
  let normalizeCaller = (v) => String(v || "").trim() || "agent:inline";
  try {
    const { normalizeAgentCallerId } = require("./agent-smoke-context.cjs");
    if (typeof normalizeAgentCallerId === "function") normalizeCaller = normalizeAgentCallerId;
  } catch {
    /* ignore */
  }
  const closeHeadlessSession = async (profileId, codeStr = "", forcePriority = false) => {
    if (forcePriority && codeStr) {
      try {
        for (const fileName of ["active-agent-locks.json"]) {
          const lockFp = path.join("E:\\Dev\\Tool\\P0002-Social-Hub\\data", fileName);
          if (fs.existsSync(lockFp)) {
            const parsed = JSON.parse(fs.readFileSync(lockFp, "utf8")) || {};
            if (parsed.locks && typeof parsed.locks === "object") {
              const normC = String(codeStr).padStart(4, "0");
              delete parsed.locks[normC];
              for (const [k, v] of Object.entries(parsed.locks)) {
                if (v && typeof v === "object" && String(v.stealthId || "") === String(profileId)) {
                  delete parsed.locks[k];
                }
              }
              fs.writeFileSync(lockFp, JSON.stringify(parsed, null, 2), "utf8");
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (typeof sessionManager.close === "function") {
      await sessionManager.close(profileId, {
        force: true,
        forcePriority,
        ignoreIfUserInteractive: true,
      });
    } else if (typeof sessionManager.closeProfile === "function") {
      await sessionManager.closeProfile(profileId);
    }
  };
  const SUPPORT_CHAT_EXTENDED_IDLE_MS = 45 * 60_000;
  const stillActive = [];
  for (const s of headlessList) {
    const id = String(s.profileId || s.id || "");
    if (!id) continue;
    const code = extractSessionProfileCode(s);
    const normCallerId = normalizeCaller(s.callerId);
    const supportChatProtected = Boolean(s.supportChatProtected);
    const inlinePidMatch = normCallerId.match(/^agent:inline-(\d+)$/);
    const inlineCallerDead = Boolean(inlinePidMatch && !isPidAliveWin(Number(inlinePidMatch[1])));
    const isLocked = inlineCallerDead
      ? false
      : Boolean(
          activeOpenUrlProfiles.has(id) || protectedCodes.has(id) || (code && protectedCodes.has(code)),
        );
    const lastActive = isLocked
      ? now
      : Math.max(
          getWorkerSessionLastActivity(id, s.startedAt),
          Number(s.lastActivityAt || 0),
          Number(s.launchedAt || 0),
        );
    const idleMs = Math.max(0, now - lastActive);
    const effectiveMaxIdleMs = supportChatProtected
      ? Math.max(maxIdleMs, SUPPORT_CHAT_EXTENDED_IDLE_MS)
      : inlineCallerDead
        ? 10_000
        : maxIdleMs;
    if (!isLocked && idleMs > effectiveMaxIdleMs) {
      try {
        await closeHeadlessSession(id, code, true);
        sessionActivityMap.delete(id);
        guardState.totalIdleEvicted += 1;
        evicted.push({
          profileId: id,
          code,
          callerId: normCallerId,
          reason: inlineCallerDead ? "dead_inline_caller" : "idle_timeout",
          idleMs,
        });
      } catch {
        /* ignore */
      }
    } else {
      stillActive.push({
        ...s,
        profileId: id,
        code,
        callerId: normCallerId,
        supportChatProtected,
        lastActive,
        idleMs,
        isLocked: Boolean(isLocked || supportChatProtected),
      });
    }
  }

  // 1b. Enforce MAX_PER_CALLER = 3 per canonical callerId (never evicting supportChatProtected)
  const MAX_PER_CALLER = Math.max(
    1,
    Math.min(10, Number(process.env.STEALTH_MAX_HEADLESS_PER_CALLER || 3) || 3),
  );
  const byCallerMap = new Map();
  for (const item of stillActive) {
    const cid = item.callerId || "agent:inline";
    if (!byCallerMap.has(cid)) byCallerMap.set(cid, []);
    byCallerMap.get(cid).push(item);
  }
  const callerEvictedIds = new Set();
  for (const [cid, list] of byCallerMap.entries()) {
    if (list.length <= MAX_PER_CALLER) continue;
    list.sort((a, b) => {
      if (Boolean(a.supportChatProtected) !== Boolean(b.supportChatProtected)) {
        return a.supportChatProtected ? 1 : -1;
      }
      if (Boolean(a.isLocked) !== Boolean(b.isLocked)) return a.isLocked ? 1 : -1;
      return a.lastActive - b.lastActive;
    });
    const toEvict = list
      .filter((x) => !x.supportChatProtected)
      .slice(0, list.length - MAX_PER_CALLER);
    for (const victim of toEvict) {
      try {
        await closeHeadlessSession(victim.profileId, victim.code, true);
        sessionActivityMap.delete(victim.profileId);
        callerEvictedIds.add(victim.profileId);
        guardState.totalIdleEvicted += 1;
        evicted.push({
          profileId: victim.profileId,
          code: victim.code,
          callerId: cid,
          reason: "caller_cap_exceeded",
          maxPerCaller: MAX_PER_CALLER,
        });
      } catch {
        /* ignore */
      }
    }
  }
  if (callerEvictedIds.size > 0) {
    for (let i = stillActive.length - 1; i >= 0; i -= 1) {
      if (callerEvictedIds.has(stillActive[i].profileId)) {
        stillActive.splice(i, 1);
      }
    }
  }

  // 2. Enforce RAM ceiling across remaining headless sessions (evict unlocked sessions first)
  stillActive.sort((a, b) => {
    if (Boolean(a.isLocked) !== Boolean(b.isLocked)) return a.isLocked ? 1 : -1;
    return a.lastActive - b.lastActive;
  });
  let totalRamMb = measureHeadlessChromeRamMb(stillActive);
  while (totalRamMb > maxRamMb && stillActive.length > 0) {
    const unlockedIdx = stillActive.findIndex((s) => !s.isLocked);
    if (unlockedIdx === -1) break;
    const [oldest] = stillActive.splice(unlockedIdx, 1);
    if (!oldest) break;
    try {
      await sessionManager.closeProfile(oldest.profileId);
      sessionActivityMap.delete(oldest.profileId);
      guardState.totalRamEvicted += 1;
      evicted.push({
        profileId: oldest.profileId,
        reason: "ram_ceiling",
        totalRamMbBefore: totalRamMb,
        maxRamMb,
      });
    } catch {
      /* ignore */
    }
    totalRamMb = measureHeadlessChromeRamMb(stillActive);
  }

  guardState.lastSweepAt = new Date(now).toISOString();
  guardState.lastTotalHeadlessRamMb = totalRamMb;
  guardState.lastRunningHeadlessCount = stillActive.length;
  guardState.activeHeadlessSessions = stillActive.map((s) => ({
    id: s.profileId,
    code: s.code || extractSessionProfileCode(s) || s.name || s.profileId,
    callerId: String(s.callerId || "default-agent"),
    idleMs: Number(s.idleMs || 0),
    supportChatProtected: Boolean(s.supportChatProtected),
    isLocked: Boolean(s.isLocked),
  }));
  if (evicted.length > 0) {
    guardState.lastEvictedProfiles = evicted.slice(-20);
  }

  return {
    ok: true,
    ...guardState,
    evictedNow: evicted,
  };
}

function startAgentWorkerMemoryGuard({
  sessionManager,
  maxRamMb = DEFAULT_MAX_RAM_MB,
  maxIdleMs = DEFAULT_MAX_IDLE_MS,
  intervalMs = DEFAULT_SWEEP_INTERVAL_MS,
} = {}) {
  guardState.enabled = true;
  guardState.maxRamMb = maxRamMb;
  guardState.maxIdleMs = maxIdleMs;
  guardState.intervalMs = intervalMs;

  if (globalThis.__stealthWorkerGuardTimer) {
    try {
      clearInterval(globalThis.__stealthWorkerGuardTimer);
    } catch {
      /* ignore */
    }
    globalThis.__stealthWorkerGuardTimer = null;
  }

  if (sessionManager && typeof sessionManager.onChange === "function" && !sessionManager._workerGuardOnChangeRegistered) {
    sessionManager._workerGuardOnChangeRegistered = true;
    sessionManager.onChange(() => {
      try {
        const list = sessionManager.listRunning() || [];
        for (const s of list) {
          const id = String(s.profileId || s.id || "");
          if (id && !sessionActivityMap.has(id)) {
            sessionActivityMap.set(id, Date.now());
          }
        }
      } catch {
        /* ignore */
      }
    });
  }

  const timer = setInterval(() => {
    runWorkerGuardSweep({ sessionManager, maxRamMb, maxIdleMs }).catch(() => {});
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  globalThis.__stealthWorkerGuardTimer = timer;

  setImmediate(() => {
    runWorkerGuardSweep({ sessionManager, maxRamMb, maxIdleMs }).catch(() => {});
  });

  return {
    stop: () => {
      clearInterval(timer);
      if (globalThis.__stealthWorkerGuardTimer === timer) {
        globalThis.__stealthWorkerGuardTimer = null;
      }
    },
    sweepNow: () => runWorkerGuardSweep({ sessionManager, maxRamMb, maxIdleMs }),
    getState: () => ({ ...guardState }),
  };
}

function getWorkerGuardState(sessionManager) {
  trySwapStagedAsar();
  if (sessionManager && typeof sessionManager.listRunning === "function") {
    const now = Date.now();
    const protectedCodes = readProtectedCrossProcessAgentCodes(now);
    const headlessList = (sessionManager.listRunning() || []).filter(
      (s) => s && (s.headless === true || s.shadowLane === true) && !USER_RESERVED_PROFILE_CODES.has(extractSessionProfileCode(s)),
    );
    guardState.lastRunningHeadlessCount = headlessList.length;
    guardState.activeHeadlessSessions = headlessList.map((s) => {
      const id = String(s.profileId || s.id || "");
      const code = extractSessionProfileCode(s) || String(s.name || id).slice(0, 8);
      const lastActive = Math.max(
        getWorkerSessionLastActivity(id, s.startedAt),
        Number(s.lastActivityAt || 0),
        Number(s.launchedAt || 0),
      );
      const supportChatProtected = Boolean(s.supportChatProtected);
      const isLocked = Boolean(
        supportChatProtected || activeOpenUrlProfiles.has(id) || protectedCodes.has(id) || (code && protectedCodes.has(code)),
      );
      let normCallerId = String(s.callerId || "agent:inline");
      try {
        const { normalizeAgentCallerId } = require("./agent-smoke-context.cjs");
        if (typeof normalizeAgentCallerId === "function") {
          normCallerId = normalizeAgentCallerId(normCallerId);
        }
      } catch {
        /* ignore */
      }
      return {
        id,
        code,
        callerId: normCallerId,
        idleMs: lastActive > 0 ? Math.max(0, now - lastActive) : 0,
        supportChatProtected,
        isLocked,
      };
    });
  }
  return { ...guardState };
}

/**
 * Spawns a tiny hidden detached Node helper on `will-quit` of `Stealth Browser Console.exe`
 * that waits for the Electron process to exit, verifies SHA256 + ASAR header integrity of
 * `app.asar.staged`, and swaps `app.asar.staged` -> `app.asar` (or rolls back if corrupted).
 */
function scheduleStagedAsarSwapOnQuit() {
  const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\CzP\\AppData\\Local";
  const resDir = path.join(localAppData, "Programs", "stealth-browser-console", "resources");
  const stagedAsar = path.join(resDir, "app.asar.staged");
  const targetAsar = path.join(resDir, "app.asar");
  const stagedMeta = `${stagedAsar}.sha256.json`;
  const backupAsar = path.join(resDir, "app.asar.prev");
  try {
    if (!fs.existsSync(stagedAsar)) return false;
    const { spawn } = require("node:child_process");
    const nodew = "E:\\Dev\\.tools\\nodew.exe";
    const exe = fs.existsSync(nodew) ? nodew : process.execPath;
    const inline = `
      setTimeout(() => {
        const fs = require("fs");
        const crypto = require("crypto");
        const s = ${JSON.stringify(stagedAsar)};
        const t = ${JSON.stringify(targetAsar)};
        const m = ${JSON.stringify(stagedMeta)};
        const b = ${JSON.stringify(backupAsar)};
        if (!fs.existsSync(s)) process.exit(0);
        try {
          const st = fs.statSync(s);
          if (st.size < 10000000) {
            fs.unlinkSync(s);
            if (fs.existsSync(m)) fs.unlinkSync(m);
            process.exit(0);
          }
          const fd = fs.openSync(s, "r");
          const hdr = Buffer.alloc(16);
          fs.readSync(fd, hdr, 0, 16, 0);
          if (hdr.readUInt32LE(0) !== 4) {
            fs.closeSync(fd);
            fs.unlinkSync(s);
            if (fs.existsSync(m)) fs.unlinkSync(m);
            process.exit(0);
          }
          if (fs.existsSync(m)) {
            const meta = JSON.parse(fs.readFileSync(m, "utf8"));
            const hash = crypto.createHash("sha256");
            const buf = Buffer.allocUnsafe(8 * 1024 * 1024);
            let pos = 0;
            while (pos < st.size) {
              const n = fs.readSync(fd, buf, 0, Math.min(buf.length, st.size - pos), pos);
              if (n <= 0) break;
              hash.update(buf.subarray(0, n));
              pos += n;
            }
            const digest = hash.digest("hex");
            if ((meta.size && Number(meta.size) !== st.size) || (meta.sha256 && digest !== String(meta.sha256).toLowerCase())) {
              fs.closeSync(fd);
              fs.unlinkSync(s);
              fs.unlinkSync(m);
              process.exit(0);
            }
          }
          fs.closeSync(fd);
        } catch {
          process.exit(0);
        }
        for (let i = 0; i < 20; i++) {
          try {
            if (!fs.existsSync(s)) process.exit(0);
            try { if (fs.existsSync(t)) { fs.chmodSync(t, 0o666); fs.copyFileSync(t, b); } } catch {}
            fs.copyFileSync(s, t);
            try { fs.chmodSync(t, 0o444); } catch {}
            fs.unlinkSync(s);
            try { if (fs.existsSync(m)) fs.unlinkSync(m); } catch {}
            process.exit(0);
          } catch {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400);
          }
        }
      }, 900);
    `;
    const child = spawn(exe, ["-e", inline], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  touchWorkerSessionActivity,
  setOpenUrlProfileActive,
  runWorkerGuardSweep,
  startAgentWorkerMemoryGuard,
  getWorkerGuardState,
  verifyStagedAsarIntegrity,
  trySwapStagedAsar,
  scheduleStagedAsarSwapOnQuit,
};
