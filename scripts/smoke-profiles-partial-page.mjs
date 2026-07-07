/**
 * Headless Electron smoke — Profiles panel-fill partial page: 1 data row + invisible pad rows = pageSize.
 * Usage: node scripts/smoke-profiles-partial-page.mjs [url|dist/index.html]
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
const outFile = path.join(root, ".smoke-profiles-partial-page.json");
const url = resolveSmokeAppUrl(process.argv[2]);
const smokeUrl =
  /^https?:\/\//i.test(url) && !/[?&]stealthSmokePager=/.test(url)
    ? `${url}${url.includes("?") ? "&" : "?"}stealthSmokePager=1`
    : url;
const PROFILE_DIRECTORY_PAGE_SIZE = 20;
const WORKFLOW_PANEL_PAGE_SIZE = 20;
const isLiveDev = /^https?:\/\//i.test(url);

if (isLiveDev) {
  const seed = spawnElectronNode("scripts/lib/seed-smoke-profiles-pager.cjs", [], {
    env: stealthElectronEnv(),
  });
  if (seed.status !== 0) {
    console.error("smoke-profiles-partial-page: seed-smoke-profiles-pager failed");
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
  const pageSize = ${PROFILE_DIRECTORY_PAGE_SIZE};
  const workflowPageSize = ${WORKFLOW_PANEL_PAGE_SIZE};

  const profilesNav = [...document.querySelectorAll("button,a,[role='tab']")].find((el) =>
    /^profiles$/i.test((el.textContent || "").trim()),
  );
  if (profilesNav) profilesNav.click();
  await new Promise((r) => setTimeout(r, 1200));

  const pane = document.querySelector(".stealth-profile-directory-pane");
  const frame = pane?.querySelector(".stealth-profile-directory-frame");
  const table = frame?.querySelector("table.hub-directory-frame-table");
  const paginatedShell = frame?.querySelector(".hub-paginated-table-shell");
  const shellHeight = () => paginatedShell?.getBoundingClientRect().height ?? 0;

  let dataRows = 0;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await new Promise((r) => setTimeout(r, 400));
    dataRows = table?.querySelectorAll("tbody tr:not(.hub-users-row--pad)")?.length ?? 0;
    if (dataRows >= pageSize) break;
  }

  const heightBefore = shellHeight();
  const partialPadAttr = frame?.getAttribute("data-partial-page-pad") || "";
  const panelFillAttr = frame?.getAttribute("data-panel-fill-rows") || "";

  const runStopBtn = document.querySelector(".stealth-profile-directory-frame .hub-directory-icon-cell--hit-expand");
  const runStopIcon = runStopBtn?.querySelector(".hub-directory-icon-cell__icon svg");
  const runBtnRect = runStopBtn?.getBoundingClientRect();
  const runIconRect = runStopIcon?.getBoundingClientRect();
  const runStopHitExpandOk =
    Boolean(runBtnRect && runIconRect) &&
    runBtnRect.width >= runIconRect.width * 2 &&
    runBtnRect.height >= runIconRect.height * 2;

  const profileSearch = pane?.querySelector("input[placeholder*='Search profiles' i], [role='searchbox'][aria-label*='Search profiles' i]");
  let searchDataRows = 0;
  let searchPadRows = 0;
  let searchTotalRows = 0;
  let shellHeightAfter = heightBefore;
  let padBorderTransparent = false;
  let dataBorderVisible = false;

  if (profileSearch && table) {
    const setSearch = (value) => {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      desc?.set?.call(profileSearch, value);
      profileSearch.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setSearch("99020");
    await new Promise((r) => setTimeout(r, 500));
    searchDataRows = table.querySelectorAll("tbody tr:not(.hub-users-row--pad)").length;
    searchPadRows = table.querySelectorAll("tbody tr.hub-users-row--pad").length;
    searchTotalRows = table.querySelectorAll("tbody tr").length;
    shellHeightAfter = shellHeight();
    const padTd = table.querySelector("tbody tr.hub-users-row--pad td");
    const dataTd = table.querySelector("tbody tr:not(.hub-users-row--pad) td");
    const padBorder = padTd ? getComputedStyle(padTd).borderTopColor : "";
    const dataBorder = dataTd ? getComputedStyle(dataTd).borderTopColor : "";
    padBorderTransparent = padBorder === "rgba(0, 0, 0, 0)" || padBorder === "transparent";
    dataBorderVisible = dataBorder !== "rgba(0, 0, 0, 0)" && dataBorder !== "transparent";
    setSearch("");
    await new Promise((r) => setTimeout(r, 200));
  }

  const profilesOk =
    Boolean(frame) &&
    partialPadAttr === "invisible" &&
    panelFillAttr === String(pageSize) &&
    dataRows >= pageSize &&
    runStopHitExpandOk &&
    searchDataRows === 1 &&
    searchPadRows === pageSize - 1 &&
    searchTotalRows === pageSize &&
    Math.abs(shellHeightAfter - heightBefore) <= 4 &&
    padBorderTransparent &&
    dataBorderVisible;

  let workflowPanelOk = true;
  let workflowSearchDataRows = 0;
  let workflowSearchPadRows = 0;
  let workflowPartialPadAttr = "";
  if (${isLiveDev}) {
    const scriptsNav = [...document.querySelectorAll("button,a,[role='tab']")].find((el) =>
      /^scripts$/i.test((el.textContent || "").trim()),
    );
    if (scriptsNav) scriptsNav.click();
    await new Promise((r) => setTimeout(r, 1200));
    const workflowFrame = document.querySelector(".stealth-workflow-directory-frame.hub-directory-frame--panel-fill")
      || document.querySelector(".stealth-workflow-directory-frame");
    workflowPartialPadAttr = workflowFrame?.getAttribute("data-partial-page-pad") || "";
    const workflowTable = workflowFrame?.querySelector("table.stealth-workflow-panel-table");
    const workflowSearch = workflowFrame?.querySelector("input[placeholder*='Search workflows' i], [role='searchbox'][aria-label*='Search workflows' i]");
    if (workflowSearch && workflowTable) {
      const setWorkflowSearch = (value) => {
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
        desc?.set?.call(workflowSearch, value);
        workflowSearch.dispatchEvent(new Event("input", { bubbles: true }));
      };
      setWorkflowSearch("openai");
      await new Promise((r) => setTimeout(r, 500));
      workflowSearchDataRows = workflowTable.querySelectorAll("tbody tr:not(.hub-users-row--pad)").length;
      workflowSearchPadRows = workflowTable.querySelectorAll("tbody tr.hub-users-row--pad").length;
      const workflowTotal = workflowTable.querySelectorAll("tbody tr").length;
      workflowPanelOk =
        workflowPartialPadAttr === "invisible" &&
        workflowSearchDataRows > 0 &&
        workflowSearchDataRows < workflowPageSize &&
        workflowSearchPadRows === workflowPageSize - workflowSearchDataRows &&
        workflowTotal === workflowPageSize;
      setWorkflowSearch("");
    }
  }

  const ok = profilesOk && workflowPanelOk;
  return {
    ok,
    partialPadAttr,
    panelFillAttr,
    dataRows,
    runStopHitExpandOk,
    runBtnWidth: runBtnRect?.width ?? 0,
    runBtnHeight: runBtnRect?.height ?? 0,
    runIconWidth: runIconRect?.width ?? 0,
    runIconHeight: runIconRect?.height ?? 0,
    heightBefore,
    shellHeightAfter,
    searchDataRows,
    searchPadRows,
    searchTotalRows,
    padBorderTransparent,
    dataBorderVisible,
    workflowPanelOk,
    workflowPartialPadAttr,
    workflowSearchDataRows,
    workflowSearchPadRows,
    liveDevWorkflowCheck: ${isLiveDev},
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
  console.error("smoke-profiles-partial-page: no report");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
const ok = Boolean(report.probe?.ok);
console.log(JSON.stringify({ ...report, ok }, null, 2));
if (!ok) {
  console.error("smoke-profiles-partial-page: FAIL");
  process.exit(1);
}
console.log("smoke-profiles-partial-page: PASS");
