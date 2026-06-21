/**
 * Headless Electron smoke — workflow rail renders rows (fixedRows=5) without page-size dropdown.
 * Usage: node scripts/smoke-workflow-rail.mjs [url]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outFile = path.join(root, ".smoke-workflow-rail.json");
const url = process.argv[2] || "http://127.0.0.1:5175/";
const WORKFLOW_RAIL_PAGE_SIZE = 5;

function findElectronCli() {
  const cli = path.join(root, "node_modules", "electron", "cli.js");
  if (fs.existsSync(cli)) return { node: process.execPath, args: [cli] };
  throw new Error("electron cli.js not found");
}

const runner = path.join(root, "scripts", ".smoke-workflow-rail-runner.cjs");
const runnerSrc = `
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

const url = process.env.SMOKE_URL;
const outFile = process.env.SMOKE_OUT;
const railPageSize = ${WORKFLOW_RAIL_PAGE_SIZE};

app.commandLine.appendSwitch("disable-gpu");
app.whenReady().then(async () => {
  const logs = [];
  const win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  win.webContents.on("console-message", (_e, level, message) => {
    logs.push({ level, message });
  });

  let probe = { error: "not-run" };
  try {
    await win.loadURL(url, { timeout: 30000 });
    await new Promise((r) => setTimeout(r, 6000));
    probe = await win.webContents.executeJavaScript(\`
      (() => {
        const pageSize = \${railPageSize};
        const rail = document.querySelector(".stealth-workflow-rail");
        const boot = document.getElementById("hub-boot-loader");
        if (!rail) {
          return { ok: false, reason: "missing-rail", bootPresent: Boolean(boot) };
        }
        const rows = rail.querySelectorAll(".stealth-workflow-rail-table tbody tr");
        const rowCount = rows.length;
        const pageSizeBtn = [...rail.querySelectorAll("button")].find((b) =>
          /\\\\d+\\\\s*rows/i.test(b.textContent || ""),
        );
        const pagerText = rail.querySelector(".hub-table-pager")?.textContent?.trim() || "";
        const totalMatch = pagerText.match(/Showing\\s+\\d+-\\d+\\s+of\\s+(\\d+)/i);
        const catalogTotal = totalMatch ? Number(totalMatch[1]) : rowCount;
        const expectedRows = Math.min(pageSize, Math.max(catalogTotal, rowCount));
        const ok =
          !boot &&
          rowCount > 0 &&
          rowCount === expectedRows &&
          !pageSizeBtn;
        return {
          ok,
          rowCount,
          expectedRows,
          catalogTotal,
          pagerText,
          pageSizeBtnText: pageSizeBtn?.textContent || null,
          bootPresent: Boolean(boot),
        };
      })()
    \`);
  } catch (err) {
    probe = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const errors = logs.filter((l) => l.level >= 2 || /error|Error|fail/i.test(l.message));
  const ok = Boolean(probe.ok);
  fs.writeFileSync(outFile, JSON.stringify({ url, ok, probe, errors: errors.slice(0, 20) }, null, 2));
  app.exit(ok ? 0 : 1);
});
`;

fs.writeFileSync(runner, runnerSrc);

const { node, args } = findElectronCli();
spawnSync(node, [...args, runner], {
  cwd: root,
  env: {
    ...process.env,
    SMOKE_URL: url,
    SMOKE_OUT: outFile,
  },
  stdio: "inherit",
});

if (!fs.existsSync(outFile)) {
  console.error("smoke-workflow-rail: no report");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error("smoke-workflow-rail: FAIL");
  process.exit(1);
}
console.log("smoke-workflow-rail: PASS");
