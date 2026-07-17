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
  /STEALTH_PROFILE_COLUMN_META[\s\S]*?applyStandardDirectoryColumnHints\(\s*\{([\s\S]*?)\n\s*\},\s*\n\s*STEALTH_PROFILE_DIRECTORY_HINT/,
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

const stickers = fs.readFileSync(path.join(root, "src/lib/stealth-column-stickers.ts"), "utf8");
if (stickers.includes('e0001:') || stickers.includes('surfshark:')) {
  fail("extension columns must not use emoji stickers — use extension/brand icons");
}
if (!metaSrc.includes("withExtensionColumnHeaderIcons")) {
  fail("directory-column-meta must wire extension column header icons");
}

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

const extensionsPage = fs.readFileSync(
  path.join(root, "src/features/system/SystemExtensionsPage.tsx"),
  "utf8",
);
if (!extensionsPage.includes("Force update") && !extensionsPage.includes("force: true")) {
  fail("SystemExtensionsPage missing Force update from Web Store");
}
if (!extensionsPage.includes("SystemExtensionsDirectoryPanel")) {
  fail("SystemExtensionsPage must use Backup-like directory panel");
}
if (!extensionsPage.includes("ExtensionDetailModal")) {
  fail("SystemExtensionsPage must open ExtensionDetailModal (metadata not in right rail)");
}

const extensionsRail = fs.readFileSync(path.join(root, "src/features/system/SystemExtensionsRail.tsx"), "utf8");
const backupRail = fs.readFileSync(path.join(root, "src/features/system/SystemBackupRail.tsx"), "utf8");
if (extensionsRail.includes("Cookie Bridge") || extensionsRail.includes("fetchCookieBridgeStatus")) {
  fail("SystemExtensionsRail must not embed Cookie Bridge panel — use ExtensionDetailModal");
}
if (!extensionsRail.includes("runtimeOnly") || !backupRail.includes("runtimeOnly")) {
  fail("System Backup/Extensions rails must use ProfilesWorkflowRail runtimeOnly (History + Console only)");
}

const extFilter = fs.readFileSync(
  path.join(root, "src/features/system/extensions/SystemExtensionsFilterPane.tsx"),
  "utf8",
);
if (!extFilter.includes("filterSelectionToolbar")) {
  fail("SystemExtensionsFilterPane missing filterSelectionToolbar (selection counter SSOT)");
}
if (!extFilter.includes('systemTab="extensions"')) {
  fail("SystemExtensionsFilterPane must pass systemTab=extensions to Display toolbar");
}
if (extFilter.includes("Install from Web Store") && extFilter.includes("Load unpacked")) {
  fail("Install controls must live in ExtensionDetailModal, not filter pane");
}

if (!extFilter.includes('showRefresh={false}')) {
  fail("SystemExtensionsFilterPane must hide Refresh (Profiles SSOT)");
}
if (!extFilter.includes("buildExtensionFilters")) {
  fail("SystemExtensionsFilterPane must wire Kind filter SSOT");
}

const extTable = fs.readFileSync(
  path.join(root, "src/features/system/extensions/SystemExtensionsDirectoryTable.tsx"),
  "utf8",
);
if (!extTable.includes("HubDirectoryTableShell")) {
  fail("SystemExtensionsDirectoryTable must use HubDirectoryTableShell SSOT");
}
if (!extTable.includes("shouldPadDirectoryBodyToPageSize")) {
  fail("SystemExtensionsDirectoryTable missing partial-page row pad SSOT");
}

const extModal = fs.readFileSync(
  path.join(root, "src/features/system/extensions/ExtensionDetailModal.tsx"),
  "utf8",
);
if (!extModal.includes("HubAccountDetailAdmScaffold")) {
  fail("ExtensionDetailModal must use Layout 3 HubAccountDetailAdmScaffold");
}
if (!extModal.includes("ExtensionDetailTocNav")) {
  fail("ExtensionDetailModal must use ExtensionDetailTocNav SSOT");
}

if (!extModal.includes("stealth-profile-detail-runtime-rail")) {
  fail("ExtensionDetailModal must use History + Console 50/50 runtime rail");
}

const extDetailToc = fs.readFileSync(
  path.join(root, "src/features/system/extensions/extension-detail-toc.ts"),
  "utf8",
);
const admShellTs = fs.readFileSync(
  path.join(root, "src/features/shared/stealth-adm-detail-modal.ts"),
  "utf8",
);
if (!extDetailToc.includes("STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS")) {
  fail("Extension detail modal shell must reuse STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS SSOT");
}
if (!admShellTs.includes("hub-tool-detail-modal--split")) {
  fail("stealth-adm-detail-modal must include hub-tool-detail-modal--split for Layout 3");
}
if (extDetailToc.includes("hub-header-panel-modal")) {
  fail("Extension detail modal must not use hub-header-panel-modal — breaks Layout 3 fill height");
}
if (!admShellTs.includes("hubAccountDetailShellClass")) {
  fail("stealth-adm-detail-modal must use hubAccountDetailShellClass SSOT");
}

const extDisplayNameTs = fs.readFileSync(
  path.join(root, "src/lib/extension-display-name.ts"),
  "utf8",
);
if (!extDisplayNameTs.includes("resolveExtensionDisplayName") || !extDisplayNameTs.includes("__MSG_")) {
  fail("extension-display-name must resolve __MSG_* keys for UI");
}
if (!extModal.includes("resolveExtensionDisplayName")) {
  fail("ExtensionDetailModal must resolve extension display name");
}

const backupPanel = fs.readFileSync(
  path.join(root, "src/features/system/backup/SystemBackupDirectoryPanel.tsx"),
  "utf8",
);
if (!backupPanel.includes("HubSplitDirectoryPane")) {
  fail("SystemBackupDirectoryPanel must use HubSplitDirectoryPane SSOT");
}
if (!backupPanel.includes('partialPagePad="invisible"')) {
  fail("SystemBackupDirectoryPanel missing partialPagePad invisible");
}

const backupFilter = fs.readFileSync(
  path.join(root, "src/features/system/backup/SystemBackupFilterPane.tsx"),
  "utf8",
);
if (!backupFilter.includes("filterSelectionToolbar")) {
  fail("SystemBackupFilterPane missing filterSelectionToolbar");
}
if (!backupFilter.includes('systemTab="backup"')) {
  fail("SystemBackupFilterPane must pass systemTab=backup to Display toolbar");
}

const backupTable = fs.readFileSync(
  path.join(root, "src/features/system/backup/SystemBackupDirectoryTable.tsx"),
  "utf8",
);
if (!backupTable.includes("readBackupDirectoryColumns")) {
  fail("SystemBackupDirectoryTable must respect column prefs / Preset");
}

const displayPanel = fs.readFileSync(path.join(root, "src/lib/stealth-display-panel-config.tsx"), "utf8");
if (!displayPanel.includes("subTabDisplay")) {
  fail("stealth-display-panel-config must wire subTabDisplay for system tabs");
}
if (!displayPanel.includes("extensionDirectoryColumnPresetsProp")) {
  fail("stealth-display-panel-config must wire extension column presets");
}

const nav = fs.readFileSync(path.join(root, "src/lib/stealth-nav-structure.ts"), "utf8");
if (!nav.includes('view: "extensions"') || !nav.includes("Extensions")) {
  fail("stealth-nav-structure missing System → Extensions tab");
}
const designIdx = nav.indexOf('view: "design"');
const extensionsIdx = nav.indexOf('view: "extensions"');
if (designIdx < 0 || extensionsIdx < 0 || designIdx > extensionsIdx) {
  fail("System nav must place Design above Extensions");
}

if (!extFilter.includes("isHubPrefVisible") || !extFilter.includes("readSystemTabDisplay")) {
  fail("SystemExtensionsFilterPane must gate Kind filter via Display hubFilters");
}

const overview = fs.readFileSync(path.join(root, "src/features/system/SystemOverviewPage.tsx"), "utf8");
if (overview.includes("SystemWebStoreExtensionsPanel") || overview.includes("SystemCookieBridgePanel")) {
  fail("SystemOverviewPage must not host extension panels anymore");
}

const table = fs.readFileSync(
  path.join(root, "src/features/profiles/StealthProfileDirectoryTable.tsx"),
  "utf8",
);
if (!table.includes("shouldPadDirectoryBodyToPageSize")) {
  fail("StealthProfileDirectoryTable missing shouldPadDirectoryBodyToPageSize");
}
if (!table.includes("extensionIcons")) {
  fail("StealthProfileDirectoryTable must wire extensionIcons to column headers");
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

const displayItems = fs.readFileSync(
  path.join(root, "src/features/profiles/profile-directory-display-items.ts"),
  "utf8",
);
if (!displayItems.includes("profileDirectoryColumnItemsWithExtensionIcons")) {
  fail("profile-directory-display-items must merge extension icons for Display prefs");
}
if (!displayPanel.includes("profileDirectoryColumnItemsWithExtensionIcons")) {
  fail("stealth-display-panel-config must use extension-aware column items");
}
const storeIdsTs = fs.readFileSync(path.join(root, "src/lib/stealth-extension-store-ids.ts"), "utf8");
if (!storeIdsTs.includes("stealth-extension-store-ids.json")) {
  fail("stealth-extension-store-ids.ts must import shared JSON SSOT");
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
