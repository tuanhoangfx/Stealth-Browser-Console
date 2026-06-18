const { Tray, Menu, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { buildTaskbarLabel } = require("./lib/profile-identity.cjs");

const REFRESH_MS = 12000;

function resolveTrayIcon() {
  const candidates = [
    path.join(__dirname, "..", "build", "icons", "tray.ico"),
    path.join(__dirname, "..", "build", "icons", "app.ico")
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      const image = nativeImage.createFromPath(file);
      if (!image.isEmpty()) return image;
    }
  }
  return nativeImage.createEmpty();
}

function createSessionTray(sessionManager) {
  let tray = null;
  let timer = null;

  const refresh = () => {
    if (!tray) return;
    const running = sessionManager.listRunning();
    const count = running.length;
    tray.setToolTip(
      count > 0
        ? `Stealth Browser Console — ${count} profile${count === 1 ? "" : "s"} running`
        : "Stealth Browser Console — no profiles running"
    );

    const items = running.map((row) => ({
      label: `${buildTaskbarLabel({ id: row.id, name: row.name })} — focus window`,
      click: () => {
        void sessionManager.focusProfile(row.id);
      }
    }));

    if (items.length > 0) {
      items.push({ type: "separator" });
    }
    items.push({
      label: count > 0 ? `Running profiles (${count})` : "No running profiles",
      enabled: false
    });

    tray.setContextMenu(Menu.buildFromTemplate(items));
  };

  const start = () => {
    if (tray) return tray;
    tray = new Tray(resolveTrayIcon());
    tray.setToolTip("Stealth Browser Console");
    tray.on("click", refresh);
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
  };

  return { start, stop, refresh };
}

module.exports = { createSessionTray };
