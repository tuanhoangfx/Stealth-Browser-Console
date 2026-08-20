/** Reload renderer when dist/ changes — no Vite dev server (STEALTH_DIST_WATCH=1). */
const fs = require("node:fs");
const path = require("node:path");

/** Vite `emptyOutDir` writes many assets; only index.html means the graph is complete. */
function isDistWatchName(name) {
  return /(?:^|[\\/])index\.html$/i.test(String(name || ""));
}

function bindDistUiWatch({ distDir, onReload, debounceMs = 800 }) {
  if (String(process.env.STEALTH_DIST_WATCH || "") !== "1") {
    return () => {};
  }
  if (!fs.existsSync(distDir)) {
    console.warn("[dist-watch] missing dist — run vite build first");
    return () => {};
  }

  let debounce = null;
  let lastStamp = 0;
  const trigger = (reason) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const indexPath = path.join(distDir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      const stamp = fs.statSync(indexPath).mtimeMs;
      if (stamp <= lastStamp) return;
      lastStamp = stamp;
      console.log(`[dist-watch] reload (${reason})`);
      onReload();
    }, debounceMs);
  };

  const watchers = [];
  const watchPath = (target, label) => {
    try {
      const w = fs.watch(target, { recursive: true }, (_event, name) => {
        if (isDistWatchName(name)) trigger(label);
      });
      watchers.push(w);
    } catch {
      /* ignore */
    }
  };

  watchPath(distDir, "dist");

  return () => {
    clearTimeout(debounce);
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
  };
}

module.exports = { bindDistUiWatch, isDistWatchName };
