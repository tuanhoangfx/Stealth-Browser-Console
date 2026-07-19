/**
 * Profile browser window title (taskbar / Alt-Tab label).
 *
 * Perf: one addInitScript registration per context + one evaluate per existing
 * page. No timers, no CDP polls. Title stays prefixed across navigations by
 * patching Document.prototype.title in-page (runs only when the page sets title).
 */
const { extractProfileCode } = require("./profile-identity.cjs");
const {
  applyNativeProfileTaskbarChrome,
  ensureBadgeIco,
} = require("./profile-taskbar-native.cjs");

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
 * @param {import("playwright-core").BrowserContext} context
 * @param {{ name?: string, id?: string }} profile
 * @param {{ userDataDir?: string, browserPid?: number }} [opts]
 * @returns {Promise<void>}
 */
async function applyProfileWindowTitle(context, profile, opts = {}) {
  if (!context) return;
  const label = formatProfileWindowLabel(profile);
  if (!label) return;
  const code = extractProfileCode(profile?.name, profile?.id);

  await context.addInitScript(installProfileTitlePrefix, label).catch(() => undefined);

  const pages = typeof context.pages === "function" ? context.pages() : [];
  await Promise.all(
    pages.map((page) =>
      page
        .evaluate(installProfileTitlePrefix, label)
        .catch(() => undefined),
    ),
  );

  // OS taskbar: Win32 title + digit badge. Fire-and-forget (does not block profile open).
  // Pass browserPid to skip slow WMI; sequential retries (never pile parallel PS).
  const userDataDir = String(opts.userDataDir || "").trim();
  if (userDataDir && process.platform === "win32") {
    let browserPid = Number(opts.browserPid) > 0 ? Number(opts.browserPid) : 0;
    if (!browserPid) {
      try {
        browserPid = context.browser()?.process()?.pid || 0;
      } catch {
        browserPid = 0;
      }
    }

    void (async () => {
      await ensureBadgeIco(code).catch(() => undefined);
      // Absolute-ish early probes; sequential so only one PowerShell at a time.
      const gapsMs = [0, 60, 120, 250, 500, 900];
      for (const gap of gapsMs) {
        if (gap) await new Promise((r) => setTimeout(r, gap));
        try {
          const r = await applyNativeProfileTaskbarChrome(userDataDir, label, code, {
            browserPid,
          });
          if (r?.ok && r.detail === "OK_ICON") return;
        } catch {
          /* retry */
        }
      }
    })();
  }
}

module.exports = {
  formatProfileWindowLabel,
  installProfileTitlePrefix,
  applyProfileWindowTitle,
};
