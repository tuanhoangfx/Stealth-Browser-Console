const { Tray, Menu, nativeImage } = require("electron");
const path = require("node:path");
const { resolveAppIconPathIfExists } = require("./lib/desktop-app-icon.cjs");
const REFRESH_MS = 12000;

function resolveTrayIcon() {
  const rootDir = path.join(__dirname, "..");
  const candidates = [
    path.join(rootDir, "build", "icons", "tray.ico"),
    resolveAppIconPathIfExists(rootDir),
  ].filter(Boolean);
  for (const file of candidates) {
    if (file) {
      const image = nativeImage.createFromPath(file);
      if (!image.isEmpty()) return image;
    }
  }
  return nativeImage.createEmpty();
}

function createSessionTray(sessionManager) {
  let tray = null;
  let timer = null;
  /** @type {{ showConsole?: () => void; requestQuit?: () => void } | null} */
  let handlers = null;

  const refresh = () => {
    if (!tray) return;
    const running = sessionManager.listRunning();
    const count = running.length;
    tray.setToolTip(
      count > 0
        ? `Stealth Browser Console — ${count} profile${count === 1 ? "" : "s"} running`
        : "Stealth Browser Console — no profiles running",
    );

    const items = running.map((row) => ({
      label: `${row.name || row.id} — focus window`,
      click: () => {
        void sessionManager.focusProfile(row.id);
      },
    }));

    if (items.length > 0) {
      items.push({ type: "separator" });
    }
    items.push({
      label: count > 0 ? `Running profiles (${count})` : "No running profiles",
      enabled: false,
    });
    items.push({ type: "separator" });
    items.push({
      label: "Show Console",
      click: () => handlers?.showConsole?.(),
    });
    items.push({
      label: "Quit",
      click: () => handlers?.requestQuit?.(),
    });

    tray.setContextMenu(Menu.buildFromTemplate(items));
  };

  const start = (nextHandlers = {}) => {
    handlers = nextHandlers;
    if (tray) {
      refresh();
      return tray;
    }
    tray = new Tray(resolveTrayIcon());
    tray.setToolTip("Stealth Browser Console");
    tray.on("click", () => {
      handlers?.showConsole?.();
      refresh();
    });
    tray.on("double-click", () => handlers?.showConsole?.());
    refresh();
    timer = setInterval(refresh, REFRESH_MS);
    return tray;
  };

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (tray) {
      tray.destroy();
      tray = null;
    }
    handlers = null;
  };

  return { start, stop, refresh };
}

module.exports = { createSessionTray };
