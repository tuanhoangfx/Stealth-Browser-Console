import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatAuthGateError, isAuthTransportError, isHtmlErrorBody } from "../auth-session.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const html = read("popup.html");
for (const needle of [
  'class="theme-hub"',
  'class="hub-app shell"',
  'class="hub-sidebar-shell"',
  'class="hub-sidebar-shell__footer"',
  'class="app-tab-header"',
  'class="hub-main"',
  'id="sidebar-user-btn"',
  'id="sidebar-log-btn"',
  'id="sidebar-settings-btn"',
  "hub-directory-table-body-scroll",
  'id="sidebar-zoom-slider"',
  "hub-ui-zoom-row",
  "hub-header-panel-btn",
  'id="header-notify-btn"',
  'id="header-log-btn"',
  'id="header-session-clock"',
  ">Settings</span>",
  'class="user-access-modal__header"',
  "hub-tool-detail-modal__body-frame",
  "hub-account-detail-modal__main-scroll",
  "hub-adm-inline-field",
  'id="hub-user-identity"',
  'id="hub-user-credentials"',
  'id="hub-user-status"',
  'id="hub-user-note"',
  'id="user-modal-save"',
  "hub-tool-detail-modal__footer-bar",
  'id="user-modal-footer-close"',
  'id="user-modal-logout"',
  ">Close</span>",
  'aria-label="Account"',
  "hub-adm-section-block",
  "hub-adm-click-edit",
  "hub-copy-badge",
  "twofa-adm-log-list",
  "Home Server data API",
  "hub-account-detail-modal__rail",
]) {
  assert.match(html, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const css = read("hub-workspace-user-modal.css");
assert.match(css, /@import "\.\/hub-vanilla\/styles\/hub-account-detail-modal\.css"/);
assert.match(css, /@import "\.\/hub-vanilla\/styles\/hub-modal\.css"/);
assert.doesNotMatch(css, /--overview-toc-w:\s*6\.3rem/);
assert.doesNotMatch(css, /--hub-modal-max-w:\s*min\(46rem/);
const hubModalCss = read("hub-vanilla/styles/hub-modal.css");
const hubAccountCss = read("hub-vanilla/styles/hub-account-detail-modal.css");
const hubScrollCss = read("hub-vanilla/styles/hub-scrollbar.css");
assert.match(hubAccountCss, /73\.6vh/);
assert.match(hubModalCss, /hub-tool-detail-modal__footer-bar/);
assert.match(hubScrollCss, /--hub-split-scroll-thumb,\s*#2a3158/);
assert.match(css, /position:\s*fixed/);
assert.match(css, /\.hub-modal-frame[\s\S]*height:\s*auto/);
assert.doesNotMatch(css, /--hub-modal-max-w:\s*calc\(100% - 0\.5rem\)/);
assert.match(html, /id="user-modal-logout"/);
assert.doesNotMatch(html, /hub-header-panel-modal/);
assert.doesNotMatch(html, /hub-tool-detail-modal--split/);
assert.doesNotMatch(html, /user-access-modal__header-titles/);

const auth = read("auth-session.js");
assert.match(auth, /parallel:\s*mode === "signin"/);
assert.match(auth, /hubFirst:\s*true/);
assert.match(auth, /resolveHubLoginEmails\(login\)/);
assert.match(auth, /identityResult = await identityPromise/);
assert.match(auth, /dataPending = dataPromise\.then/);
assert.match(auth, /api\.(?:infi28\.com|infi\.io\.vn)\/hub\/auth\/sign-in/);
assert.match(auth, /async function signInViaHubGateway/);
assert.match(auth, /extraAuthEmails/);
assert.match(auth, /export function parseJwtPayload/);
assert.match(auth, /new TextDecoder\("utf-8"\)\.decode\(bytes\)/);
assert.doesNotMatch(auth, /JSON\.parse\(atob\(/);
assert.doesNotMatch(auth, /hubAuthEmailFromLogin/);
const grantFn = auth.slice(auth.indexOf("export async function signInWithPassword"));
assert.ok(
  grantFn.indexOf("grant_type=password") < grantFn.indexOf("signInViaHubGateway"),
  "Hub/data grant must hit GoTrue first (P0005/P0020), Worker only on 5xx/timeout",
);

const background = read("background.js");
assert.match(background, /msg\?\.light === true/);
assert.match(background, /bindingList:\s*Array\.isArray\(storedBindings\)/);
assert.match(background, /dataPending/);
assert.match(background, /parseJwtPayload/);
assert.doesNotMatch(background, /JSON\.parse\(atob\(/);
assert.doesNotMatch(
  background.slice(background.indexOf("if (msg?.light === true)"), background.indexOf("bindingList: Array.isArray(storedBindings)")),
  /refreshAuthIfNeeded/,
);
const signInHandler = background.slice(
  background.indexOf('if (msg?.type === "EXTENSION_SIGN_IN"'),
  background.indexOf('if (msg?.type === "STORE_IDENTITY"'),
);
assert.match(signInHandler, /Respond before Hub roster/);
assert.ok(
  signInHandler.indexOf("sendResponse({") < signInHandler.indexOf("resolveHubUserModalProfile"),
  "popup must unblock before Hub roster profile fetch",
);
assert.match(signInHandler, /pull cloud routes after dataPending/);

const shellCss = read("hub-shell-chrome-lite.css");
assert.match(shellCss, /hub-sidebar-shell/);
assert.match(shellCss, /app-tab-header/);
assert.match(shellCss, /\.hub-main\b/);
assert.match(shellCss, /--hub-sidebar-width:\s*135px/);
assert.match(shellCss, /hub-directory-table-body-scroll/);
assert.match(shellCss, /--hub-split-scroll-size:\s*10px/);
assert.match(html, /hub-users-col--select[\s\S]*col-route[\s\S]*col-actions[\s\S]*col-synced[\s\S]*col-user[\s\S]*col-cookies/);
assert.match(html, /data-hub-directory-select/);
assert.match(html, /id="route-select-all"/);
assert.match(html, /hub-header-panel-btn--icon/);
assert.doesNotMatch(html, /id="header-notify-btn"[\s\S]*?>Notify<\/span>/);
assert.match(html, /class="hub-table-pager route-table-pager"/);
assert.doesNotMatch(html, /id="route-table-pager"[^>]*\bhidden\b/);
assert.match(html, /data-icon="fileText"/);
assert.match(html, /hub-icon-tone-cyan/);
assert.match(html, /hub-icon-tone-zinc/);
assert.match(html, /id="user-modal-log-list"/);
assert.match(html, /id="sidebar-log-list"/);
assert.match(html, /app-tab-header__session-time/);
assert.doesNotMatch(html, /app-tab-header__session-label/);
assert.doesNotMatch(html, /id="header-refresh-btn"/);
assert.doesNotMatch(html, /id="sidebar-refresh-btn"/);
assert.match(html, /id="ver-meta-version"/);
assert.match(html, /hub-chrome-activity-age/);
assert.match(html, /data-icon="tag"/);
assert.doesNotMatch(html, /hub-toc-nav__icon" data-icon="list"/);
assert.match(shellCss, /height:\s*600px/);
assert.match(shellCss, /\.hub-ui-zoom-row\b/);
assert.match(shellCss, /--hub-zoom-fill/);

const themeCss = read("popup-theme.css");
assert.match(themeCss, /--hub-user-zoom-pct:\s*90/);
assert.match(themeCss, /font-size:\s*calc\(16px \* var\(--hub-user-zoom-pct/);
assert.match(themeCss, /width:\s*800px/);
assert.match(themeCss, /height:\s*600px/);
assert.doesNotMatch(themeCss, /fonts\.googleapis\.com/);

const zoomLite = read("hub-user-zoom-lite.js");
assert.match(zoomLite, /HUB_USER_ZOOM_DEFAULT = 90/);
assert.match(zoomLite, /tool-workspace:user-zoom-pct/);
assert.match(zoomLite, /export function initHubUserZoom/);

const popup = read("popup.js");
assert.match(popup, /function pullCloudRoutesThenPaint/);
assert.match(popup, /PULL_CLOUD_ROUTES/);
assert.match(popup, /MAX_VISIBLE_ROUTES = 8/);
assert.match(popup, /routeTablePagerEl\.hidden = false/);
assert.match(popup, /function applySessionReadyFromStatus/);
assert.match(popup, /function headerChromeAgeHubTone/);
assert.match(popup, /hub-chrome-activity-age__dot--/);
assert.match(popup, /COOKIE_BRIDGE_ROUTE_TABLE_HEADER_EMOJI\.route/);
assert.match(popup, /COOKIE_BRIDGE_ROUTE_TABLE_HEADER_EMOJI\.status/);
assert.match(popup, /title="Routes"/);
assert.match(popup, /title="Ready"/);
assert.doesNotMatch(popup, /<span>routes<\/span>/);
assert.doesNotMatch(popup, /<span>ready<\/span>/);
assert.doesNotMatch(popup, /<span>vault<\/span>/);
assert.doesNotMatch(popup, /title="Vault"/);
assert.match(popup, /<td class="col-cookies"><span class="cookies-cell">/);
assert.doesNotMatch(popup, /header-refresh-btn/);
assert.doesNotMatch(popup, /sidebar-refresh-btn/);
assert.doesNotMatch(popup, /refreshWorkspaceRoutes/);
assert.doesNotMatch(popup, /el\.textContent = age \? `v\$\{v\} • \$\{age\}`/);
assert.match(popup, /function pushTabActivity/);
assert.match(popup, /identityIsLive\(identity\) \? identity : identityIsLive\(auth\)/);
assert.doesNotMatch(popup, /sessionReadyCache = Boolean\(data\?\.sessionReady\)/);
assert.doesNotMatch(popup, /sessionReadyCache = ready;/);
assert.match(popup, /route-cookie-label">Jar/);
assert.match(popup, /cookies-sep/);
assert.match(popup, /route-cookie-label">Vault/);
assert.match(popup, /COOKIE_BRIDGE_ROUTE_TABLE_HEADER_EMOJI/);
assert.match(popup, /route-action route-share/);
assert.match(popup, /cookieShareQueryForWeb/);
assert.match(popup, /OPEN_TOOL_COOKIE/);
assert.match(html, /id="cookie-share-panel"/);
assert.match(themeCss, /\.route-action\.route-share\b/);
assert.match(themeCss, /\.cookie-share-panel\b/);
assert.match(themeCss, /width:\s*15rem/);
assert.match(read("cookie-share-panel.js"), /fetchHubCookieShareUserRoster/);
assert.match(read("cookie-share-panel.js"), /hub-cookie-share-user-roster\.js/);
assert.match(read("background.js"), /msg\.query/);
assert.match(popup, /hub-checkbox hub-users-checkbox route-select/);
assert.doesNotMatch(popup, /selectedNoteIds\.add\(selectedNoteId\)/);
assert.match(popup, /fileText:/);
assert.doesNotMatch(popup, /showPager = matchedCount > MAX_VISIBLE_ROUTES/);
assert.match(themeCss, /min-width:\s*67rem/);
assert.match(themeCss, /\.hub-table-pager\b/);
assert.match(themeCss, /\.route-cookie-count\b/);
assert.match(themeCss, /\.activity-time[\s\S]*font-size:\s*var\(--hub-table-body-size/);
assert.doesNotMatch(themeCss, /\.activity-time[\s\S]{0,80}font-size:\s*10px/);
assert.doesNotMatch(themeCss, /height:\s*44px/);
assert.match(themeCss, /th\.col-route \.th-label/);
assert.match(themeCss, /justify-content:\s*flex-start/);
assert.match(shellCss, /box-sizing:\s*border-box/);
assert.match(shellCss, /hub-icon-tone-cyan/);
assert.match(shellCss, /hub-icon-tone-indigo/);
assert.match(shellCss, /grid-template-columns:\s*minmax\(0,\s*1fr\) auto minmax\(0,\s*1fr\)/);
assert.match(shellCss, /grid-template-rows:\s*auto;/);
assert.doesNotMatch(shellCss, /grid-template-rows:\s*auto auto/);
assert.doesNotMatch(shellCss, /\.app-tab-header-center-stats[\s\S]{0,180}grid-row:\s*2/);
assert.match(shellCss, /min-width:\s*67rem/);
assert.match(shellCss, /\.hub-checkbox\b/);
assert.match(shellCss, /--hub-sidebar-width:\s*135px/);
assert.match(popup, /header-notify-btn/);
assert.match(popup, /initHubUserZoom\(\)/);
assert.match(popup, /bindHubUiZoomControl/);
assert.match(popup, /applyHubUserZoomPct/);
assert.match(popup, /hydrateSessionFromStorage/);
assert.match(popup, /hydrateRoutesFromStorage/);
assert.match(popup, /type:\s*"GET_STATUS",\s*light:\s*true/);
assert.match(popup, /opts\.light === true/);
assert.match(popup, /refresh\(null, \{ requestTool: false, light: true \}\)/);
assert.doesNotMatch(popup, /sidebar-logout-btn/);
assert.match(popup, /function sidebarUsernameLabel/);
assert.doesNotMatch(html, /id="sidebar-logout-btn"/);
assert.match(popup, /closeUserModal\(\);/);
assert.match(read("hub-workspace-user-modal.js"), /user-modal-footer-close/);
assert.match(read("hub-workspace-user-modal.js"), /Home Server data API/);
assert.match(read("hub-workspace-user-modal.js"), /hub-user-credentials/);
assert.match(read("hub-workspace-user-modal.js"), /formatHubRelativeTime/);
assert.match(read("hub-workspace-user-modal.js"), /hubCopyBadgeDisplayLabel/);
assert.match(read("popup.js"), /renderHubUserModalLog/);
assert.match(read("popup.js"), /currentUserLoginId/);
assert.match(popup, /FILTER_TRIGGER_EMOJI/);
assert.match(popup, /hub-filter-option-emoji/);
assert.doesNotMatch(popup, /All Platform|All Role|All Vault|All Access/);
assert.doesNotMatch(html, /header-user-chip/);
assert.match(popup, /openHubWorkspaceUserModal\(userModalEl\)/);
assert.match(popup, /cachedUserModalData/);
assert.match(popup, /function clearLoginMessage/);
assert.match(popup, /adoptLoginFromStorage/);
assert.match(popup, /clearLoginMessage\(\)/);
assert.doesNotMatch(popup, /showLoginMessage\(""\)/);
assert.doesNotMatch(popup, /if \(res\.warning\) showLoginMessage/);

const cf504 = `<!DOCTYPE html><html><body><div class="cf-browser-status"></div>
<a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_504&utm_campaign=hub-api.infi.io.vn">504</a></body></html>`;
assert.equal(isHtmlErrorBody(cf504), true);
assert.match(formatAuthGateError(cf504), /Sign-in service is offline \(HTTP 504\)/);
assert.doesNotMatch(formatAuthGateError(cf504), /DOCTYPE|cf-browser-status/);
assert.equal(formatAuthGateError(""), "Sign-in failed. Please try again.");

const chromePort =
  "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received";
assert.equal(isAuthTransportError(chromePort), true);
assert.match(formatAuthGateError(chromePort), /interrupted/);
assert.notEqual(formatAuthGateError(chromePort), "Sign-in failed. Please try again.");

const worker = fs.readFileSync(
  path.join(root, "..", "..", "Tool", "scripts", "cf-workers", "infi-hub-api-gateway", "worker.mjs"),
  "utf8",
);
assert.match(worker, /hub\/auth\/(?:sign-in|resolve-login)/);
assert.match(worker, /async function (?:handleSignIn|handleSyncMirror)/);

const { formatHubRelativeTime, hubCopyBadgeDisplayLabel } = await import(
  "../hub-workspace-user-modal.js"
);
assert.equal(formatHubRelativeTime(Date.now() - 120_000), "2m ago");
assert.equal(hubCopyBadgeDisplayLabel("273527e9-8184-4abc-9def-0123456789ab"), "273527e9…");

const { parseJwtPayload } = await import("../auth-session.js");
const viName = "Trần Hiệp";
const jwtPayloadB64 = Buffer.from(
  JSON.stringify({ sub: "u1", user_metadata: { full_name: viName, login_id: "cs00966" } }),
  "utf8",
)
  .toString("base64")
  .replace(/=+$/, "")
  .replace(/\+/g, "-")
  .replace(/\//g, "_");
const decoded = parseJwtPayload(`x.${jwtPayloadB64}.y`);
assert.equal(decoded?.user_metadata?.full_name, viName);
assert.notEqual(decoded?.user_metadata?.full_name, "Tráº§n Hiá»‡p");

const vanillaHints = read("hub-vanilla/hub-directory-column-hint-vanilla.mjs");
assert.match(vanillaHints, /export const COOKIE_BRIDGE_ROUTE_TABLE_HEADER_EMOJI/);
const {
  COOKIE_BRIDGE_ROUTE_TABLE_COLUMN_HINTS,
  COOKIE_BRIDGE_ROUTE_TABLE_HEADER_EMOJI,
  COOKIE_BRIDGE_ROUTE_TABLE_HEADER_ICONS,
} = await import("../hub-directory-column-hints.js");
assert.equal(COOKIE_BRIDGE_ROUTE_TABLE_HEADER_EMOJI.route, "🌐");
assert.equal(COOKIE_BRIDGE_ROUTE_TABLE_HEADER_EMOJI.status, "🚦");
assert.equal(COOKIE_BRIDGE_ROUTE_TABLE_HEADER_ICONS.route, "route");
assert.ok(COOKIE_BRIDGE_ROUTE_TABLE_COLUMN_HINTS.route);

// Dedicated Cookie Tab (Site Directory Table SSOT) + Settings Modal Zoom SSOT
const sidebarFooterHtml = html.slice(
  html.indexOf('<footer class="hub-sidebar-shell__footer">'),
  html.indexOf("</footer>") + "</footer>".length,
);
assert.doesNotMatch(
  sidebarFooterHtml,
  /hub-ui-zoom-row|sidebar-zoom-slider/,
  "Sidebar footer must NOT contain zoom slider — zoom belongs in Settings modal per hub-header-footer-chrome-ssot",
);
const settingsModalHtml = html.slice(html.indexOf('id="settings-modal"'));
assert.match(settingsModalHtml, /id="sidebar-zoom-slider"/);
assert.match(settingsModalHtml, /data-zoom-step="90"/);
assert.match(settingsModalHtml, /data-zoom-step="100"/);
assert.match(settingsModalHtml, /data-zoom-step="110"/);
assert.match(settingsModalHtml, /data-zoom-step="120"/);
assert.match(settingsModalHtml, /id="settings-modal-open-web"/);

assert.match(html, /id="sidebar-nav-routes"/);
assert.match(html, /id="sidebar-nav-cookie"/);
assert.match(html, /id="tab-panel-routes"/);
assert.match(html, /id="tab-panel-cookie"/);
assert.doesNotMatch(html, /id="current-site-bar"/);
assert.doesNotMatch(html, /id="cookie-open-tabs-chips"/);
assert.match(html, /id="cookie-select-all"/);
assert.match(html, /data-cookie-filter="platform"/);
assert.match(html, /data-cookie-filter="tab"/);
assert.match(html, /data-cookie-filter="sso"/);
assert.match(html, /data-cookie-filter="cookies"/);
assert.match(html, /id="cookie-bulk-import-btn"/);
assert.match(html, /id="cookie-bulk-clear-selected-btn"/);
assert.match(html, /id="cookie-bulk-clear-active-btn"/);
assert.match(html, /id="cookie-import-panel"/);
assert.match(html, /id="cookie-import-domain"/);
assert.match(html, /id="cookie-import-textarea"/);
assert.match(html, /id="cookie-import-submit"/);
assert.match(html, /id="cookie-jar-table"/);
assert.match(html, /id="cookie-jar-body"/);
assert.doesNotMatch(popup, /route-action route-clear/);
assert.match(popup, /cookie-site-copy/);
assert.match(popup, /cookie-site-update/);
assert.match(popup, /cookie-site-uid-badge/);
assert.match(popup, /async function runExportSiteCookies/);
assert.match(popup, /function openCookieImportModal/);
assert.match(popup, /async function runSubmitCookieImportModal/);
assert.match(background, /type === "GET_CURRENT_SITE_INFO"/);
assert.match(background, /type === "CLEAR_CURRENT_SITE_COOKIES"/);
assert.match(background, /async function clearSiteCookiesComplete/);
assert.match(popup, /function switchNavTab/);
assert.match(popup, /async function runClearSiteCookies/);
assert.match(popup, /async function runBulkClearSelectedSites/);
assert.match(popup, /async function refreshCurrentSiteBar/);
assert.match(popup, /function renderCookieJarTable/);
assert.match(popup, /function openSettingsModal/);
assert.match(themeCss, /\.cookie-bulk-bar\b/);
assert.match(themeCss, /\.cookie-jar-table\b/);
assert.match(themeCss, /\.cookie-site-uid-badge\b/);
assert.match(themeCss, /\.cookie-import-panel__card\b/);
assert.match(html, /class="route-search hub-search-field"/);
assert.match(html, /id="route-search"[^>]*role="searchbox"/);
assert.match(html, /id="cookie-jar-search"[^>]*role="searchbox"/);
assert.match(html, /<kbd>F<\/kbd>/);
assert.match(html, /class="route-count hub-result-count"/);
assert.match(html, /class="hub-filter-bar__toolbar"/);
assert.match(html, /class="hub-filter-bar__row-filters"/);
assert.doesNotMatch(html, /data-icon-only="true"/);
assert.match(html, /id="cookie-bulk-clear-active-domain"/);
assert.match(html, /id="route-filter-reset-btn"/);
assert.match(themeCss, /\.filter-dd-trigger\b/);
assert.match(themeCss, /\.filter-dd-count\b/);
assert.match(themeCss, /\.hub-result-count\b/);
assert.match(themeCss, /\.hub-filter-clear-btn\b/);
assert.match(themeCss, /table\.routes-table,\s*table\.cookie-jar-table/);
assert.match(popup, /function renderHubResultCount/);
assert.match(auth, /https:\/\/api\.infi28\.com\/hub\/auth\/sync-mirror-password/);
assert.match(read("build-info.js"), /https:\/\/databox\.infi28\.com\/cookie/);

const { extractSiteSessionIdentityHint, parseCookiesInputForSite } = await import(
  "../site-cookie-cleaner.js"
);
const fbHint = extractSiteSessionIdentityHint("facebook.com", [
  { name: "c_user", value: "100084912345678" },
  { name: "xs", value: "28%3Aabcd" },
]);
assert.equal(fbHint.isAuthenticated, true);
assert.equal(fbHint.sessionHint, "UID 100084912345678");

const parsedJson = parseCookiesInputForSite(
  JSON.stringify([{ name: "c_user", value: "100084912345678", domain: ".facebook.com", secure: true }]),
  "",
);
assert.equal(parsedJson.inferredDomain, "facebook.com");
assert.equal(parsedJson.cookies.length, 1);
assert.equal(parsedJson.cookies[0].name, "c_user");

const parsedHeader = parseCookiesInputForSite("c_user=1000999888; xs=secret_xs_token", "facebook.com");
assert.equal(parsedHeader.inferredDomain, "facebook.com");
assert.equal(parsedHeader.cookies.length, 2);
assert.equal(parsedHeader.cookies[0].domain, ".facebook.com");

console.log("OK E0001 user-modal + hub-first login + dedicated Cookie tab Site Directory SSOT");
