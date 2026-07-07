/** Reload renderer when dist/ changes — no Vite dev server (STEALTH_DIST_WATCH=1). */
const fs = require("node:fs");
const path = require("node:path");

function bindDistUiWatch({ distDir, onReload }) {
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
    }, 250);
  };

  const watchers = [];
  const watchPath = (target, label) => {
    try {
      const w = fs.watch(target, { recursive: true }, (_event, name) => {
        if (!name || /index\.html$|\.(js|css|svg|woff2?)$/i.test(String(name))) {
          trigger(label);
        }
      });
      watchers.push(w);
    } catch {
      /* ignore */
    }
  };

  watchPath(distDir, "dist");
  watchPath(path.join(distDir, "assets"), "assets");

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

module.exports = { bindDistUiWatch };
