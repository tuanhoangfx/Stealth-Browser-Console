/**
 * Headless Electron smoke — workflow rail renders rows (fixedRows=5) without page-size dropdown.
 * Usage: node scripts/smoke-workflow-rail.mjs [url|dist/index.html]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSmokeAppUrl, smokeProjectRoot } from "./lib/smoke-electron-url.mjs";
import { stealthElectronEnv } from "./lib/stealth-electron-env.mjs";
import { spawnElectronNode } from "./lib/spawn-electron-node.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = smokeProjectRoot;
const outFile = path.join(root, ".smoke-workflow-rail.json");
const url = resolveSmokeAppUrl(process.argv[2]);
const smokeUrl =
  /^https?:\/\//i.test(url) && !/[?&]stealthSmokePager=/.test(url)
    ? `${url}${url.includes("?") ? "&" : "?"}stealthSmokePager=1`
    : url;
const WORKFLOW_RAIL_PAGE_SIZE = 5;
/** Hub-UI DEFAULT_TABLE_PAGE_SIZE — keep in sync with src/app/constants.ts */
const PROFILE_DIRECTORY_PAGE_SIZE = 20;
const isLiveDev = /^https?:\/\//i.test(url);

if (isLiveDev) {
  const seed = spawnElectronNode("scripts/lib/seed-smoke-profiles-pager.cjs", [], {
    env: stealthElectronEnv(),
  });
  if (seed.status !== 0) {
    console.error("smoke-workflow-rail: seed-smoke-profiles-pager failed");
    process.exit(1);
  }
}

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
  await new Promise((r) => setTimeout(r, 1500));

  let profilesPane = null;
  let profilesTable = null;
  let profilesPager = null;
  let profilesPagerText = "";
  let profilesRowCount = 0;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await new Promise((r) => setTimeout(r, 400));
    profilesPane = document.querySelector(".stealth-profile-directory-pane");
    profilesTable = profilesPane?.querySelector("table.hub-directory-frame-table") || null;
    profilesPager = profilesPane?.querySelector(".hub-table-pager") || null;
    profilesPagerText = profilesPager?.textContent?.trim() || "";
    profilesRowCount = profilesTable?.querySelectorAll("tbody tr")?.length || 0;
    const fullPage = profilesRowCount >= ${PROFILE_DIRECTORY_PAGE_SIZE};
    if (profilesRowCount > 0 && (profilesPager || !fullPage || attempt >= 12)) break;
  }

  const profilesCatalogMatch = profilesPagerText.match(/Showing\\s+\\d+-\\d+\\s+of\\s+(\\d+)/i);
  const profilesCatalogTotal = profilesCatalogMatch
    ? Number(profilesCatalogMatch[1])
    : profilesRowCount;
  const profilesPagerVisible =
    Boolean(profilesPager) &&
    /Page\\s+\\d+\\s+of\\s+\\d+/i.test(profilesPagerText) &&
    /Showing\\s+\\d+-\\d+\\s+of\\s+\\d+/i.test(profilesPagerText);
  const profilesPagerRequired = ${isLiveDev}
    ? profilesRowCount >= ${PROFILE_DIRECTORY_PAGE_SIZE} || profilesCatalogTotal > ${PROFILE_DIRECTORY_PAGE_SIZE}
    : profilesCatalogTotal > ${PROFILE_DIRECTORY_PAGE_SIZE};
  const profilesPagerOk = !profilesPagerRequired || profilesPagerVisible;
  const profilesDirectoryOk =
    Boolean(profilesPane) &&
    Boolean(profilesTable) &&
    profilesRowCount > 0 &&
    profilesPagerOk;
  const workflowCanvasAbsent = !document.querySelector(".workflow-script-flow");

  let workflowCanvasOk = true;
  let workflowBuilderPresent = false;
  let workflowCanvasPresent = false;
  if (${isLiveDev}) {
    const workflowNav = [...document.querySelectorAll("button,a,[role='tab']")].find((el) =>
      /^workflow$/i.test((el.textContent || "").trim()),
    );
    if (workflowNav) workflowNav.click();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((r) => setTimeout(r, 500));
      workflowBuilderPresent = Boolean(document.querySelector(".script-builder"));
      workflowCanvasPresent = Boolean(document.querySelector(".workflow-script-flow"));
      if (workflowBuilderPresent && workflowCanvasPresent) break;
    }
    const needsWorkflowCanvas = Boolean(workflowNav) && workflowBuilderPresent;
    workflowCanvasOk = !needsWorkflowCanvas || workflowCanvasPresent;
  }

  const pageSize = ${WORKFLOW_RAIL_PAGE_SIZE};
  const rail = document.querySelector(".stealth-workflow-rail");
  const boot = document.getElementById("hub-boot-loader");
  const scope = rail || document;
  const workflowSearch = [...scope.querySelectorAll("input,textarea,[role='searchbox']")].find((el) =>
    /search workflows/i.test(el.getAttribute("placeholder") || el.getAttribute("aria-label") || ""),
  );
  const workflowTable =
    scope.querySelector(".stealth-workflow-rail-table") ||
    [...scope.querySelectorAll("table")].find((el) => /wf\\d+/i.test(el.textContent || ""));
  const historyHeading = [...scope.querySelectorAll("h1,h2,h3,[role='heading']")].find((el) =>
    /run history/i.test(el.textContent || ""),
  );
  const consoleHeading = [...scope.querySelectorAll("h1,h2,h3,[role='heading']")].find((el) =>
    /^console$/i.test((el.textContent || "").trim()),
  );
  const rows = [...(workflowTable?.querySelectorAll("tbody tr") || [])].filter(
    (tr) => !tr.classList.contains("hub-users-row--pad"),
  );
  const rowCount = rows.length;
  const paginatedShell = rail?.querySelector(".hub-paginated-table-shell");
  const shellHeight = () => paginatedShell?.getBoundingClientRect().height ?? 0;
  const pagerHeight = () => rail?.querySelector(".hub-table-pager")?.getBoundingClientRect().height ?? 0;
  const heightBefore = shellHeight();
  const pagerBefore = pagerHeight();
  let searchStable = true;
  let searchFilteredRows = rowCount;
  let searchPadRows = 0;
  let searchTbodyRows = rowCount;
  let shellHeightAfter = heightBefore;
  let pagerHeightAfter = pagerBefore;
  if (workflowSearch && paginatedShell) {
    const setSearch = (value) => {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      desc?.set?.call(workflowSearch, value);
      workflowSearch.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setSearch("openai");
    await new Promise((r) => setTimeout(r, 400));
    searchFilteredRows = [...(workflowTable?.querySelectorAll("tbody tr") || [])].filter(
      (tr) => !tr.classList.contains("hub-users-row--pad"),
    ).length;
    searchPadRows = workflowTable?.querySelectorAll("tbody tr.hub-users-row--pad").length ?? 0;
    searchTbodyRows = workflowTable?.querySelectorAll("tbody tr").length ?? 0;
    shellHeightAfter = shellHeight();
    pagerHeightAfter = pagerHeight();
    searchStable =
      Math.abs(shellHeightAfter - heightBefore) <= 3 &&
      Math.abs(pagerHeightAfter - pagerBefore) <= 2 &&
      searchTbodyRows === pageSize;
    setSearch("");
    await new Promise((r) => setTimeout(r, 200));
  }
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
    !tableOverlapsHistory &&
    searchStable &&
    profilesDirectoryOk &&
    workflowCanvasAbsent &&
    workflowCanvasOk;
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
    searchStable,
    searchFilteredRows,
    searchPadRows,
    searchTbodyRows,
    shellHeightBefore: heightBefore,
    shellHeightAfter,
    pagerHeightBefore: pagerBefore,
    pagerHeightAfter,
    bootPresent: Boolean(boot),
    profilesDirectoryOk,
    profilesPagerVisible,
    profilesPagerRequired,
    profilesPagerOk,
    profilesPagerText,
    profilesRowCount,
    profilesCatalogTotal,
    workflowCanvasAbsent,
    workflowBuilderPresent,
    workflowCanvasPresent,
    workflowCanvasOk,
    liveDevCanvasCheck: ${isLiveDev},
  };
})()
`.trim();

const { node, args } = findElectronCli();
spawnSync(node, [...args, path.join(root, "scripts", "lib", "smoke-electron-runner.cjs")], {
  cwd: root,
  env: {
    ...process.env,
    SMOKE_URL: smokeUrl,
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
