
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");

const url = process.env.SMOKE_URL;
const outFile = process.env.SMOKE_OUT;
const runnerPath = path.join(__dirname, "lib", "smoke-electron-runner.cjs");

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForHubReady(win, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await win.webContents.executeJavaScript(`
      (() => {
        const root = document.getElementById("root");
        const boot = document.getElementById("hub-boot-loader");
        const hubApp = document.querySelector(".hub-app, .stealth-hub-app");
        return {
          ready: Boolean(hubApp && root && root.innerHTML.length > 200 && !boot),
          chunkError: /Failed to fetch dynamically imported module/i.test(document.body?.innerText || ""),
        };
      })()
    `);
    if (state.ready) return state;
    if (state.chunkError) return { reload: true };
    await sleep(800);
  }
  return { ready: false, timeout: true };
}

async function loadWithRetry(win, targetUrl, attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await sleep(1500 * i);
    await win.loadURL(targetUrl, { timeout: 45000 });
    const state = await waitForHubReady(win);
    if (state.ready) return state;
    if (!state.reload && i === attempts - 1) throw new Error("hub shell not ready");
  }
  throw new Error("hub shell not ready after retries");
}

app.commandLine.appendSwitch("disable-gpu");
app.whenReady().then(async () => {
  const logs = [];
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: false },
  });
  win.webContents.on("console-message", (_e, level, message) => logs.push({ level, message: String(message) }));

  let probe = {};
  try {
    await loadWithRetry(win, url);
    await sleep(1500);
    probe = await win.webContents.executeJavaScript(process.env.SMOKE_PROBE);
  } catch (err) {
    probe = { error: err instanceof Error ? err.message : String(err) };
  }

  const depthErrors = logs.filter((l) => /Maximum update depth exceeded/i.test(l.message));
  const ok = depthErrors.length === 0;
  fs.writeFileSync(outFile, JSON.stringify({ url, ok, probe, depthErrorCount: depthErrors.length, errors: logs.filter((l) => l.level >= 2).slice(0, 15) }, null, 2));
  app.exit(ok ? 0 : 1);
});
