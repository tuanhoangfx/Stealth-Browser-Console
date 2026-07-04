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
(async () => {
  const profilesNav = [...document.querySelectorAll("button,a,[role='tab']")].find((el) =>
    /^profiles$/i.test((el.textContent || "").trim()),
  );
  if (profilesNav) profilesNav.click();
  await new Promise((r) => setTimeout(r, 2000));
  const pageSize = ${WORKFLOW_RAIL_PAGE_SIZE};
  const rail = document.querySelector(".stealth-workflow-rail");
  const boot = document.getElementById("hub-boot-loader");
  const scope = rail || document;
  const workflowSearch = [...scope.querySelectorAll("input,textarea,[role='searchbox']")].find((el) =>
    /search workflows/i.test(el.getAttribute("placeholder") || el.getAttribute("aria-label") || ""),
  );
  const workflowTable =
    scope.querySelector(".stealth-workflow-rail-table") ||
    [...scope.querySelectorAll("table")].find((el) => /wf\d+/i.test(el.textContent || ""));
  const historyHeading = [...scope.querySelectorAll("h1,h2,h3,[role='heading']")].find((el) =>
    /run history/i.test(el.textContent || ""),
  );
  const consoleHeading = [...scope.querySelectorAll("h1,h2,h3,[role='heading']")].find((el) =>
    /^console$/i.test((el.textContent || "").trim()),
  );
  const rows = workflowTable?.querySelectorAll("tbody tr") || [];
  const rowCount = rows.length;
  const pageSizeBtn = [...scope.querySelectorAll("button")].find((b) =>
    /\\d+\\s*rows/i.test(b.textContent || ""),
  );
  const quickRunBtn = [...scope.querySelectorAll("button")].find((b) =>
    /quick run/i.test(b.textContent || ""),
  );
  const table = workflowTable;
  const history = scope.querySelector(".stealth-runtime-history");
  let tableOverlapsHistory = false;
  if (table && history) {
    const tr = table.getBoundingClientRect();
    const hr = history.getBoundingClientRect();
    tableOverlapsHistory = tr.bottom > hr.top + 2;
  }
  const pagerText = rail?.querySelector(".hub-table-pager")?.textContent?.trim() || "";
  const totalMatch = pagerText.match(/Showing\\s+\\d+-\\d+\\s+of\\s+(\\d+)/i);
  const catalogTotal = totalMatch ? Number(totalMatch[1]) : rowCount;
  const expectedRows = Math.min(pageSize, Math.max(catalogTotal, rowCount));
  const ok =
    !boot &&
    Boolean(workflowSearch) &&
    Boolean(historyHeading) &&
    Boolean(consoleHeading) &&
    Boolean(workflowTable) &&
    rowCount > 0 &&
    rowCount === expectedRows &&
    !pageSizeBtn &&
    !quickRunBtn &&
    !tableOverlapsHistory;
  return {
    ok,
    clickedProfiles: Boolean(profilesNav),
    railPresent: Boolean(rail),
    workflowSearchPresent: Boolean(workflowSearch),
    workflowTablePresent: Boolean(workflowTable),
    historyHeadingPresent: Boolean(historyHeading),
    consoleHeadingPresent: Boolean(consoleHeading),
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
