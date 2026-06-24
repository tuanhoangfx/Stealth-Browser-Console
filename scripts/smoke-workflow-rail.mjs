/**
 * Headless Electron smoke — workflow rail renders rows (fixedRows=5) without page-size dropdown.
 * Usage: node scripts/smoke-workflow-rail.mjs [url|dist/index.html]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSmokeAppUrl, smokeProjectRoot } from "./lib/smoke-electron-url.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = smokeProjectRoot;
const outFile = path.join(root, ".smoke-workflow-rail.json");
const url = resolveSmokeAppUrl(process.argv[2]);
const WORKFLOW_RAIL_PAGE_SIZE = 5;

function findElectronCli() {
  const cli = path.join(root, "node_modules", "electron", "cli.js");
  if (fs.existsSync(cli)) return { node: process.execPath, args: [cli] };
  throw new Error("electron cli.js not found");
}

const probeScript = `
(() => {
  const pageSize = ${WORKFLOW_RAIL_PAGE_SIZE};
  const rail = document.querySelector(".stealth-workflow-rail");
  const boot = document.getElementById("hub-boot-loader");
  if (!rail) {
    return { ok: false, reason: "missing-rail", bootPresent: Boolean(boot) };
  }
  const rows = rail.querySelectorAll(".stealth-workflow-rail-table tbody tr");
  const rowCount = rows.length;
  const pageSizeBtn = [...rail.querySelectorAll("button")].find((b) =>
    /\\d+\\s*rows/i.test(b.textContent || ""),
  );
  const quickRunBtn = [...rail.querySelectorAll("button")].find((b) =>
    /quick run/i.test(b.textContent || ""),
  );
  const table = rail.querySelector(".stealth-workflow-rail-table");
  const history = rail.querySelector(".stealth-runtime-history");
  let tableOverlapsHistory = false;
  if (table && history) {
    const tr = table.getBoundingClientRect();
    const hr = history.getBoundingClientRect();
    tableOverlapsHistory = tr.bottom > hr.top + 2;
  }
  const pagerText = rail.querySelector(".hub-table-pager")?.textContent?.trim() || "";
  const totalMatch = pagerText.match(/Showing\\s+\\d+-\\d+\\s+of\\s+(\\d+)/i);
  const catalogTotal = totalMatch ? Number(totalMatch[1]) : rowCount;
  const expectedRows = Math.min(pageSize, Math.max(catalogTotal, rowCount));
  const ok =
    !boot &&
    rowCount > 0 &&
    rowCount === expectedRows &&
    !pageSizeBtn &&
    !quickRunBtn &&
    !tableOverlapsHistory;
  return {
    ok,
    rowCount,
    expectedRows,
    catalogTotal,
    pagerText,
    pageSizeBtnText: pageSizeBtn?.textContent || null,
    quickRunAbsent: !quickRunBtn,
    tableOverlapsHistory,
    bootPresent: Boolean(boot),
  };
})()
`.trim();

const { node, args } = findElectronCli();
spawnSync(node, [...args, path.join(root, "scripts", "lib", "smoke-electron-runner.cjs")], {
  cwd: root,
  env: {
    ...process.env,
    SMOKE_URL: url,
    SMOKE_OUT: outFile,
    SMOKE_PROBE: probeScript,
  },
  stdio: "inherit",
});

if (!fs.existsSync(outFile)) {
  console.error("smoke-workflow-rail: no report");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
const ok = Boolean(report.probe?.ok);
console.log(JSON.stringify({ ...report, ok }, null, 2));
if (!ok) {
  console.error("smoke-workflow-rail: FAIL");
  process.exit(1);
}
console.log("smoke-workflow-rail: PASS");
