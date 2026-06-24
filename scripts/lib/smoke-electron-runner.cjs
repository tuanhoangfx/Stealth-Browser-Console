/**
 * Shared headless Electron runner — wait for hub shell, retry load on chunk/HMR failures.
 * Used by smoke-workflow-rail / smoke-workflow-tab-console / smoke-ui-render.
 */
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const url = process.env.SMOKE_URL;
const outFile = process.env.SMOKE_OUT;
const probeScript = process.env.SMOKE_PROBE || "(() => ({ ok: true }))";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHubReady(win, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await win.webContents.executeJavaScript(`
      (() => {
        const root = document.getElementById("root");
        const boot = document.getElementById("hub-boot-loader");
        const hubApp = document.querySelector(".hub-app, .stealth-hub-app");
        const chunkError = [...document.querySelectorAll("[class*='error'], pre, p")].some((el) =>
          /Failed to fetch dynamically imported module|View load error/i.test(el.textContent || ""),
        );
        return {
          ready: Boolean(hubApp && root && root.innerHTML.length > 200 && !boot),
          hubApp: Boolean(hubApp),
          rootLen: root ? root.innerHTML.length : 0,
          bootPresent: Boolean(boot),
          chunkError,
        };
      })()
    `);
    if (state.ready) return state;
    if (state.chunkError) return { ...state, reload: true };
    await sleep(800);
  }
  return { ready: false, timeout: true };
}

async function loadWithRetry(win, targetUrl, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      if (i > 0) await sleep(1500 * i);
      await win.loadURL(targetUrl, { timeout: 45_000 });
      const state = await waitForHubReady(win);
      if (state.ready) return state;
      if (state.reload && i < attempts - 1) continue;
      if (state.timeout) lastErr = new Error("hub shell not ready before timeout");
      else return state;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("hub shell not ready");
}

app.commandLine.appendSwitch("disable-gpu");
app.whenReady().then(async () => {
  const logs = [];
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.webContents.on("console-message", (_e, level, message) => {
    logs.push({ level, message: String(message) });
  });
  win.webContents.on("did-fail-load", (_e, code, desc, validatedURL) => {
    logs.push({ level: 3, message: `did-fail-load: ${code} ${desc} ${validatedURL}` });
  });

  let probe = { error: "not-run" };
  let hubState = {};
  try {
    hubState = await loadWithRetry(win, url);
    await sleep(2000);
    probe = await win.webContents.executeJavaScript(probeScript);
  } catch (err) {
    probe = { ok: false, error: err instanceof Error ? err.message : String(err), hubState };
  }

  const errors = logs.filter((l) => {
    if (/Failed to decode downloaded font|OTS parsing error|Electron Security Warning/i.test(l.message)) {
      return false;
    }
    return l.level >= 2 || /error|Error|fail/i.test(l.message);
  });

  const ok = Boolean(probe.ok !== false && !probe.error);
  fs.writeFileSync(
    outFile,
    JSON.stringify({ url, ok, hubState, probe, errors: errors.slice(0, 25) }, null, 2),
  );
  app.exit(ok ? 0 : 1);
});
