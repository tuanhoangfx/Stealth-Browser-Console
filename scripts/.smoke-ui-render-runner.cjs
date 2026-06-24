
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const url = process.env.SMOKE_URL;
const outFile = process.env.SMOKE_OUT;

app.commandLine.appendSwitch("disable-gpu");
app.whenReady().then(async () => {
  const logs = [];
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
  });

  win.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    logs.push({ level, message, sourceId, line });
  });
  win.webContents.on("did-fail-load", (_e, code, desc, validatedURL) => {
    logs.push({ level: 3, message: "did-fail-load: " + code + " " + desc + " " + validatedURL });
  });

  let probe = { error: "not-run" };
  try {
    await win.loadURL(url, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 5000));
    probe = await win.webContents.executeJavaScript(`
      (() => {
        const root = document.getElementById("root");
        const boot = document.getElementById("hub-boot-loader");
        const hubApp = document.querySelector(".hub-app, .stealth-hub-app");
        const sidebar = document.querySelector("[class*='hub-sidebar'], .stealth-hub-sidebar, aside.hub-sidebar-shell");
        return {
          rootLen: root ? root.innerHTML.length : -1,
          rootText: root ? root.textContent.trim().slice(0, 300) : "",
          bootPresent: Boolean(boot),
          hubApp: Boolean(hubApp),
          sidebar: Boolean(sidebar),
          hubBootReady: window.__hubBootReady === true,
          href: location.href
        };
      })()
    `);
  } catch (err) {
    probe = { error: err instanceof Error ? err.message : String(err) };
  }

  const errors = logs.filter((l) => {
    if (/Failed to decode downloaded font|OTS parsing error/i.test(l.message)) return false;
    return l.level >= 2 || /error|Error|before initialization|fail/i.test(l.message);
  });
  const ok = Boolean(probe.hubApp && probe.rootLen > 200 && !probe.bootPresent);
  fs.writeFileSync(outFile, JSON.stringify({ url, ok, probe, errors: errors.slice(0, 30) }, null, 2));
  app.exit(ok ? 0 : 1);
});
