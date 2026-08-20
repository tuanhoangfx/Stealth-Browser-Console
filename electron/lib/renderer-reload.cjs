/**
 * Isolated DEV + packaged load `file://dist/index.html`.
 * Chromium Force Reload (Shift+F5 / Ctrl+Shift+R) uses reloadIgnoringCache.
 * Vite marks ES modules `crossorigin`; file:// has no CORS headers → module
 * graph fails and #root stays empty (native menu still shows).
 * Always re-run loadFile / loadURL instead of reloadIgnoringCache.
 */

function isRendererReloadShortcut(input) {
  if (!input || input.type !== "keyDown") return false;
  const key = String(input.key || "").toUpperCase();
  if (key === "F5") return true;
  if (key === "R" && (input.control || input.meta)) return true;
  return false;
}

function bindRendererReloadShortcuts(win, reload) {
  win.webContents.on("before-input-event", (event, input) => {
    if (!isRendererReloadShortcut(input)) return;
    event.preventDefault();
    void reload(win);
  });
}

module.exports = { isRendererReloadShortcut, bindRendererReloadShortcuts };
