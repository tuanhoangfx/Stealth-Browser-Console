/**
 * Static smoke — Profile edit modal layout + rails (Note + Console SSOT).
 * Run: node scripts/smoke-profile-modal-layout.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fail = (msg) => {
  console.error(`smoke-profile-modal-layout: FAIL — ${msg}`);
  process.exit(1);
};

const editModalTsx = fs.readFileSync(
  path.join(root, "src/features/profiles/ProfileDetailModal.tsx"),
  "utf8",
);
const detailToc = fs.readFileSync(path.join(root, "src/features/profiles/profile-detail-toc.ts"), "utf8");
const shellTs = fs.readFileSync(path.join(root, "src/features/profiles/profile-form-modal.ts"), "utf8");
const logRailTsx = fs.readFileSync(
  path.join(root, "src/features/profiles/ProfileDetailLogRail.tsx"),
  "utf8",
);
const noteRailTsx = fs.readFileSync(
  path.join(root, "src/features/profiles/ProfileDetailNoteRail.tsx"),
  "utf8",
);
const runtimePanels = fs.readFileSync(
  path.join(root, "src/features/runtime/StealthRuntimeRailPanels.tsx"),
  "utf8",
);
const profilePrefsTs = fs.readFileSync(
  path.join(root, "src/features/profiles/profile-directory-prefs.ts"),
  "utf8",
);

if (editModalTsx.includes("ProfileExtensionFields") || editModalTsx.includes("trailingSections")) {
  fail("EditProfileModal must not render Extensions in main column");
}

if (detailToc.includes("Extensions") || detailToc.includes("profile-extensions")) {
  fail("profile-detail TOC must not include Extensions section");
}

if (!editModalTsx.includes("ProfileDetailNoteRail")) {
  fail("ProfileDetailModal edit mode must use ProfileDetailNoteRail");
}

if (editModalTsx.includes("ProfileDetailHistoryRail")) {
  fail("ProfileDetailModal must not use ProfileDetailHistoryRail — Note replaces History");
}

if (!editModalTsx.includes("ProfileDetailTocNav") || !editModalTsx.includes("stealth-profile-detail-runtime-rail")) {
  fail("ProfileDetailModal bulk mode must include Navigate TOC + Note/Console runtime rail (Detail parity)");
}

if (!editModalTsx.includes("ProfileBulkFormFields")) {
  fail("ProfileDetailModal bulk mode must use ProfileBulkFormFields hub-sections stack");
}

if (editModalTsx.includes("Bulk detail —") || editModalTsx.includes("HubBulkDetailField")) {
  fail("ProfileDetailModal bulk mode must not use legacy Bulk detail title or HubBulkDetailField grid");
}

if (!noteRailTsx.includes("HubAdmNoteRail") || !noteRailTsx.includes('mode="editor"')) {
  fail("ProfileDetailNoteRail must use HubAdmNoteRail editor SSOT");
}

if (!noteRailTsx.includes("PROFILE_DETAIL_SECTION_NOTE") || !noteRailTsx.includes("PROFILE_DETAIL_NOTE_LABEL")) {
  fail("ProfileDetailNoteRail must use Note section id + label SSOT");
}

if (!profilePrefsTs.includes('"note"') || !profilePrefsTs.match(/DEFAULT_PROFILE_DIRECTORY_COLUMNS[\s\S]*"note"/)) {
  fail("DEFAULT_PROFILE_DIRECTORY_COLUMNS must include note by default");
}

if (!logRailTsx.includes("StealthConsoleContent")) {
  fail("ProfileDetailLogRail must use StealthConsoleContent SSOT");
}

if (logRailTsx.includes("Activity log")) {
  fail("ProfileDetailLogRail title must be Console");
}

if (!logRailTsx.includes("StealthConsoleRailTitle")) {
  fail("ProfileDetailLogRail must use StealthConsoleRailTitle with directory hint");
}

if (logRailTsx.includes("HubHintTooltip")) {
  fail("Console hint must use HubDirectoryColumnHint SSOT, not HubHintTooltip");
}

const consoleHintTs = fs.readFileSync(
  path.join(root, "src/features/runtime/stealth-console-hint-content.ts"),
  "utf8",
);

if (!consoleHintTs.includes("HubDirectoryColumnHintContent") && !consoleHintTs.includes("colHint")) {
  fail("stealth-console-hint must build colHint content for HubDirectoryColumnHint");
}

if (!runtimePanels.includes("StealthConsoleRailTitle")) {
  fail("StealthSystemConsolePanel must use StealthConsoleRailTitle hint");
}

if (!runtimePanels.includes("export function StealthConsoleContent")) {
  fail("StealthConsoleContent shared export missing");
}

if (!runtimePanels.includes("export function StealthRunHistoryContent")) {
  fail("StealthRunHistoryContent shared export missing");
}

if (!runtimePanels.includes("hub-runtime-history-list__line")) {
  fail("StealthRunHistoryContent must render single-line History rows");
}
if (runtimePanels.includes("primaryTrailing")) {
  fail("StealthRunHistoryContent must not duplicate status icon on the right");
}
if (runtimePanels.includes("metaRow:")) {
  fail("StealthRunHistoryContent must not use second-line metaRow — single line SSOT");
}

if (shellTs.match(/PROFILE_EDIT_MODAL_SHELL_CLASS[^;]*hub-tool-detail-modal--fit/)) {
  fail("edit modal shell must not use hub-tool-detail-modal--fit");
}

if (!logRailTsx.includes("STEALTH_CONSOLE_RAIL_LABEL") || !logRailTsx.includes("showIcon")) {
  fail("ProfileDetailLogRail must use StealthConsoleRailTitle + Console SSOT label/icon");
}

const liveChipPath = path.join(root, "src/features/profiles/StealthProfilesLiveHeaderChip.tsx");
const profilesHubChromeTsx = fs.readFileSync(
  path.join(root, "src/features/profiles/ProfilesHubChrome.tsx"),
  "utf8",
);
if (fs.existsSync(liveChipPath)) {
  fail("StealthProfilesLiveHeaderChip removed — Running header stat is SSOT (no Live chip)");
}
if (profilesHubChromeTsx.includes("StealthProfilesLiveHeaderChip") || profilesHubChromeTsx.includes("Live")) {
  fail("Profiles hub header must not show Live chip — Running stat already covers it");
}

const launchBandTsx = fs.readFileSync(
  path.join(root, "src/features/profiles/StealthProfilesLaunchHeaderBand.tsx"),
  "utf8",
);
if (!launchBandTsx.includes("Launch") || !profilesHubChromeTsx.includes("StealthProfilesLaunchHeaderBand")) {
  fail("Profiles hub header must swap to Launch progress band during automation");
}
if (!profilesHubChromeTsx.includes("centerContent")) {
  fail("ProfilesHubChrome must pass centerContent to AppTabHeader during Launch");
}

const automationQueueTs = fs.readFileSync(
  path.join(root, "src/features/runtime/useStealthAutomationQueue.ts"),
  "utf8",
);
if (!automationQueueTs.includes("launchProgress") || !automationQueueTs.includes("mapWithConcurrency")) {
  fail("useStealthAutomationQueue must expose launchProgress with parallel batch support");
}
if (!automationQueueTs.includes('"Launch"')) {
  fail("useStealthAutomationQueue must mirror Launch progress into Console via addLog");
}

const admShellTs = fs.readFileSync(
  path.join(root, "src/features/shared/stealth-adm-detail-modal.ts"),
  "utf8",
);
if (!shellTs.includes("STEALTH_ADM_DETAIL_EDIT_MODAL_SHELL_CLASS") || !admShellTs.includes("hub-tool-detail-modal--split")) {
  fail("profile-form-modal must delegate to stealth-adm-detail-modal SSOT");
}

const detailCss = fs.readFileSync(
  path.join(root, "src/features/profiles/stealth-profile-detail-modal.css"),
  "utf8",
);

if (!detailCss.includes("stealth-profile-detail-runtime-rail") || !detailCss.includes("grid-template-rows")) {
  fail("stealth-profile-detail-modal.css must define 50/50 Note + Console rail grid");
}
if (!detailCss.includes("stealth-profile-detail-note-rail")) {
  fail("stealth-profile-detail-modal.css must style stealth-profile-detail-note-rail");
}
if (!detailCss.includes("stealth-extension-detail-modal")) {
  fail("stealth-profile-detail-modal.css must include extension detail modal Layout 3 selectors");
}

const hintsTs = fs.readFileSync(
  path.join(root, "src/lib/stealth-directory-column-hints.ts"),
  "utf8",
);

if (!hintsTs.includes("stealthProfileColumnHintContent") || !hintsTs.includes("colHint")) {
  fail("stealth-directory-column-hints SSOT missing profile column hints");
}

if (!profilePrefsTs.includes("withDirectoryColumnLabelHints") || !profilePrefsTs.includes("stealthProfileColumnHintContent")) {
  fail("profile-directory-prefs must attach labelHint via withDirectoryColumnLabelHints");
}

const filterHintsTs = fs.readFileSync(path.join(root, "src/lib/stealth-filter-hints.ts"), "utf8");
const profileChromeTs = fs.readFileSync(
  path.join(root, "src/features/profiles/useProfileDirectoryChrome.tsx"),
  "utf8",
);
const storePrefsTs = fs.readFileSync(
  path.join(root, "src/features/workflows/workflow-store-directory-prefs.ts"),
  "utf8",
);
const displayConfigTs = fs.readFileSync(path.join(root, "src/lib/stealth-display-panel-config.tsx"), "utf8");
const storeFilterPaneTs = fs.readFileSync(
  path.join(root, "src/features/workflows/WorkflowStoreFilterPane.tsx"),
  "utf8",
);

if (!filterHintsTs.includes("applyStealthFilterLabelHints")) {
  fail("stealth-filter-hints must export applyStealthFilterLabelHints");
}

if (!profileChromeTs.includes("applyStealthFilterLabelHints")) {
  fail("Profiles FilterBar must apply stealth filter label hints");
}
if (!profileChromeTs.includes("isHubPrefVisible") || !profileChromeTs.includes("hubFilters")) {
  fail("Profiles FilterBar must gate Group/Status via Display hubFilters");
}

if (!storePrefsTs.includes("withDirectoryColumnLabelHints") || !storePrefsTs.includes("stealthWorkflowStoreColumnHintContent")) {
  fail("workflow-store-directory-prefs must wire column label hints");
}

if (!displayConfigTs.includes("workflow-store") || !displayConfigTs.includes("WORKFLOW_STORE_DIRECTORY_COLUMN_ITEMS")) {
  fail("stealth-display-panel-config must support workflow-store column prefs");
}

if (!storeFilterPaneTs.includes('directoryVariant="store"')) {
  fail("WorkflowStoreFilterPane must use store display variant");
}

const stickersTs = fs.readFileSync(path.join(root, "src/lib/stealth-column-stickers.ts"), "utf8");
const metaTs = fs.readFileSync(path.join(root, "src/lib/directory-column-meta.ts"), "utf8");

if (!stickersTs.includes("STEALTH_PROFILE_COLUMN_STICKER") || !metaTs.includes("withDirectoryColumnStickers")) {
  fail("directory-column-meta must apply sticker SSOT via withDirectoryColumnStickers");
}

if (!profilePrefsTs.includes("prefIconMapFromHubDirectoryColumnMeta")) {
  fail("profile-directory-prefs must derive Display icons from column meta stickers");
}

const storeCardTs = fs.readFileSync(path.join(root, "src/features/workflows/WorkflowStoreCard.tsx"), "utf8");
const storePanelTs = fs.readFileSync(
  path.join(root, "src/features/workflows/WorkflowStoreDirectoryPanel.tsx"),
  "utf8",
);

if (!storeCardTs.includes("StoreCardStickerMeta") || !storeCardTs.includes("STEALTH_WORKFLOW_STORE_COLUMN_STICKER")) {
  fail("WorkflowStoreCard must render sticker meta rows from column SSOT");
}

if (!storePanelTs.includes("visibleColumnKeys")) {
  fail("WorkflowStoreDirectoryPanel must pass visible column prefs to cards");
}

console.log("smoke-profile-modal-layout: PASS");
