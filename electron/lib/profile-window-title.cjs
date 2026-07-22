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
 * @type {Map<string, { gen: number, digits: string, inFlight: boolean, okAt: number, browserPid: number }>}
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

/**
 * Fire-and-forget Win32 taskbar badge — target OK_ICON within ~3s when ICO cached.
 * Same-code in-flight / recent OK is not cancelled by a second schedule (post-nav).
 * Chromium resets WM_SETICON on title/nav — reinforce passes re-apply after OK.
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

  if (!force && prev?.digits === digits) {
    if (browserPid > 0) prev.browserPid = browserPid;
    if (prev.inFlight) return;
    // Allow soft re-apply after 8s — Chrome often wipes icon on first navigations.
    if (prev.okAt && Date.now() - prev.okAt < 8_000) return;
  }

  const gen = (prev?.gen || 0) + 1;
  badgeApplyState.set(dir, {
    gen,
    digits,
    inFlight: true,
    okAt: prev?.okAt || 0,
    browserPid,
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

    let resolvedPid = readTaskbarHintPid(dir, state()?.browserPid || browserPid);
    if (!resolvedPid) {
      resolvedPid = await waitForTaskbarHintPid(dir, state()?.browserPid || browserPid, {
        timeoutMs: 4000,
        intervalMs: 40,
      });
    }
    if (state()?.gen !== gen) return;

    try {
      const r = await applyNativeProfileTaskbarChromeWithRetry(dir, title, digits, {
        browserPid: resolvedPid || state()?.browserPid || browserPid,
        pidWaitMs: 1000,
        focusRetry: !isReinforce,
        icoWarm,
        retryDelaysMs: isReinforce
          ? [0, 400, 1200]
          : [0, 250, 600, 1200, 2500, 5000, 10_000],
      });
      if (state()?.gen !== gen) return;
      if (r?.ok && r.detail === "OK_ICON") {
        const cur = state();
        if (cur && cur.gen === gen) {
          cur.inFlight = false;
          cur.okAt = Date.now();
        }
        console.log(
          "[taskbar-badge] OK_ICON",
          path.basename(dir),
          `${Date.now() - t0}ms`,
          r.via || "",
          isReinforce ? "reinforce" : "open",
        );
        // Chromium wipes custom icons after title/nav — re-stamp a few times.
        if (!isReinforce) {
          for (const ms of [1500, 4000, 9000]) {
            setTimeout(() => {
              scheduleProfileTaskbarBadgeApply(dir, title, digits, {
                browserPid: readTaskbarHintPid(dir, resolvedPid || browserPid) || resolvedPid || browserPid,
                force: true,
                isReinforce: true,
                headless: opts.headless,
              });
            }, ms);
          }
        }
        return;
      }
      const cur = state();
      if (cur && cur.gen === gen) cur.inFlight = false;
      console.warn(
        "[taskbar-badge] apply incomplete",
        path.basename(dir),
        r?.reason || r?.detail || "unknown",
        `${Date.now() - t0}ms`,
      );
    } catch (error) {
      const cur = state();
      if (cur && cur.gen === gen) cur.inFlight = false;
      console.warn(
        "[taskbar-badge] apply error",
        path.basename(dir),
        error instanceof Error ? error.message : error,
      );
    }
  })();
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
};
