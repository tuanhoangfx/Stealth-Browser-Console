/**
 * Static smoke — Profiles directory must compile-load without missing symbols / duplicate colClass.
 * Run: node scripts/smoke-profiles-directory.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => {
  console.error(`smoke-profiles-directory: FAIL — ${msg}`);
  process.exit(1);
};

const profilesView = fs.readFileSync(path.join(root, "src/views/ProfilesView.tsx"), "utf8");
if (!profilesView.includes('from "../lib/profile-display-prefs-migrate"')) {
  fail("ProfilesView missing migrateProfilesDisplayPrefsFromUrl import");
}
if (!profilesView.includes("migrateProfilesDisplayPrefsFromUrl()")) {
  fail("ProfilesView does not call migrateProfilesDisplayPrefsFromUrl");
}
if (!profilesView.includes("useProfileExtensionToggle")) {
  fail("ProfilesView missing useProfileExtensionToggle");
}

const metaSrc = fs.readFileSync(path.join(root, "src/lib/directory-column-meta.ts"), "utf8");
const colClassRe = /col\("[^"]+",\s*"(hub-users-col--[^"]+)"/g;
const classes = [];
let m;
while ((m = colClassRe.exec(metaSrc))) {
  if (metaSrc.slice(Math.max(0, m.index - 80), m.index).includes("STEALTH_PROFILE_COLUMN_META")) {
    // fall through — simpler: collect only within STEALTH_PROFILE_COLUMN_META block
  }
  classes.push(m[1]);
}

const profileBlock = metaSrc.match(
  /export const STEALTH_PROFILE_COLUMN_META = applyStandardDirectoryColumnHints\(\{([\s\S]*?)\n\}\);/,
);
if (!profileBlock) fail("STEALTH_PROFILE_COLUMN_META not found");
const profileClasses = [...profileBlock[1].matchAll(/"(hub-users-col--[^"]+)"/g)].map((x) => x[1]);
const seen = new Set();
for (const c of profileClasses) {
  if (seen.has(c)) fail(`duplicate colClass ${c}`);
  seen.add(c);
}
if (!profileClasses.includes("hub-users-col--metric-a")) fail("E0001 colClass missing");
if (!profileClasses.includes("hub-users-col--metric-b")) fail("Surfshark colClass missing");
if (!profileClasses.includes("hub-users-col--metric-c")) fail("Proxy colClass missing");

const cells = fs.readFileSync(path.join(root, "src/features/profiles/stealth-profile-directory-cells.tsx"), "utf8");
if (!cells.includes("HUB_DIRECTORY_ICON_CELL_HIT_EXPAND_CLASS")) {
  fail("profiles Run/Stop must use hub-ui HUB_DIRECTORY_ICON_CELL_HIT_EXPAND_CLASS");
}
if (!cells.includes('case "e0001"') || !cells.includes('case "surfshark"')) {
  fail("directory cells missing e0001/surfshark cases");
}
if (cells.includes("hub-checkbox") && cells.includes('case "e0001"')) {
  fail("extension cells must be read-only indicators, not hub-checkbox");
}
if (!cells.includes("HubUsersOnOffLabel")) {
  fail("extension cells must use HubUsersOnOffLabel for e0001/surfshark");
}

const bulk = fs.readFileSync(
  path.join(root, "src/features/profiles/StealthProfilesDirectoryBulkActions.tsx"),
  "utf8",
);
for (const label of ["Extension", "Cookie Bridge", "Surfshark VPN"]) {
  if (!bulk.includes(label)) fail(`bulk actions missing "${label}"`);
}
if (!bulk.includes("selectedCount={selectedCount}") && !bulk.includes("HubBulkActionCountBadge")) {
  fail("Extension bulk button missing selected count badge");
}

const webStore = fs.readFileSync(
  path.join(root, "src/features/system/SystemWebStoreExtensionsPanel.tsx"),
  "utf8",
);
if (webStore.includes("<Glass") && !webStore.includes('from "../../theme/p0008"')) {
  fail("SystemWebStoreExtensionsPanel uses Glass without import");
}

const table = fs.readFileSync(
  path.join(root, "src/features/profiles/StealthProfileDirectoryTable.tsx"),
  "utf8",
);
if (!table.includes("shouldPadDirectoryBodyToPageSize")) {
  fail("StealthProfileDirectoryTable missing shouldPadDirectoryBodyToPageSize");
}

const layoutCss = fs.readFileSync(path.join(root, "src/theme/stealth-profile-layout.css"), "utf8");
if (layoutCss.includes("tr.hub-users-row--pad")) {
  fail("stealth-profile-layout must not duplicate hub-ui partial-page pad CSS");
}

const panel = fs.readFileSync(path.join(root, "src/features/profiles/ProfileDirectoryPanel.tsx"), "utf8");
if (panel.includes("compactDirectory")) {
  fail("ProfileDirectoryPanel still uses compactDirectory");
}
if (!panel.includes('partialPagePad="invisible"')) {
  fail("ProfileDirectoryPanel missing partialPagePad invisible SSOT");
}

const workflowPanel = fs.readFileSync(path.join(root, "src/features/workflows/WorkflowDirectoryPanel.tsx"), "utf8");
if (!workflowPanel.includes('partialPagePad="invisible"')) {
  fail("WorkflowDirectoryPanel missing partialPagePad invisible SSOT");
}
if (!workflowPanel.includes("resolveDirectoryPanelFillRows")) {
  fail("WorkflowDirectoryPanel missing panelFillRows SSOT");
}

const workflowTable = fs.readFileSync(
  path.join(root, "src/features/workflows/StealthWorkflowDirectoryTable.tsx"),
  "utf8",
);
if (!workflowTable.includes("shouldPadDirectoryBodyToPageSize")) {
  fail("StealthWorkflowDirectoryTable missing partial-page pad helper");
}

if (!fs.existsSync(path.join(root, "scripts/smoke-profiles-partial-page.mjs"))) {
  fail("smoke-profiles-partial-page.mjs missing");
}

console.log("smoke-profiles-directory: ok");
console.log(`  profile colClasses (${profileClasses.length}): ${profileClasses.join(", ")}`);
