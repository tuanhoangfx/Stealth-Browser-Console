/**
 * Headless Electron smoke — capture renderer console + #root content.
 * Usage: node scripts/smoke-ui-render.mjs [url|dist/index.html]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, ".smoke-ui-render.json");
const arg = process.argv[2] || "http://127.0.0.1:5175/";
const url = arg.startsWith("file:") || arg.startsWith("http")
  ? arg
  : `file:///${path.join(root, arg).replace(/\\/g, "/")}`;

function findElectronExe() {
  const cli = path.join(root, "node_modules", "electron", "cli.js");
  if (fs.existsSync(cli)) return { node: process.execPath, args: [cli] };
  throw new Error("electron cli.js not found");
}

const runner = path.join(root, "scripts", ".smoke-ui-render-runner.cjs");
const runnerSrc = `
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
    probe = await win.webContents.executeJavaScript(\`
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
    \`);
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
`;

fs.writeFileSync(runner, runnerSrc);

const { node, args } = findElectronExe();
const result = spawnSync(node, [...args, runner], {
  cwd: root,
  env: { ...process.env, SMOKE_URL: url, SMOKE_OUT: outFile },
  encoding: "utf8"
});

if (fs.existsSync(outFile)) {
  const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
  console.log("smoke-ui-render: PASS");
} else {
  console.error("smoke-ui-render: no report", result.stdout, result.stderr);
  process.exit(result.status ?? 1);
}
