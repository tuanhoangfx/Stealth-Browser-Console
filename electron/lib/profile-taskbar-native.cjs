/**
 * Win32 taskbar chrome for Cloak/Chrome profile windows.
 *
 * Design V4 (locked 2026-07-21): Chromium icon + colored last3 only (no scrim/plate).
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runPowerShellFile, resolveElectronLibScript } = require("./powershell-exec.cjs");
const { runTaskbarApplyWorker, waitWorkerReady } = require("./taskbar-apply-worker.cjs");
const {
  extractFourDigitCode,
  badgeLast3,
  digitArgbForCode,
  digitGapsCsvForSizes,
} = require("./profile-code.cjs");

/** Design V4 — digits only on native Chromium icon; thousands → digit color (0=white, 1–9 vivid). */
const BADGE_STYLE = "v4-digits-only-spaced8";
/** Hot path for taskbar apply — 48/32/16 only (Win11 ~40–48; 16 small). Fewer sizes = faster cold ICO. */
const HOT_ICO_SIZES = Object.freeze([48, 32, 16]);
/** Prefer 48 first — Win11 taskbar often uses ~40–48px icons. */
const BADGE_ICO_SIZES = Object.freeze([48, 32, 24, 20, 16, 40, 64, 128, 256]);
/** Dedupe concurrent ICO renders for the same code (launch + scheduler + apply). */
const badgeIcoInflight = new Map();
/** Cap parallel PowerShell ICO renders — opening many profiles at once thrash otherwise. */
const ICO_RENDER_MAX = 3;
let icoRenderActive = 0;
/** @type {Array<() => void>} */
const icoRenderWaiters = [];

async function withIcoRenderSlot(work) {
  while (icoRenderActive >= ICO_RENDER_MAX) {
    await new Promise((resolve) => {
      icoRenderWaiters.push(resolve);
    });
  }
  icoRenderActive += 1;
  try {
    return await work();
  } finally {
    icoRenderActive -= 1;
    const next = icoRenderWaiters.shift();
    if (next) next();
  }
}

function resolveChromiumExe() {
  const root = path.join(os.homedir(), ".cloakbrowser");
  if (!fs.existsSync(root)) return "";
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return "";
  }
  const dirs = names
    .filter((n) => String(n).startsWith("chromium-"))
    .sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }));
  for (const d of dirs) {
    const exe = path.join(root, d, "chrome.exe");
    if (fs.existsSync(exe)) return exe;
  }
  return "";
}

/** Agent pool 9990–9999 — headless smoke, no taskbar HWND. */
function isAgentPoolProfileCode(code) {
  const n = Number(extractFourDigitCode(code));
  return Number.isInteger(n) && n >= 9990 && n <= 9999;
}

function shouldSkipTaskbarBadge(code, opts = {}) {
  if (opts.headless === true) return true;
  return isAgentPoolProfileCode(code);
}

/** Resolve Win32 HintPid — opts hint → sidecar (sync, no WMI). Skip dead PIDs. */
function readTaskbarHintPid(userDataDir, hinted = 0) {
  const fromHint = Number(hinted);
  if (fromHint > 0) {
    try {
      process.kill(fromHint, 0);
      return fromHint;
    } catch {
      /* hinted PID gone — fall through to sidecar */
    }
  }
  try {
    const { readSidecarPid } = require("./profile-user-data-repair.cjs");
    const sidecar = readSidecarPid(userDataDir);
    if (sidecar?.pid > 0) {
      try {
        process.kill(sidecar.pid, 0);
        return sidecar.pid;
      } catch {
        /* stale sidecar */
      }
    }
  } catch {
    /* ignore */
  }
  return 0;
}

/** Poll sidecar/hint until PID ready — keeps apply script off Get-CimInstance. */
async function waitForTaskbarHintPid(userDataDir, hinted = 0, { timeoutMs = 1200, intervalMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pid = readTaskbarHintPid(userDataDir, hinted);
    if (pid > 0) return pid;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return readTaskbarHintPid(userDataDir, hinted);
}

/** Poll MainWindowHandle for a browser PID — single PS spawn (not per-tick). */
async function waitForBrowserMainWindow(pid, { timeoutMs = 2400, intervalMs = 30 } = {}) {
  const id = Number(pid);
  if (!id || process.platform !== "win32") return false;
  const { runPowerShellCommandAsync } = require("./powershell-exec.cjs");
  const budgetMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : 2400;
  const stepMs = Number(intervalMs) > 0 ? Number(intervalMs) : 30;
  const loops = Math.max(1, Math.ceil(budgetMs / stepMs));
  const script = [
    `$id = ${id}`,
    `$loops = ${loops}`,
    `$step = ${stepMs}`,
    "for ($i = 0; $i -lt $loops; $i++) {",
    "  $p = Get-Process -Id $id -ErrorAction SilentlyContinue",
    "  if ($p -and $p.MainWindowHandle -ne 0) { Write-Output '1'; exit 0 }",
    "  Start-Sleep -Milliseconds $step",
    "}",
    "Write-Output '0'",
  ].join("\n");
  try {
    const out = await runPowerShellCommandAsync(script);
    return String(out).trim() === "1";
  } catch {
    return false;
  }
}

/** Fire-and-forget: poll Playwright/context PID and write stealth-pid.json early. */
function startBrowserPidSidecarPoll(userDataDir, getPidFn, { debugPort = 0, timeoutMs = 4500, intervalMs = 25 } = {}) {
  if (!userDataDir || process.platform !== "win32") return;
  const { writeSidecarPid } = require("./profile-user-data-repair.cjs");
  void (async () => {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    const lockProbeMs = [60, 150, 300, 550, 900, 1400];
    let lockProbeIdx = 0;
    while (Date.now() < deadline) {
      let pid = 0;
      try {
        pid = Number(typeof getPidFn === "function" ? getPidFn() : 0) || 0;
      } catch {
        pid = 0;
      }
      if (pid > 0) {
        writeSidecarPid(userDataDir, { pid, debugPort });
        return;
      }
      const elapsed = Date.now() - startedAt;
      if (lockProbeIdx < lockProbeMs.length && elapsed >= lockProbeMs[lockProbeIdx]) {
        lockProbeIdx += 1;
        try {
          const { listProfileBrowserPidsByLock } = require("./profile-browser-orphan.cjs");
          const lockPids = await listProfileBrowserPidsByLock(userDataDir);
          const lockPid = lockPids[0] || 0;
          if (lockPid > 0) {
            writeSidecarPid(userDataDir, { pid: lockPid, debugPort });
            return;
          }
        } catch {
          /* ignore */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    try {
      const { listProfileBrowserPids } = require("./profile-browser-orphan.cjs");
      const pids = await listProfileBrowserPids(userDataDir);
      const pid = pids[0] || 0;
      if (pid > 0) writeSidecarPid(userDataDir, { pid, debugPort });
    } catch {
      /* ignore */
    }
  })();
}

function badgeCacheDir() {
  const dir = path.join(os.tmpdir(), "stealth-taskbar-badges");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function badgeCachePath(code, { hot = false } = {}) {
  const digits = String(code || "0000").replace(/[^\w.-]+/g, "").slice(0, 8) || "0000";
  const suffix = hot ? "-hot" : "";
  return path.join(badgeCacheDir(), `${BADGE_STYLE}-${digits}${suffix}.ico`);
}

/** Remove ICO/PNG from prior badge styles (v3-digit-halo-*, v4-digits-only-*, etc.). */
function pruneStaleBadgeCache() {
  if (process.platform !== "win32") return { removed: 0 };
  const dir = badgeCacheDir();
  if (!fs.existsSync(dir)) return { removed: 0 };
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name.startsWith("apply-") && name.endsWith(".ps1")) {
      try {
        fs.unlinkSync(full);
        removed += 1;
      } catch {
        /* ignore */
      }
      continue;
    }
    if (!name.endsWith(".ico") && !name.endsWith(".png")) continue;
    if (name.startsWith(`${BADGE_STYLE}-`)) continue;
    try {
      fs.unlinkSync(full);
      removed += 1;
    } catch {
      /* ignore */
    }
  }
  return { removed };
}

let pruneRan = false;
function pruneStaleBadgeCacheOnce() {
  if (pruneRan) return;
  pruneRan = true;
  try {
    pruneStaleBadgeCache();
  } catch {
    /* ignore */
  }
}

/** Pack one or more PNG frames into a Vista+ ICO (preserves alpha). */
function pngBuffersToIco(frames) {
  const list = (Array.isArray(frames) ? frames : [{ width: 64, height: 64, buffer: frames }]).filter(
    (f) => f && Buffer.isBuffer(f.buffer) && f.buffer.length > 0,
  );
  if (!list.length) throw new Error("pngBuffersToIco: no frames");
  const count = list.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const dirs = [];
  let offset = 6 + 16 * count;
  for (const f of list) {
    const w = Number(f.width) || 0;
    const h = Number(f.height) || 0;
    const entry = Buffer.alloc(16);
    entry.writeUInt8(w >= 256 ? 0 : w, 0);
    entry.writeUInt8(h >= 256 ? 0 : h, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(f.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += f.buffer.length;
    dirs.push(entry);
  }
  return Buffer.concat([header, ...dirs, ...list.map((f) => f.buffer)]);
}

/**
 * Design V4 — native Chromium icon + colored last3 + digit gap + thin halo.
 * @param {string} code
 * @param {{ hot?: boolean }} [opts] hot=true → hot ICO sizes only for fast taskbar apply
 */
async function ensureBadgeIco(code, opts = {}) {
  pruneStaleBadgeCacheOnce();
  const full = extractFourDigitCode(code);
  const digits = badgeLast3(full);
  const hot = Boolean(opts.hot);
  const fullIco = badgeCachePath(full);
  const hotIco = badgeCachePath(full, { hot: true });

  if (!hot && fs.existsSync(fullIco) && fs.statSync(fullIco).size > 200) return fullIco;
  if (hot) {
    if (fs.existsSync(hotIco) && fs.statSync(hotIco).size > 200) return hotIco;
    if (fs.existsSync(fullIco) && fs.statSync(fullIco).size > 200) return fullIco;
  }

  const inflightKey = `${full}:${hot ? "hot" : "full"}`;
  const pending = badgeIcoInflight.get(inflightKey);
  if (pending) return pending;

  const work = (async () => {
    const [, dR, dG, dB] = digitArgbForCode(full);
    const chromeExe = resolveChromiumExe();
    if (!chromeExe) throw new Error("chromium exe not found");

    const sizes = hot ? HOT_ICO_SIZES.slice() : BADGE_ICO_SIZES.slice();
    const outDir = badgeCacheDir();
    const prefix = `${BADGE_STYLE}-${full}${hot ? "-hot" : ""}`;
    const ico = hot ? hotIco : fullIco;
    const ps1 = resolveElectronLibScript("render-taskbar-badge.ps1");
    await withIcoRenderSlot(async () => {
      const { stdout } = await runPowerShellFile(
        ps1,
        [
          "-Digits",
          digits,
          "-OutDir",
          outDir,
          "-Prefix",
          prefix,
          "-ChromeExe",
          chromeExe,
          "-DigitR",
          String(dR),
          "-DigitG",
          String(dG),
          "-DigitB",
          String(dB),
          "-SizesCsv",
          sizes.join(","),
          "-DigitGapsCsv",
          digitGapsCsvForSizes(sizes),
        ],
        { timeout: hot ? 15_000 : 60_000 },
      );
      if (!String(stdout).includes("OK")) {
        throw new Error(`badge png failed: ${String(stdout).trim()} (code=${full} d=${digits})`);
      }

      const frames = [];
      for (const size of sizes) {
        const pngPath = path.join(outDir, `${prefix}-${size}.png`);
        if (!fs.existsSync(pngPath)) {
          throw new Error(`badge png missing size ${size}`);
        }
        frames.push({ width: size, height: size, buffer: fs.readFileSync(pngPath) });
        try {
          fs.unlinkSync(pngPath);
        } catch {
          /* ignore */
        }
      }

      fs.writeFileSync(ico, pngBuffersToIco(frames));
      if (!fs.existsSync(ico) || fs.statSync(ico).size < 200) {
        throw new Error("badge ico write failed");
      }
    });
    if (hot) {
      void ensureBadgeIco(full).catch(() => undefined);
    }
    return ico;
  })();

  badgeIcoInflight.set(inflightKey, work);
  try {
    return await work;
  } finally {
    badgeIcoInflight.delete(inflightKey);
  }
}

/** Fast path for taskbar apply — 48/32/16 only (~0.5–2s cold). */
async function ensureBadgeIcoFast(code) {
  return ensureBadgeIco(code, { hot: true });
}

/** Fire-and-forget: pre-build hot ICO for recently opened profiles (app boot). */
function warmRecentBadgeIcosOnStartup(getProfiles, { limit = 16 } = {}) {
  if (process.platform !== "win32") return;
  pruneStaleBadgeCacheOnce();
  let profiles = [];
  try {
    profiles = typeof getProfiles === "function" ? getProfiles(limit) : [];
  } catch {
    profiles = [];
  }
  warmBadgeIcosForProfiles(profiles, { limit });
}

/** Pre-compile Win32 interop DLL + start persistent apply worker (~once per boot). */
async function warmTaskbarApplyRuntime() {
  if (process.platform !== "win32") return;
  try {
    await waitWorkerReady();
    await runTaskbarApplyWorker({ warm: true }, { timeoutMs: 20_000 });
  } catch {
    const applyPs1 = resolveElectronLibScript("stealth-taskbar-apply.ps1");
    try {
      await runPowerShellFile(
        applyPs1,
        ["-UserDataDir", ".", "-Title", "warm", "-Ico", ".", "-AppId", "warm", "-WarmOnly"],
        { timeout: 20_000 },
      );
    } catch {
      /* ignore */
    }
  }
}

/** Fire-and-forget: pre-build hot ICO for profile codes (launch / directory list). */
function warmBadgeIcosForProfiles(profiles, { limit = 12 } = {}) {
  if (!Array.isArray(profiles) || !profiles.length || process.platform !== "win32") return;
  pruneStaleBadgeCacheOnce();
  const { extractProfileCode } = require("./profile-code.cjs");
  const seen = new Set();
  const codes = [];
  for (const p of profiles) {
    const code = extractProfileCode(p?.name, p?.id);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
    if (codes.length >= limit) break;
  }
  for (const code of codes) {
    void ensureBadgeIcoFast(code).catch(() => undefined);
  }
}

async function applyNativeProfileTaskbarChrome(userDataDir, title, code, opts = {}) {
  if (process.platform !== "win32" || !userDataDir) {
    return { ok: false, reason: "unsupported" };
  }
  if (shouldSkipTaskbarBadge(code || title, opts)) {
    return { ok: false, reason: "skipped-headless" };
  }
  const label = String(title || "").trim().slice(0, 120);
  if (!label) return { ok: false, reason: "empty-title" };

  const digits = extractFourDigitCode(code || label);
  let icoPath = "";
  try {
    if (opts.icoWarm) {
      icoPath = await opts.icoWarm;
    }
    if (!icoPath) {
      icoPath = await ensureBadgeIcoFast(digits);
    }
  } catch (error) {
    try {
      icoPath = await ensureBadgeIco(digits);
    } catch (fallbackError) {
      return {
        ok: false,
        reason: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      };
    }
  }

  const dir = path.resolve(String(userDataDir));
  const appId = `StealthBrowser.Profile.${digits}`;
  let browserPid = readTaskbarHintPid(dir, opts.browserPid);
  if (!browserPid) {
    try {
      const { listProfileBrowserPidsByLock } = require("./profile-browser-orphan.cjs");
      const lockPids = await listProfileBrowserPidsByLock(dir);
      browserPid = Number(lockPids[0]) || 0;
    } catch {
      /* lock probe is best-effort — title HWND fallback covers pid=0 */
    }
  }
  const pidWaitMs = Number(opts.pidWaitMs);
  if (!browserPid && pidWaitMs > 0) {
    browserPid = await waitForTaskbarHintPid(dir, opts.browserPid, {
      timeoutMs: pidWaitMs,
      intervalMs: 25,
    });
  }
  const hwndWaitMs = Number(opts.hwndWaitMs);
  if (browserPid > 0 && hwndWaitMs > 0) {
    await waitForBrowserMainWindow(browserPid, {
      timeoutMs: hwndWaitMs,
      intervalMs: 30,
    });
  }
  const applyPs1 = resolveElectronLibScript("stealth-taskbar-apply.ps1");
  const workerPayload = {
    UserDataDir: dir,
    Title: label,
    Ico: icoPath,
    AppId: appId,
    HintPid: browserPid,
  };

  try {
    const tWorker = Date.now();
    const workerResp = await runTaskbarApplyWorker(workerPayload, { timeoutMs: 20_000 });
    const workerMs = Date.now() - tWorker;
    const result = String(workerResp?.result || "").trim();
    const wmiSkipped = workerResp?.wmiSkipped === true;
    if (result === "OK_ICON" || result === "OK_TITLE") {
      return { ok: true, detail: result, wmiSkipped, workerMs, via: "worker" };
    }
    if (result === "MISSING") return { ok: false, reason: "not-running", wmiSkipped, workerMs, via: "worker" };
    return { ok: false, reason: result || "no-window", wmiSkipped, workerMs, via: "worker" };
  } catch {
    /* fallback one-shot PS */
  }

  try {
    const tSpawn = Date.now();
    const { stdout, stderr } = await runPowerShellFile(
      applyPs1,
      [
        "-UserDataDir",
        dir,
        "-Title",
        label,
        "-Ico",
        icoPath,
        "-AppId",
        appId,
        "-HintPid",
        String(browserPid),
      ],
      { timeout: 20_000 },
    );
    const psSpawnMs = Date.now() - tSpawn;
    const result = String(stdout).trim().split(/\r?\n/).pop()?.trim();
    const wmiSkipped = browserPid > 0;
    if (result === "OK_ICON" || result === "OK_TITLE") {
      return { ok: true, detail: result, wmiSkipped, psSpawnMs, via: "spawn" };
    }
    if (result === "MISSING") return { ok: false, reason: "not-running", wmiSkipped, psSpawnMs, via: "spawn" };
    return { ok: false, reason: result || "no-window", detail: String(stderr || "").slice(0, 200), wmiSkipped, psSpawnMs, via: "spawn" };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

const { focusProfileBrowserWindow } = require("./profile-browser-orphan.cjs");

function isOkTaskbarIcon(result) {
  return Boolean(result?.ok && result.detail === "OK_ICON");
}

function isNoHwndTaskbar(result) {
  const reason = String(result?.reason || result?.detail || "").toUpperCase();
  return reason === "NOHWND" || reason === "NO-WINDOW";
}

function isRetryableTaskbarFailure(result) {
  if (isOkTaskbarIcon(result)) return false;
  const reason = String(result?.reason || result?.detail || "").toLowerCase();
  if (!reason || reason === "no-attempt") return true;
  if (reason.includes("timeout")) return true;
  return (
    reason === "nohwnd" ||
    reason === "no-window" ||
    reason === "not-running" ||
    reason === "missing"
  );
}

/**
 * Retry apply when HWND/PID not ready yet (profile open hot path).
 * Focus only on NOHWND — focus-steal on every retry breaks multi-profile open.
 */
async function applyNativeProfileTaskbarChromeWithRetry(userDataDir, title, code, opts = {}) {
  const retryDelaysMs = opts.retryDelaysMs || [0, 300, 700, 1500, 3000, 6000, 12_000];
  const focusRetry = opts.focusRetry !== false;
  const firstPidWaitMs = Number(opts.pidWaitMs) > 0 ? Number(opts.pidWaitMs) : 160;
  let last = null;

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    if (retryDelaysMs[attempt]) {
      await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
    }
    if (attempt >= 3 && focusRetry && last && isNoHwndTaskbar(last)) {
      await focusProfileBrowserWindow(userDataDir);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const freshPid = readTaskbarHintPid(userDataDir, opts.browserPid);
    last = await applyNativeProfileTaskbarChrome(userDataDir, title, code, {
      browserPid: freshPid,
      pidWaitMs: attempt === 0 ? firstPidWaitMs : 0,
      hwndWaitMs: attempt === 0 && Number(opts.hwndWaitMs) > 0 ? Number(opts.hwndWaitMs) : 0,
      icoWarm: attempt === 0 ? opts.icoWarm : undefined,
    });
    if (isOkTaskbarIcon(last)) return last;
    if (!isRetryableTaskbarFailure(last)) break;
    // Alive HintPid with no HWND (utility/zygote) — clear so next attempt rediscovers via sidecar/WMI.
    if (isNoHwndTaskbar(last) && attempt < retryDelaysMs.length - 1) {
      opts = { ...opts, browserPid: 0 };
    }
  }

  return last || { ok: false, reason: "no-attempt" };
}

module.exports = {
  BADGE_STYLE,
  HOT_ICO_SIZES,
  resolveChromiumExe,
  ensureBadgeIco,
  ensureBadgeIcoFast,
  warmBadgeIcosForProfiles,
  warmRecentBadgeIcosOnStartup,
  warmTaskbarApplyRuntime,
  pruneStaleBadgeCache,
  isAgentPoolProfileCode,
  shouldSkipTaskbarBadge,
  readTaskbarHintPid,
  waitForTaskbarHintPid,
  waitForBrowserMainWindow,
  startBrowserPidSidecarPoll,
  applyNativeProfileTaskbarChrome,
  applyNativeProfileTaskbarChromeWithRetry,
  isRetryableTaskbarFailure,
  badgeCachePath,
};
