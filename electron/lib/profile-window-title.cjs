/**
 * Profile browser window title (taskbar / Alt-Tab label).
 */
const path = require("node:path");
const { extractProfileCode } = require("./profile-code.cjs");
const {
  applyNativeProfileTaskbarChromeWithRetry,
  ensureBadgeIcoFast,
  shouldSkipTaskbarBadge,
  waitForTaskbarHintPid,
  readTaskbarHintPid,
} = require("./profile-taskbar-native.cjs");

/**
 * Per userDataDir apply state.
 * Early + late schedule must NOT cancel each other (gen bump mid-retry = missing badges).
 * @type {Map<string, { gen: number, digits: string, inFlight: boolean, okAt: number, browserPid: number, needsRestamp: boolean }>}
 */
const badgeApplyState = new Map();

/**
 * @param {{ name?: string, id?: string }} profile
 * @returns {string}
 */
function formatProfileWindowLabel(profile) {
  const code = extractProfileCode(profile?.name, profile?.id);
  const name = String(profile?.name || "").trim();
  if (!name) return code;
  if (/^(profile[\s_-]*)?\d{3,5}$/i.test(name)) return code;
  if (name === code) return code;
  if (new RegExp(`^${code}\\b`).test(name)) return name;
  // "Lucy 0385" → "0385 · Lucy" (code already in label, don't duplicate)
  const tail = name.match(new RegExp(`^(.*?)\\s*${code}\\s*$`, "i"));
  if (tail && String(tail[1] || "").trim()) {
    return `${code} · ${String(tail[1]).trim()}`;
  }
  return `${code} · ${name}`;
}

/** In-page installer — kept as a plain function for Playwright addInitScript. */
function installProfileTitlePrefix(label) {
  const prefix = `${label} — `;
  const code = String(label).split(" · ")[0];
  const alreadyPrefixed = (s) =>
    s.startsWith(label) ||
    s.startsWith(prefix) ||
    s.startsWith(`${code} —`) ||
    s.startsWith(`${code} ·`);

  try {
    const proto = Document.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "title");
    if (!desc?.get || !desc?.set) {
      const cur = String(document.title || "");
      document.title = cur && !alreadyPrefixed(cur) ? prefix + cur : label;
      return;
    }
    if (proto.__stealthTitlePrefix === label) {
      const cur = String(desc.get.call(document) || "");
      if (!alreadyPrefixed(cur)) desc.set.call(document, cur ? prefix + cur : label);
      return;
    }
    proto.__stealthTitlePrefix = label;
    Object.defineProperty(proto, "title", {
      configurable: true,
      enumerable: Boolean(desc.enumerable),
      get() {
        return desc.get.call(this);
      },
      set(value) {
        const s = String(value ?? "");
        if (!s) {
          desc.set.call(this, label);
          return;
        }
        if (alreadyPrefixed(s)) {
          desc.set.call(this, s);
          return;
        }
        desc.set.call(this, prefix + s);
      },
    });
    const cur = String(desc.get.call(document) || "");
    desc.set.call(document, cur && !alreadyPrefixed(cur) ? prefix + cur : label);
  } catch {
    try {
      document.title = label;
    } catch {
      /* ignore */
    }
  }
}

/** Chromium wipes WM_SETICON on title/nav — keep re-stamping after open.
 * 4 passes (not 9): 18×9 recover jobs used to serialize the 4 workers and starve
 * later profiles. Guard (20s, never-OK first) covers the long tail. */
const BADGE_RECOVER_DELAYS_MS = Object.freeze([800, 2500, 8000, 20_000]);
/** Guard/reinforce may preempt an apply stuck on a dead WMI/worker (~12s+). */
const INFLIGHT_STALE_MS = 12_000;

function queueBadgeRecoverPasses(dir, title, digits, browserPid, headless) {
  for (const ms of BADGE_RECOVER_DELAYS_MS) {
    const timer = setTimeout(() => {
      scheduleProfileTaskbarBadgeApply(dir, title, digits, {
        browserPid: readTaskbarHintPid(dir, browserPid) || browserPid,
        force: true,
        isReinforce: true,
        headless,
      });
    }, ms);
    if (typeof timer.unref === "function") timer.unref();
  }
}

/**
 * Fire-and-forget Win32 taskbar badge — target OK_ICON within ~3s when ICO cached.
 * Same-code in-flight / recent OK is not cancelled by a second schedule (post-nav).
 * Chromium resets WM_SETICON on title/nav — reinforce passes re-apply after OK.
 *
 * Critical: nav restamp must NOT abort an in-flight open apply (gen bump used to
 * kill the open path mid-flight and drop its recover timers → intermittent miss).
 */
function scheduleProfileTaskbarBadgeApply(userDataDir, label, code, opts = {}) {
  const dir = String(userDataDir || "").trim();
  if (!dir || process.platform !== "win32") return;

  const digits = String(code || label || "").trim() || extractProfileCode(label, "");
  if (shouldSkipTaskbarBadge(digits, opts)) return;

  const title = String(label || digits).trim().slice(0, 120);
  let browserPid = Number(opts.browserPid) > 0 ? Number(opts.browserPid) : 0;
  const force = opts.force === true;
  const isReinforce = opts.isReinforce === true;
  const prev = badgeApplyState.get(dir);

  // Soft schedule: merge PID only; never start a parallel apply for same code.
  if (!force && prev?.digits === digits) {
    if (browserPid > 0) prev.browserPid = browserPid;
    if (prev.inFlight) return;
    // Soft re-apply after 8s — Chrome often wipes icon on first navigations.
    if (prev.okAt && Date.now() - prev.okAt < 8_000) return;
  }

  // Reinforce / nav restamp: never abort a fresh open-path (drops recover chain).
  // Stale inFlight (WMI hang / worker timeout) used to block guard forever → only
  // the first ~10 burst-open profiles kept a badge.
  if (isReinforce && prev?.digits === digits && prev.inFlight) {
    const age = Date.now() - (Number(prev.startedAt) || 0);
    if (age < INFLIGHT_STALE_MS) {
      if (browserPid > 0) prev.browserPid = browserPid;
      prev.needsRestamp = true;
      return;
    }
  }

  const gen = (prev?.gen || 0) + 1;
  badgeApplyState.set(dir, {
    gen,
    digits,
    inFlight: true,
    startedAt: Date.now(),
    okAt: prev?.okAt || 0,
    browserPid,
    needsRestamp: prev?.needsRestamp === true,
  });

  void (async () => {
    const t0 = Date.now();
    const icoWarm = ensureBadgeIcoFast(digits);
    void icoWarm.catch((error) => {
      console.warn(
        "[taskbar-badge] ico warm:",
        error instanceof Error ? error.message : error,
      );
    });

    const state = () => badgeApplyState.get(dir);
    if (state()?.gen !== gen) return;

    // Wait for sidecar/Playwright PID before first apply — avoids WMI miss + NOHWND on cold open.
    let resolvedPid = readTaskbarHintPid(dir, state()?.browserPid || browserPid);
    if (!resolvedPid && !isReinforce) {
      resolvedPid = await waitForTaskbarHintPid(dir, state()?.browserPid || browserPid, {
        timeoutMs: 2500,
        intervalMs: 40,
      });
    }
    if (state()?.gen !== gen) return;

    try {
      const r = await applyNativeProfileTaskbarChromeWithRetry(dir, title, digits, {
        browserPid: resolvedPid || state()?.browserPid || browserPid,
        pidWaitMs: isReinforce ? 0 : 200,
        hwndWaitMs: 0, // PS apply now polls MainWindowHandle when HintPid set
        focusRetry: !isReinforce,
        icoWarm,
        retryDelaysMs: isReinforce
          ? [0, 250, 600, 1200, 2500]
          : [0, 80, 160, 280, 450, 700, 1100, 1800, 2800],
      });
      if (state()?.gen !== gen) return;
      const cur = state();
      const pendingRestamp = Boolean(cur?.needsRestamp);
      if (cur && cur.gen === gen) {
        cur.inFlight = false;
        cur.needsRestamp = false;
      }

      if (r?.ok && r.detail === "OK_ICON") {
        if (cur && cur.gen === gen) cur.okAt = Date.now();
        console.log(
          "[taskbar-badge] OK_ICON",
          path.basename(dir),
          `${Date.now() - t0}ms`,
          r.via || "",
          isReinforce ? "reinforce" : "open",
          `pid=${resolvedPid || 0}`,
        );
        if (!isReinforce) {
          queueBadgeRecoverPasses(dir, title, digits, resolvedPid || browserPid, opts.headless);
        }
        if (pendingRestamp) {
          scheduleProfileTaskbarBadgeApply(dir, title, digits, {
            browserPid: resolvedPid || browserPid,
            force: true,
            isReinforce: true,
            headless: opts.headless,
          });
        }
        return;
      }

      console.warn(
        "[taskbar-badge] apply incomplete",
        path.basename(dir),
        r?.reason || r?.detail || "unknown",
        `${Date.now() - t0}ms`,
        `pid=${resolvedPid || 0}`,
        `wmiSkipped=${r?.wmiSkipped === true}`,
      );
      // Incomplete open must still recover — HWND/ICO often arrive after first wave.
      if (!isReinforce) {
        queueBadgeRecoverPasses(dir, title, digits, resolvedPid || browserPid, opts.headless);
      }
      if (pendingRestamp) {
        scheduleProfileTaskbarBadgeApply(dir, title, digits, {
          browserPid: resolvedPid || browserPid,
          force: true,
          isReinforce: true,
          headless: opts.headless,
        });
      }
    } catch (error) {
      const cur = state();
      const pendingRestamp = Boolean(cur?.needsRestamp);
      if (cur && cur.gen === gen) {
        cur.inFlight = false;
        cur.needsRestamp = false;
      }
      console.warn(
        "[taskbar-badge] apply error",
        path.basename(dir),
        error instanceof Error ? error.message : error,
      );
      if (!isReinforce) {
        queueBadgeRecoverPasses(dir, title, digits, resolvedPid || browserPid, opts.headless);
      }
      if (pendingRestamp) {
        scheduleProfileTaskbarBadgeApply(dir, title, digits, {
          browserPid: resolvedPid || browserPid,
          force: true,
          isReinforce: true,
          headless: opts.headless,
        });
      }
    }
  })();
}

/** Last successful OK_ICON ms for a profile dir — 0 if never stamped. */
function lastTaskbarBadgeOkAt(userDataDir) {
  const dir = String(userDataDir || "").trim();
  if (!dir) return 0;
  return Number(badgeApplyState.get(dir)?.okAt) || 0;
}

/** @type {ReturnType<typeof setTimeout> | null} */
let missingBadgeSweepTimer = null;

/**
 * After burst-open, restamp dirs that never got OK_ICON (later windows used to starve).
 * @param {() => Array<{ userDataDir?: string, label?: string, code?: string, browserPid?: number, headless?: boolean }>} listRunning
 */
function scheduleMissingBadgeSweep(listRunning, { delayMs = 2500 } = {}) {
  if (typeof listRunning !== "function") return;
  if (missingBadgeSweepTimer) clearTimeout(missingBadgeSweepTimer);
  missingBadgeSweepTimer = setTimeout(() => {
    missingBadgeSweepTimer = null;
    let rows = [];
    try {
      rows = listRunning() || [];
    } catch {
      return;
    }
    for (const row of rows) {
      const dir = String(row?.userDataDir || "").trim();
      if (!dir || row.headless) continue;
      if (lastTaskbarBadgeOkAt(dir)) continue;
      const code = String(row.code || row.label || "").trim();
      if (!code) continue;
      scheduleProfileTaskbarBadgeApply(dir, row.label || code, code, {
        browserPid: Number(row.browserPid) || 0,
        headless: false,
        force: true,
        isReinforce: true,
      });
    }
  }, delayMs);
  if (typeof missingBadgeSweepTimer.unref === "function") missingBadgeSweepTimer.unref();
}

async function applyProfileWindowTitle(context, profile, opts = {}) {
  if (!context) return;
  const label = formatProfileWindowLabel(profile);
  if (!label) return;

  await context.addInitScript(installProfileTitlePrefix, label).catch(() => undefined);

  const pages = typeof context.pages === "function" ? context.pages() : [];
  await Promise.all(
    pages.map((page) =>
      page
        .evaluate(installProfileTitlePrefix, label)
        .catch(() => undefined),
    ),
  );

  // OS taskbar title is applied via scheduleProfileTaskbarBadgeApply after launch
  // (session-manager) — HWND is not ready at first paint.
}

module.exports = {
  formatProfileWindowLabel,
  applyProfileWindowTitle,
  scheduleProfileTaskbarBadgeApply,
  lastTaskbarBadgeOkAt,
  scheduleMissingBadgeSweep,
  BADGE_RECOVER_DELAYS_MS,
  INFLIGHT_STALE_MS,
};
