/**
 * Headless smoke — Workflow tab must load without React update-depth errors.
 * Usage: node scripts/smoke-workflow-tab-console.mjs [url|dist/index.html]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSmokeAppUrl, smokeProjectRoot } from "./lib/smoke-electron-url.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = smokeProjectRoot;
const outFile = path.join(root, ".smoke-workflow-tab.json");
const url = resolveSmokeAppUrl(process.argv[2]);

function findElectronCli() {
  const cli = path.join(root, "node_modules", "electron", "cli.js");
  if (fs.existsSync(cli)) return { node: process.execPath, args: [cli] };
  throw new Error("electron cli.js not found");
}

const probeScript = `
(async () => {
  const workflowNav = [...document.querySelectorAll("button,a,[role='tab']")].find((el) =>
    /^workflow$/i.test((el.textContent || "").trim()),
  );
  if (workflowNav) workflowNav.click();
  await new Promise((r) => setTimeout(r, 4000));
  const depthProbe = { clickedWorkflow: Boolean(workflowNav), builderPresent: Boolean(document.querySelector(".script-builder")) };
  return depthProbe;
})()
`.trim();

const runner = path.join(root, "scripts", ".smoke-workflow-tab-runner.cjs");
const runnerSrc = `
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
    const state = await win.webContents.executeJavaScript(\`
      (() => {
        const root = document.getElementById("root");
        const boot = document.getElementById("hub-boot-loader");
        const hubApp = document.querySelector(".hub-app, .stealth-hub-app");
        return {
          ready: Boolean(hubApp && root && root.innerHTML.length > 200 && !boot),
          chunkError: /Failed to fetch dynamically imported module/i.test(document.body?.innerText || ""),
        };
      })()
    \`);
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
`;

fs.writeFileSync(runner, runnerSrc);

const { node, args } = findElectronCli();
spawnSync(node, [...args, runner], {
  cwd: root,
  env: { ...process.env, SMOKE_URL: url, SMOKE_OUT: outFile, SMOKE_PROBE: probeScript },
  stdio: "inherit",
});

if (!fs.existsSync(outFile)) {
  console.error("smoke-workflow-tab-console: no report");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error("smoke-workflow-tab-console: FAIL");
  process.exit(1);
}
console.log("smoke-workflow-tab-console: PASS");
