import { showToast } from "./toast.js";
import { COOKIE_BRAND_ICON_REGISTRY } from "./cookie-brand-icons.generated.js";
import {
  describeSiteClearTarget,
  extractRegistrableDomain,
  isGoogleDomain,
  siteUrlForDomain,
} from "./domain-routes.js";
import {
  clearMultipleSitesCookies,
  clearSiteCookiesComplete,
  exportSiteCookiesForDirectory,
  getCurrentSiteCookieInfo,
  importSiteCookiesFromJsonForDirectory,
  listAllCookieSitesForDirectory,
} from "./site-cookie-cleaner.js";
import { bindingRoleInfo as resolveBindingRoleInfo } from "./route-access.js";
import { bindingRouteKey } from "./vault-api.js";
import { bindHubAuthLogoutChip, updateHubAuthLogoutChip } from "./hub-auth-logout-chip.js";
import {
  renderRouteStatusChipHtml,
  resolveExtensionRouteStatusDisplay,
} from "./hub-route-status-chip.js";
import {
  bindHubWorkspaceUserModal,
  closeHubWorkspaceUserModal,
  openHubWorkspaceUserModal,
  populateHubWorkspaceUserModal,
  renderHubUserModalLog,
} from "./hub-workspace-user-modal.js";
import {
  COOKIE_BRIDGE_ROUTE_TABLE_COLUMN_HINTS,
  COOKIE_BRIDGE_ROUTE_TABLE_HEADER_EMOJI,
  COOKIE_BRIDGE_ROUTE_TABLE_HEADER_ICONS,
  mountDirectoryColumnHints,
} from "./hub-directory-column-hints.js";
import { HUB_ROUTE_STATUS_ICON_SVGS } from "./hub-route-status-icons.js";
import { isHubTechnicalAuthEmail, looksLikeEmail } from "./vendor/hub-identity/hub-login.js";
import {
  formatAuthGateError,
  formatSyncError,
  isAuthTransportError,
  isJwtExpired,
  parseApiErrorBody,
  refreshAuthIfNeeded,
  requestHubPasswordReset,
  signInWorkspaceDual,
  updateExtensionUserPassword,
  userHeaders,
} from "./auth-session.js";
import { resolveHubUserModalProfile } from "./hub-workspace-profile-role.js";
import { bindCookieSharePanel, cookieShareQueryForWeb } from "./cookie-share-panel.js";
import {
  applyMultipleVaultsDirectFromPopup,
  applyVaultDirectFromPopup,
  hydrateCloudVaultStatusDirect,
  readDirectPopupAuth,
  syncBindingDirectFromPopup,
  syncMultipleBindingsDirectFromPopup,
} from "./popup-direct-ops.js";
import { createAndSyncActiveSessionRoute } from "./active-session-route.js";
import {
  applyHubUserZoomPct,
  HUB_USER_ZOOM_STEPS,
  hubUserZoomStepIndex,
  initHubUserZoom,
  readHubUserZoomPct,
} from "./hub-user-zoom-lite.js";

initHubUserZoom();
bindHubUiZoomControl();

function bindHubUiZoomControl() {
  const slider = document.getElementById("sidebar-zoom-slider");
  const pctEl = document.getElementById("sidebar-zoom-pct");
  const stepBtns = document.querySelectorAll(".settings-zoom-step-btn[data-zoom-step]");
  const resetZoomBtn = document.getElementById("settings-modal-reset-zoom");

  const syncUi = (pct) => {
    const next = Number(pct) || 90;
    const idx = hubUserZoomStepIndex(next);
    const maxIdx = HUB_USER_ZOOM_STEPS.length - 1;
    const fill = maxIdx > 0 ? (idx / maxIdx) * 100 : 0;
    if (slider) {
      slider.value = String(next);
      slider.style.setProperty("--hub-zoom-fill", `${fill}%`);
      slider.setAttribute("aria-label", `Display size ${next} percent`);
    }
    if (pctEl) pctEl.textContent = `${next}%`;
    stepBtns.forEach((btn) => {
      const stepVal = Number(btn.getAttribute("data-zoom-step"));
      const active = stepVal === next;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  };

  syncUi(readHubUserZoomPct());
  slider?.addEventListener("input", () => {
    syncUi(applyHubUserZoomPct(Number(slider.value)));
  });
  stepBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const stepVal = Number(btn.getAttribute("data-zoom-step")) || 90;
      syncUi(applyHubUserZoomPct(stepVal));
    });
  });
  resetZoomBtn?.addEventListener("click", () => {
    syncUi(applyHubUserZoomPct(90));
    showToast("Display zoom reset to 90%.", "info", 2000);
  });
  window.addEventListener("hub-user-zoom-change", (event) => {
    syncUi(event.detail?.pct ?? readHubUserZoomPct());
  });
}

const extensionLoginModal = document.getElementById("extension-login-modal");
const extensionLoginBackdrop = document.getElementById("extension-login-backdrop");
const extensionLoginForm = document.getElementById("extension-login-form");
const extensionLoginEmail = document.getElementById("extension-login-email");
const extensionLoginPassword = document.getElementById("extension-login-password");
const extensionLoginError = document.getElementById("extension-login-error");
const extensionLoginClose = document.getElementById("extension-login-close");
const extensionLoginSubmit = document.getElementById("extension-login-submit");
const extensionLoginTabSignin = document.getElementById("extension-login-tab-signin");
const extensionLoginTabSignup = document.getElementById("extension-login-tab-signup");
const extensionLoginForgot = document.getElementById("extension-login-forgot");
const extensionLoginContact = document.getElementById("extension-login-contact");
const extensionLoginProgress = document.getElementById("extension-login-progress");
const extensionLoginProgressLabel = document.getElementById("extension-login-progress-label");
const appShellEl = document.querySelector(".shell");

let loginModalResolver = null;
let sessionReadyCache = false;
let loginMode = "signin";
let initialAuthPromptDone = false;

const tbody = document.getElementById("bindings-body");
const emptyEl = document.getElementById("empty");
const openSettingsBtn = document.getElementById("open-settings");
const headerDirectModeBtn = document.getElementById("header-direct-mode-btn");
const headerDirectModeLabelEl = document.getElementById("header-direct-mode-label");
const sidebarUserBtn = document.getElementById("sidebar-user-btn");

let swDirectModeActive = false;

function setDirectModeActive(active) {
  const next = Boolean(active);
  if (swDirectModeActive === next && headerDirectModeBtn && headerDirectModeBtn.hidden === !next) {
    return;
  }
  swDirectModeActive = next;
  if (!headerDirectModeBtn) return;
  headerDirectModeBtn.hidden = !next;
  if (next && !headerDirectModeBtn.disabled && headerDirectModeLabelEl) {
    headerDirectModeLabelEl.textContent = "Direct · Reload";
  }
}

function reloadExtensionWorker() {
  if (!headerDirectModeBtn || headerDirectModeBtn.disabled) return;
  headerDirectModeBtn.disabled = true;
  if (headerDirectModeLabelEl) {
    headerDirectModeLabelEl.textContent = "Reloading...";
  }
  showToast("Reloading Cookie Bridge worker...", "info", 3000);
  pushTabActivity("Reloading extension worker");
  window.setTimeout(() => {
    try {
      if (typeof chrome?.runtime?.reload === "function") {
        chrome.runtime.reload();
        return;
      }
      window.location.reload();
    } catch (err) {
      headerDirectModeBtn.disabled = false;
      if (headerDirectModeLabelEl) {
        headerDirectModeLabelEl.textContent = "Direct · Reload";
      }
      showToast(String(err), "error", 4000);
    }
  }, 80);
}

headerDirectModeBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  reloadExtensionWorker();
});
const sidebarUserLabel = document.getElementById("sidebar-user-label");
const sidebarUserRoleIcon = document.getElementById("sidebar-user-role-icon");
const routeSearchInput = document.getElementById("route-search");
const routeSearchClear = document.getElementById("route-search-clear");
const routeSearchKbdEl = document.getElementById("route-search-kbd");
const routeSelectionBadgeEl = document.getElementById("route-selection-badge");
const routeCountEl = document.getElementById("route-count");
const routeCountTextEl = document.getElementById("route-count-text");
const routeFilterResetBtnEl = document.getElementById("route-filter-reset-btn");
const routeFilterResetCountEl = document.getElementById("route-filter-reset-count");
const routeNewSessionBtnEl = document.getElementById("route-new-session-btn");
const routeNewSessionLabelEl = document.getElementById("route-new-session-label");
const routeBulkSyncBtnEl = document.getElementById("route-bulk-sync-btn");
const routeBulkSyncLabelEl = document.getElementById("route-bulk-sync-label");
const routeBulkLoadBtnEl = document.getElementById("route-bulk-load-btn");
const routeBulkLoadLabelEl = document.getElementById("route-bulk-load-label");
let bulkRouteOpInFlight = false;
let createSessionRouteInFlight = false;
const routeTablePagerEl = document.getElementById("route-table-pager");
const routePagePrevBtn = document.getElementById("route-page-prev");
const routePageNextBtn = document.getElementById("route-page-next");
const routePageLabelEl = document.getElementById("route-page-label");
const tableWrapEl = document.querySelector(".table-wrap");
const applyProgressModal = document.getElementById("apply-progress-modal");
const applyProgressTitle = document.getElementById("apply-progress-title");
const applyProgressSubtitle = document.getElementById("apply-progress-subtitle");
const applyStepVault = document.getElementById("apply-step-vault");
const applyStepWrite = document.getElementById("apply-step-write");
const applyStepVerify = document.getElementById("apply-step-verify");
const sidebarNavRoutesBtnEl = document.getElementById("sidebar-nav-routes");
const sidebarNavCookieBtnEl = document.getElementById("sidebar-nav-cookie");
const tabPanelRoutesEl = document.getElementById("tab-panel-routes");
const tabPanelCookieEl = document.getElementById("tab-panel-cookie");
const headerTabIconEl = document.getElementById("header-tab-icon");
const headerTabTitleEl = document.getElementById("header-tab-title");
const cookieJarSearchInputEl = document.getElementById("cookie-jar-search");
const cookieJarSearchClearEl = document.getElementById("cookie-jar-search-clear");
const cookieJarSearchKbdEl = document.getElementById("cookie-jar-search-kbd");
const cookieJarCountEl = document.getElementById("cookie-jar-count");
const cookieJarCountTextEl = document.getElementById("cookie-jar-count-text");
const cookieFilterResetBtnEl = document.getElementById("cookie-filter-reset-btn");
const cookieFilterResetCountEl = document.getElementById("cookie-filter-reset-count");
const cookieBulkSelectionBadgeEl = document.getElementById("cookie-bulk-selection-badge");
const cookieBulkImportBtnEl = document.getElementById("cookie-bulk-import-btn");
const cookieBulkClearSelectedBtnEl = document.getElementById("cookie-bulk-clear-selected-btn");
const cookieBulkClearSelectedLabelEl = document.getElementById("cookie-bulk-clear-selected-label");
const cookieBulkClearActiveBtnEl = document.getElementById("cookie-bulk-clear-active-btn");
const cookieBulkClearActiveLabelEl = document.getElementById("cookie-bulk-clear-active-label");
const cookieBulkClearActiveDomainEl = document.getElementById("cookie-bulk-clear-active-domain");
const cookieSelectAllEl = document.getElementById("cookie-select-all");
const cookieJarBodyEl = document.getElementById("cookie-jar-body");
const cookieJarEmptyEl = document.getElementById("cookie-jar-empty");
const cookieJarTableWrapEl = document.getElementById("cookie-table-wrap");
const cookieJarPagerEl = document.getElementById("cookie-jar-pager");
const cookiePagePrevBtn = document.getElementById("cookie-page-prev");
const cookiePageNextBtn = document.getElementById("cookie-page-next");
const cookiePageMetaEl = document.getElementById("cookie-page-label");
const cookieImportPanelEl = document.getElementById("cookie-import-panel");
const cookieImportDomainInputEl = document.getElementById("cookie-import-domain");
const cookieImportTextareaEl = document.getElementById("cookie-import-textarea");
const cookieImportReplaceCbEl = document.getElementById("cookie-import-replace-cb");
const cookieImportStatusEl = document.getElementById("cookie-import-status");
const cookieImportSubmitBtnEl = document.getElementById("cookie-import-submit");
const cookieImportCancelBtnEl = document.getElementById("cookie-import-cancel");
const cookieImportCloseBtnEl = document.getElementById("cookie-import-close");
const cookieImportPasteBtnEl = document.getElementById("cookie-import-paste-btn");
const settingsModalEl = document.getElementById("settings-modal");
const APPLY_LOCK_MIN_MS = 5000;
/** Max route rows in popup — sorted by latest sync (no table scroll). */
const MAX_VISIBLE_ROUTES = 8;
const MAX_VISIBLE_COOKIE_ROWS = 8;

let routePageIndex = 0;
let cookieJarPageIndex = 0;
let activeNavTab = "routes";
let activeTabDetectedDomain = "";
let clearSiteInFlight = false;
let cookieSiteItems = [];
let visibleCookieSiteDomains = [];
let selectedCookieSites = new Set();
let lastSelectedCookieSiteIndex = -1;
const cookieFilters = {
  query: "",
  platform: "all",
  tab: "all",
  sso: "all",
  cookies: "all",
};

let lastBindings = [];
let selectedNoteId = null;
let selectedNoteIds = new Set();
let visibleRouteNoteIds = [];
let lastSelectedRouteIndex = -1;
let isRouteDragging = false;
let lastBindingStatus = {};
let lastVaultOnServer = {};
let lastNoteSyncedAtByNoteId = {};
let lastRouteUserActivityByKey = {};
let lastBannerKey = "";
let currentBrowserId = "";
let currentUserId = "";
let currentDataUserId = "";
let currentHubUserId = "";
let currentUserEmail = "";
let currentUserDisplayLabel = "";
let currentUserLoginId = "";
let currentUserFullName = "";
let currentUserPhone = "";
let currentUserRole = "";
let currentUserProvider = "";
let currentUserCreatedAt = "";
let currentUserLastSignInAt = "";
let lastToolRelay = null;
let applyLockStartedAt = 0;
let applyStageTimers = [];
const ACTIVITY_RELATIVE_TICK_MS = 60_000;
let activityRelativeTickId = null;
const routeFilters = {
  query: "",
  platform: "all",
  role: "all",
  vault: "all",
  source: "all",
};

const ICONS = {
  ...HUB_ROUTE_STATUS_ICON_SVGS,
  access: '<svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
  external: '<svg viewBox="0 0 24 24"><path d="M14 3h7v7"/><path d="M21 3 10 14"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  layers: '<svg viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/><path d="m3 18 9 5 9-5"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  key: '<svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M12 13.5 20 5.5"/><path d="M17 5.5h3v3"/><path d="m16 8 2 2"/></svg>',
  crown: '<svg viewBox="0 0 24 24"><path d="m2 8 4 2 3-5 3 5 3-5 3 5 4-2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  stickyNote: '<svg viewBox="0 0 24 24"><path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9Z"/><path d="M15 3v6h6"/></svg>',
  logout:
    '<svg viewBox="0 0 24 24"><path d="M10 17l-1 0a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h1"/><path d="M15 7l5 5-5 5"/><path d="M20 12H10"/></svg>',
  route: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a13.5 13.5 0 0 1 0 18"/><path d="M12 3a13.5 13.5 0 0 0 0 18"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6l-7-3Z"/></svg>',
  status: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  sync: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-15.5-6.2L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.2L21 16"/><path d="M21 21v-5h-5"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  userPlus:
    '<svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="4"/><path d="M2 21a8 8 0 0 1 13-6"/><path d="M19 8v6"/><path d="M16 11h6"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  userRound:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>',
  vault: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9v6"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  fileText:
    '<svg viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L8.1 9.6a16 16 0 0 0 6.3 6.3l1.2-1.2a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 16.9Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  fingerprint: '<svg viewBox="0 0 24 24"><path d="M12 10a4 4 0 0 1 4 4"/><path d="M12 6a8 8 0 0 1 8 8"/><path d="M12 14v4"/><path d="M8 10.2A4 4 0 0 0 8 18"/><path d="M4.6 9A8 8 0 0 0 6 20"/></svg>',
  gauge: '<svg viewBox="0 0 24 24"><path d="M12 14 16 8"/><path d="M4 14a8 8 0 1 1 16 0"/></svg>',
  message: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H5l-2 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  cookie:
    '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/></svg>',
};

const THESVG_CDN = "https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons";

function platformValueForItem(item) {
  if (item.source?.slug) return item.source.slug;
  return (
    item.label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "other"
  );
}

function brandSrcForRegistryItem(item) {
  if (item.source.type === "thesvg") {
    return `${THESVG_CDN}/${item.source.slug}/default.svg`;
  }
  return item.source.extensionSrc || "";
}

function platformOptionForKey(platformKey) {
  const item = COOKIE_BRAND_ICON_REGISTRY.find((entry) => platformValueForItem(entry) === platformKey);
  if (item) {
    return {
      value: platformKey,
      label: item.label,
      brandSrc: brandSrcForRegistryItem(item),
    };
  }
  if (platformKey === "other") return { value: "other", label: "Other", icon: "route" };
  return { value: platformKey, label: platformKey, icon: "route" };
}

function enabledRouteBindings(bindings) {
  return (bindings || []).filter((b) => b.domain?.trim() && (b.syncId?.trim() || b.noteId?.trim()));
}

/** Platforms present on current routes only (not full registry). */
function buildPlatformFilterOptionsFromBindings(bindings) {
  const keys = new Set();
  for (const binding of enabledRouteBindings(bindings)) {
    keys.add(platformKeyForDomain(binding.domain));
  }
  return Array.from(keys)
    .map((key) => platformOptionForKey(key))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/** P0020 cookie-stickers + packages/hub-ui hub-directory-stickers — do not fork. */
const FILTER_TRIGGER_EMOJI = {
  platform: "🔗\uFE0F",
  role: "🛡️",
  vault: "🗄️",
  source: "🔒",
};

const FILTER_OPTION_CATALOG = {
  role: [
    { value: "owner", label: "Owner", emoji: "🛡️" },
    { value: "source", label: "Source", emoji: "👤" },
    { value: "readonly", label: "Read-only", emoji: "🔒" },
  ],
  vault: [
    { value: "has-vault", label: "Has vault", emoji: "🗄️" },
    { value: "no-vault", label: "No vault", emoji: "⭕" },
  ],
  source: [
    { value: "locked", label: "Locked", emoji: "🔒" },
    { value: "owner", label: "Owner", emoji: "🛡️" },
    { value: "unset", label: "Unset", emoji: "⭕" },
  ],
};

function catalogOptionsForValues(catalog, values) {
  const wanted = new Set(values);
  return catalog.filter((option) => wanted.has(option.value));
}

function buildRoleFilterOptionsFromBindings(bindings) {
  const keys = new Set();
  for (const binding of enabledRouteBindings(bindings)) {
    keys.add(bindingRoleInfo(binding).roleFilter);
  }
  return catalogOptionsForValues(FILTER_OPTION_CATALOG.role, keys);
}

function buildVaultFilterOptionsFromBindings(bindings, vaultOnServer) {
  const keys = new Set();
  for (const binding of enabledRouteBindings(bindings)) {
    const key = bindingKey(binding);
    const vaultProbe = vaultOnServer?.[key] ?? vaultOnServer?.[binding.syncId] ?? {};
    keys.add(vaultProbe?.hasVault ? "has-vault" : "no-vault");
  }
  return catalogOptionsForValues(FILTER_OPTION_CATALOG.vault, keys);
}

function buildSourceFilterOptionsFromBindings(bindings) {
  const keys = new Set();
  for (const binding of enabledRouteBindings(bindings)) {
    keys.add(bindingRoleInfo(binding).sourceFilter);
  }
  return catalogOptionsForValues(FILTER_OPTION_CATALOG.source, keys);
}

function reopenFilterDropdownIfNeeded(container) {
  if (!container.classList.contains("is-open")) return;
  const panel = container.querySelector(".filter-dd-panel");
  const trigger = container.querySelector(".filter-dd-trigger");
  if (panel) panel.hidden = false;
  trigger?.setAttribute("aria-expanded", "true");
  positionOpenFilterPanel(container);
}

function refreshFilterDropdownDom(filterKey) {
  document.querySelectorAll(`.route-filter-dd[data-filter="${filterKey}"]`).forEach((el) => {
    const search = el.querySelector(".filter-dd-search input")?.value || "";
    const wasOpen = el.classList.contains("is-open");
    renderFilterDropdown(el, search);
    if (wasOpen) {
      el.classList.add("is-open");
      reopenFilterDropdownIfNeeded(el);
    }
  });
}

function updateFilterOptions(filterKey, nextOptions) {
  const def = FILTER_DEFS[filterKey];
  if (!def) return;
  const prevValues = def.options.map((option) => option.value).join("\0");
  const nextValues = nextOptions.map((option) => option.value).join("\0");
  def.options = nextOptions;
  if (routeFilters[filterKey] !== "all") {
    const valid = new Set(nextOptions.map((option) => option.value));
    if (!valid.has(routeFilters[filterKey])) routeFilters[filterKey] = "all";
  }
  if (prevValues !== nextValues) refreshFilterDropdownDom(filterKey);
}

function syncDynamicFilterOptions(bindings, vaultOnServer) {
  updateFilterOptions("platform", buildPlatformFilterOptionsFromBindings(bindings));
  updateFilterOptions("role", buildRoleFilterOptionsFromBindings(bindings));
  updateFilterOptions("vault", buildVaultFilterOptionsFromBindings(bindings, vaultOnServer ?? {}));
  updateFilterOptions("source", buildSourceFilterOptionsFromBindings(bindings));
}

function platformKeyForDomain(domain) {
  const host = String(domain || "")
    .replace(/^\./, "")
    .toLowerCase();
  for (const item of COOKIE_BRAND_ICON_REGISTRY) {
    if (new RegExp(item.match, "i").test(host)) return platformValueForItem(item);
  }
  return "other";
}

function filterOptionGlyph(option, def) {
  if (option?.brandSrc) {
    return `<img class="filter-brand-icon" src="${escapeHtml(option.brandSrc)}" alt="" />`;
  }
  const emoji = option?.emoji || def.triggerEmoji;
  if (emoji) {
    return `<span class="hub-filter-option-emoji" aria-hidden="true">${emoji}</span>`;
  }
  return icon(option?.icon || def.icon);
}

const FILTER_DEFS = {
  platform: {
    label: "Platform",
    triggerEmoji: FILTER_TRIGGER_EMOJI.platform,
    searchPlaceholder: "Search platform...",
    options: [],
  },
  role: {
    label: "Role",
    triggerEmoji: FILTER_TRIGGER_EMOJI.role,
    searchPlaceholder: "Search role...",
    options: [],
  },
  vault: {
    label: "Vault",
    triggerEmoji: FILTER_TRIGGER_EMOJI.vault,
    searchPlaceholder: "Search vault...",
    options: [],
  },
  source: {
    label: "Access",
    triggerEmoji: FILTER_TRIGGER_EMOJI.source,
    searchPlaceholder: "Search access...",
    options: [],
  },
};

function icon(name, className = "ui-icon") {
  return `<span class="${className}" aria-hidden="true">${ICONS[name] ?? ""}</span>`;
}

function siteIcon(domain) {
  const host = String(domain || "").replace(/^\./, "").toLowerCase();
  const hit = COOKIE_BRAND_ICON_REGISTRY.find((item) => new RegExp(item.match, "i").test(host));
  if (!hit) return null;
  const src =
    hit.source.type === "thesvg"
      ? `${THESVG_CDN}/${hit.source.slug}/default.svg`
      : hit.source.extensionSrc;
  return { label: hit.label, src };
}

function parseBuildUpdatedMs(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const raw = String(value).trim();
  if (!raw) return null;
  const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Hub chrome age — 5 buckets (HubChromeActivityAge). */
function headerChromeAgeHubTone(ms, now = Date.now()) {
  const age = Math.max(0, now - ms);
  if (age <= ACTIVITY_HOUR_MS) return "age-recent";
  if (age <= ACTIVITY_DAY_MS) return "age-aging";
  if (age <= 3 * ACTIVITY_DAY_MS) return "age-days";
  if (age <= 7 * ACTIVITY_DAY_MS) return "age-week";
  return "age-stale";
}

function formatHeaderChromeAgeLabel(ms, now = Date.now()) {
  const ageMs = Math.max(0, now - ms);
  const ageSec = Math.floor(ageMs / 1000);
  if (ageSec < 60) return "Just now";
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m ago`;
  const ageHr = Math.floor(ageMin / 60);
  if (ageHr < 24) return `${ageHr}h ago`;
  return `${Math.floor(ageHr / 24)}d ago`;
}

function renderVersionMeta(version) {
  const versionEl = document.getElementById("ver-meta-version");
  const ageWrap = document.getElementById("ver-meta-age");
  const ageDot = document.getElementById("ver-meta-age-dot");
  const ageLabel = document.getElementById("ver-meta-age-label");
  if (!versionEl) return;
  const v = version || chrome.runtime.getManifest().version;
  versionEl.textContent = `v${v}`;
  const ms = parseBuildUpdatedMs(window.E0001_BUILD?.updated);
  if (ms == null || !ageWrap || !ageDot || !ageLabel) {
    if (ageWrap) ageWrap.hidden = true;
    return;
  }
  const tone = headerChromeAgeHubTone(ms);
  ageLabel.textContent = formatHeaderChromeAgeLabel(ms);
  ageDot.className = `hub-chrome-activity-age__dot hub-chrome-activity-age__dot--${tone}`;
  ageWrap.hidden = false;
}

function hydrateStaticIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.getAttribute("data-icon");
    if (!name || el.querySelector(".ui-icon")) return;
    el.insertAdjacentHTML("afterbegin", icon(name));
  });
}

function applyDirectoryTableHeaderIcons() {
  document.querySelectorAll(".routes-table thead th[data-col-hint]").forEach((th) => {
    const key = th.dataset.colHint;
    const label = th.querySelector(".th-label");
    if (!label) return;
    const emoji = COOKIE_BRIDGE_ROUTE_TABLE_HEADER_EMOJI[key];
    if (emoji) {
      if (!label.querySelector(".hub-users-th-emoji")) {
        label.insertAdjacentHTML(
          "afterbegin",
          `<span class="hub-users-th-emoji" aria-hidden="true">${emoji}</span>`,
        );
      }
      return;
    }
    const iconName = COOKIE_BRIDGE_ROUTE_TABLE_HEADER_ICONS[key];
    if (iconName) label.setAttribute("data-icon", iconName);
  });
}

function initDirectoryColumnHeaderHints() {
  mountDirectoryColumnHints(
    document.querySelector(".routes-table thead"),
    COOKIE_BRIDGE_ROUTE_TABLE_COLUMN_HINTS,
    { renderIcon: (name, className) => icon(name, className) },
  );
}

function resetFilterPanelPosition(container) {
  const panel = container?.querySelector(".filter-dd-panel");
  if (!panel) return;
  panel.classList.remove("filter-dd-panel--floating");
  panel.style.left = "";
  panel.style.top = "";
  panel.style.width = "";
  panel.style.maxHeight = "";
  const list = panel.querySelector(".filter-dd-list");
  if (list) list.style.maxHeight = "";
}

function positionOpenFilterPanel(container) {
  const panel = container.querySelector(".filter-dd-panel");
  const trigger = container.querySelector(".filter-dd-trigger");
  if (!panel || !trigger || panel.hidden) return;
  const rect = trigger.getBoundingClientRect();
  const panelW = 260;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelW - 8));
  const top = rect.bottom + 6;
  const maxH = Math.min(360, Math.max(160, window.innerHeight - top - 12));
  panel.classList.add("filter-dd-panel--floating");
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.width = `${panelW}px`;
  panel.style.maxHeight = `${maxH}px`;
  const list = panel.querySelector(".filter-dd-list");
  if (list) list.style.maxHeight = `${Math.max(120, maxH - 52)}px`;
}

function closeFilterDropdowns(except = null) {
  document.querySelectorAll(".route-filter-dd.is-open").forEach((el) => {
    if (except && el === except) return;
    el.classList.remove("is-open");
    el.querySelector(".filter-dd-trigger")?.setAttribute("aria-expanded", "false");
    const panel = el.querySelector(".filter-dd-panel");
    if (panel) panel.hidden = true;
    resetFilterPanelPosition(el);
  });
  if (!except) document.body.classList.remove("body--filter-dd-open");
}

function renderHubResultCount(badgeEl, textEl, shown, total, unitLabel) {
  if (!badgeEl) return;
  badgeEl.title = `${shown} of ${total} ${unitLabel} shown`;
  if (textEl) {
    textEl.innerHTML = `${shown}<span class="hub-result-count__slash">/</span>${total}`;
  } else {
    badgeEl.textContent = `${shown}/${total}`;
  }
}

function activeRouteFilterCount() {
  let n = routeFilters.query.trim() ? 1 : 0;
  if (routeFilters.platform !== "all") n += 1;
  if (routeFilters.role !== "all") n += 1;
  if (routeFilters.vault !== "all") n += 1;
  if (routeFilters.source !== "all") n += 1;
  return n;
}

function selectedRouteBindings() {
  if (!selectedNoteIds.size) return [];
  return enabledRouteBindings(lastBindings).filter((b) => b.noteId && selectedNoteIds.has(b.noteId));
}

function syncRouteToolbarUi() {
  if (routeSearchClear) routeSearchClear.hidden = !routeFilters.query;
  if (routeSearchKbdEl) routeSearchKbdEl.hidden = Boolean(routeFilters.query);
  const activeCount = activeRouteFilterCount();
  if (routeFilterResetBtnEl) routeFilterResetBtnEl.hidden = activeCount === 0;
  if (routeFilterResetCountEl) routeFilterResetCountEl.textContent = String(activeCount);
  const selBindings = selectedRouteBindings();
  const selCount = selBindings.length;
  const syncableCount = selBindings.filter((b) => bindingRoleInfo(b).canSync).length;
  if (routeSelectionBadgeEl) {
    routeSelectionBadgeEl.hidden = selCount === 0;
    routeSelectionBadgeEl.textContent = `${selCount} selected`;
  }
  if (routeNewSessionBtnEl) {
    routeNewSessionBtnEl.disabled = bulkRouteOpInFlight || createSessionRouteInFlight;
    routeNewSessionBtnEl.title = activeTabDetectedDomain
      ? `Auto-create and sync a route for active tab (${activeTabDetectedDomain})`
      : "Auto-create and sync a route for the active website tab and account";
  }
  if (routeNewSessionLabelEl) {
    routeNewSessionLabelEl.textContent = createSessionRouteInFlight ? "Creating..." : "New";
  }
  if (routeBulkSyncBtnEl) {
    routeBulkSyncBtnEl.disabled =
      bulkRouteOpInFlight || createSessionRouteInFlight || syncableCount === 0;
  }
  if (routeBulkSyncLabelEl) {
    routeBulkSyncLabelEl.textContent = `Sync (${syncableCount})`;
  }
  if (routeBulkLoadBtnEl) {
    routeBulkLoadBtnEl.disabled =
      bulkRouteOpInFlight || createSessionRouteInFlight || selCount === 0;
  }
  if (routeBulkLoadLabelEl) {
    routeBulkLoadLabelEl.textContent = `Load (${selCount})`;
  }
}

function resetAllRouteFilters() {
  routeFilters.query = "";
  routeFilters.platform = "all";
  routeFilters.role = "all";
  routeFilters.vault = "all";
  routeFilters.source = "all";
  if (routeSearchInput) routeSearchInput.value = "";
  resetRoutePage();
  document.querySelectorAll(".route-filter-dd[data-filter]").forEach((el) => renderFilterDropdown(el));
  renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
}

function renderSharedFilterDropdown(container, search = "", config) {
  const { key, defs, state, attrName, onSelect } = config;
  const def = defs[key];
  if (!def) return;
  const selected = state[key] || "all";
  const isActive = selected !== "all";
  const iconOnly = container.dataset.iconOnly === "true";
  const selectedOption = def.options.find((option) => option.value === selected);
  const label = selectedOption ? selectedOption.label : def.label;
  const triggerTitle = isActive ? `${def.label}: ${label}` : `Filter by ${def.label}`;
  const filterText = search.trim().toLowerCase();
  const options = def.options.filter(
    (option) => !filterText || option.label.toLowerCase().includes(filterText),
  );

  container.innerHTML = `
    <button type="button" class="filter-dd-trigger${iconOnly ? " filter-dd-trigger--icon-only" : ""}${isActive ? " is-active" : ""}" title="${escapeHtml(triggerTitle)}" aria-label="${escapeHtml(`${def.label}: ${label}`)}" aria-expanded="false">
      ${filterOptionGlyph(selectedOption, def)}
      ${
        iconOnly
          ? isActive
            ? '<span class="filter-dd-count">1</span>'
            : ""
          : `<span class="filter-dd-label">${escapeHtml(label)}</span>`
      }
      ${icon("chevron", "ui-icon filter-chevron")}
    </button>
    <div class="filter-dd-panel" hidden>
      <div class="filter-dd-search">
        ${icon("search")}
        <input type="search" value="${escapeHtml(search)}" placeholder="${escapeHtml(def.searchPlaceholder)}" />
      </div>
      <div class="filter-dd-list">
        <button type="button" class="filter-dd-option ${selected === "all" ? "is-selected" : ""}" data-value="all">
          <span class="filter-circle">${selected === "all" ? "✓" : ""}</span>
          ${filterOptionGlyph(null, def)}
          <span class="filter-option-label">${escapeHtml(def.label)}</span>
          <span class="filter-option-count">${def.options.length}</span>
        </button>
        <div class="filter-dd-divider"></div>
        ${
          options.length
            ? options
                .map(
                  (option) => `
                    <button type="button" class="filter-dd-option ${selected === option.value ? "is-selected" : ""}" data-value="${escapeHtml(option.value)}">
                      <span class="filter-circle">${selected === option.value ? "✓" : ""}</span>
                      ${filterOptionGlyph(option, def)}
                      <span class="filter-option-label">${escapeHtml(option.label)}</span>
                    </button>
                  `,
                )
                .join("")
            : '<div class="filter-dd-empty">No matches</div>'
        }
      </div>
    </div>
  `;

  const trigger = container.querySelector(".filter-dd-trigger");
  const panel = container.querySelector(".filter-dd-panel");
  const input = container.querySelector(".filter-dd-search input");
  trigger?.addEventListener("click", (event) => {
    event.stopPropagation();
    const shouldOpen = !container.classList.contains("is-open");
    closeFilterDropdowns(container);
    container.classList.toggle("is-open", shouldOpen);
    trigger.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    if (panel) panel.hidden = !shouldOpen;
    if (shouldOpen) {
      document.body.classList.add("body--filter-dd-open");
      window.setTimeout(() => {
        positionOpenFilterPanel(container);
        input?.focus();
      }, 0);
    } else {
      resetFilterPanelPosition(container);
      if (!document.querySelector(".route-filter-dd.is-open")) {
        document.body.classList.remove("body--filter-dd-open");
      }
    }
  });
  panel?.addEventListener("click", (event) => event.stopPropagation());
  input?.addEventListener("input", (event) => {
    renderSharedFilterDropdown(container, event.target.value || "", config);
    container.classList.add("is-open");
    const nextPanel = container.querySelector(".filter-dd-panel");
    if (nextPanel) nextPanel.hidden = false;
    container.querySelector(".filter-dd-trigger")?.setAttribute("aria-expanded", "true");
    const nextInput = container.querySelector(".filter-dd-search input");
    nextInput?.focus();
    nextInput?.setSelectionRange(nextInput.value.length, nextInput.value.length);
  });
  container.querySelectorAll(".filter-dd-option").forEach((button) => {
    button.addEventListener("click", () => {
      state[key] = button.dataset.value || "all";
      closeFilterDropdowns();
      document
        .querySelectorAll(`.route-filter-dd[${attrName}="${key}"]`)
        .forEach((el) => renderSharedFilterDropdown(el, "", config));
      onSelect();
    });
  });
}

function renderFilterDropdown(container, search = "") {
  renderSharedFilterDropdown(container, search, {
    key: container.dataset.filter,
    defs: FILTER_DEFS,
    state: routeFilters,
    attrName: "data-filter",
    onSelect: () => {
      resetRoutePage();
      renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
    },
  });
}

function initFilterDropdowns() {
  document.querySelectorAll(".route-filter-dd[data-filter]").forEach((container) => renderFilterDropdown(container));
  routeFilterResetBtnEl?.addEventListener("click", () => resetAllRouteFilters());
  document.addEventListener("click", () => closeFilterDropdowns());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeFilterDropdowns();
  });
  document.querySelectorAll(".body-scroll").forEach((scrollEl) => {
    scrollEl.addEventListener(
      "scroll",
      () => {
        document.querySelectorAll(".route-filter-dd.is-open").forEach((el) => positionOpenFilterPanel(el));
      },
      { passive: true },
    );
  });
  window.addEventListener("resize", () => {
    document.querySelectorAll(".route-filter-dd.is-open").forEach((el) => positionOpenFilterPanel(el));
  });
}

function setApplyLocked(locked, binding = null) {
  if (locked) {
    applyLockStartedAt = Date.now();
    startApplyStageTimeline();
    document.body.classList.add("is-apply-locked");
    if (applyProgressTitle) applyProgressTitle.textContent = "Applying cookies";
    if (applyProgressSubtitle) {
      const title = binding?.noteTitle || binding?.domain || "selected route";
      applyProgressSubtitle.textContent = `${title} · keep the browser tab open for about 5 seconds.`;
    }
    if (applyProgressModal) applyProgressModal.hidden = false;
    return Promise.resolve();
  }
  const elapsed = Date.now() - applyLockStartedAt;
  const waitMs = Math.max(0, APPLY_LOCK_MIN_MS - elapsed);
  return new Promise((resolve) => {
    window.setTimeout(() => {
      document.body.classList.remove("is-apply-locked");
      if (applyProgressModal) applyProgressModal.hidden = true;
      clearApplyStageTimeline();
      resolve();
    }, waitMs);
  });
}

function clearApplyStageTimeline() {
  applyStageTimers.forEach((timer) => window.clearTimeout(timer));
  applyStageTimers = [];
}

function setApplyStage(stage) {
  const states = {
    vault: ["is-active", "is-pending", "is-pending"],
    write: ["is-done", "is-active", "is-pending"],
    verify: ["is-done", "is-done", "is-active"],
    done: ["is-done", "is-done", "is-done"],
  }[stage] ?? ["is-active", "is-pending", "is-pending"];
  [applyStepVault, applyStepWrite, applyStepVerify].forEach((el, index) => {
    if (!el) return;
    el.classList.remove("is-active", "is-done", "is-pending");
    el.classList.add(states[index]);
  });
}

function startApplyStageTimeline() {
  clearApplyStageTimeline();
  setApplyStage("vault");
  applyStageTimers = [
    window.setTimeout(() => setApplyStage("write"), 1100),
    window.setTimeout(() => setApplyStage("verify"), 3900),
    window.setTimeout(() => setApplyStage("done"), 5200),
  ];
}

function getSelectedBinding() {
  if (selectedNoteId) {
    const hit = lastBindings.find((b) => b.noteId === selectedNoteId);
    if (hit) return hit;
  }
  return lastBindings.find((b) => b.domain?.trim() && (b.syncId?.trim() || b.noteId?.trim()));
}

function setSelectedNoteId(noteId) {
  selectedNoteId = noteId || null;
  void chrome.storage.local.set({ [STORAGE_SELECTED_BINDING]: selectedNoteId }).catch(() => null);
  chrome.runtime.sendMessage({ type: "SET_SELECTED_BINDING", noteId: selectedNoteId }, () => {
    void chrome.runtime.lastError;
  });
}

function setPrimarySelectedNoteId(noteId) {
  selectedNoteId = noteId || null;
  void chrome.storage.local.set({ [STORAGE_SELECTED_BINDING]: selectedNoteId }).catch(() => null);
  chrome.runtime.sendMessage({ type: "SET_SELECTED_BINDING", noteId: selectedNoteId }, () => {
    void chrome.runtime.lastError;
  });
}

function routeAccessContext() {
  return {
    browserId: currentBrowserId,
    userId: currentDataUserId || currentUserId,
    dataUserId: currentDataUserId || currentUserId,
    hubIdentityUserId: currentHubUserId,
    userEmail: currentUserDisplayLabel || currentUserEmail,
  };
}

function bindingRoleInfo(binding) {
  return resolveBindingRoleInfo(binding, routeAccessContext());
}

function openCookieShareOnWeb(binding) {
  const query = cookieShareQueryForWeb(binding);
  chrome.runtime.sendMessage({ type: "OPEN_TOOL_COOKIE", url: "prod", query }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      const prod = window.E0001_BUILD?.toolProd;
      if (prod) chrome.tabs.create({ url: `${prod}${prod.includes("?") ? "&" : "?"}${query}` });
    }
  });
}

const cookieSharePanel = bindCookieSharePanel({
  showToast,
  openOnWeb: openCookieShareOnWeb,
  currentLoginId: () => currentUserLoginId,
});


function formatVaultUser(probe, st) {
  const raw = probe?.updatedBy ?? st?.vaultUpdatedBy ?? null;
  if (!raw) return "—";
  const s = String(raw);
  if (s.length <= 28) return s;
  return `${s.slice(0, 26)}…`;
}

function shortId(id) {
  const s = String(id ?? "").trim();
  return s ? s.slice(0, 8) : "";
}

function formatRouteOwner(binding) {
  const ownerId = String(binding?.ownerUserId ?? "").trim();
  const ownerEmail = String(binding?.ownerUserEmail ?? "").trim();
  const label =
    ownerEmail
      ? ownerEmail
      : ownerId && currentUserId && ownerId === currentUserId
        ? currentUserDisplayLabel || currentUserEmail || shortId(ownerId)
        : ownerId
          ? shortId(ownerId)
          : binding?.accessRole === "owner" && (currentUserDisplayLabel || currentUserEmail)
            ? currentUserDisplayLabel || currentUserEmail
            : "—";
  return label;
}

function routeOwnerTitle(binding, vaultProbe, status, userActivity) {
  const parts = [];
  const ownerId = String(binding?.ownerUserId ?? "").trim();
  const ownerEmail = String(binding?.ownerUserEmail ?? "").trim();
  if (ownerEmail) parts.push(`Owner email: ${ownerEmail}`);
  if (ownerId) parts.push(`Owner: ${ownerId}`);
  const userSync =
    status?.userSyncedAt?.trim() ||
    userActivity?.lastSyncAt?.trim() ||
    null;
  if (userSync) parts.push(`Your last Sync: ${userSync}`);
  const userLoad = userActivity?.lastLoadAt?.trim();
  if (userLoad) parts.push(`Your last Load: ${userLoad}`);
  return parts.join(" · ");
}

function formatRouteUserCell(binding) {
  return `<span class="hub-directory-body-value">${escapeHtml(formatRouteOwner(binding))}</span>`;
}

const ACTIVITY_HOUR_MS = 60 * 60 * 1000;
const ACTIVITY_DAY_MS = 24 * ACTIVITY_HOUR_MS;

function parseActivityMs(iso) {
  if (!iso?.trim()) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function activityAgeTone(ms) {
  const age = Math.max(0, Date.now() - ms);
  if (age <= ACTIVITY_HOUR_MS) return "fresh";
  if (age <= ACTIVITY_DAY_MS) return "recent";
  return "stale";
}

function activityHubToneClass(tone) {
  if (tone === "fresh") return "active";
  if (tone === "recent") return "idle";
  return "offline";
}

function formatActivityRelativeAge(ms) {
  const ageMs = Math.max(0, Date.now() - ms);
  const ageSec = Math.floor(ageMs / 1000);
  if (ageSec < 60) return "just now";
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m ago`;
  const ageHr = Math.floor(ageMin / 60);
  return `${ageHr}h ago`;
}

function formatActivityStaleLabel(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear() % 100).padStart(2, "0");
    return `${dd}/${MM}/${yy}`;
  } catch {
    return String(iso).slice(0, 10);
  }
}

function formatActivityTimeLabel(iso) {
  const ms = parseActivityMs(iso);
  if (ms == null) return { label: "—", toneClass: "offline" };
  const tone = activityAgeTone(ms);
  const label = tone === "stale" ? formatActivityStaleLabel(iso) : formatActivityRelativeAge(ms);
  return {
    label,
    toneClass: activityHubToneClass(tone),
  };
}

function formatActivityTimeHtml(iso) {
  const { label, toneClass } = formatActivityTimeLabel(iso);
  if (label === "—") return "—";
  return `<span class="hub-directory-timestamp activity-time"><span class="activity-time-dot activity-time-dot--${toneClass}" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
}

function ensureActivityRelativeTick() {
  if (activityRelativeTickId != null) return;
  activityRelativeTickId = setInterval(() => {
    if (document.hidden || !lastBindings.length) return;
    renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
  }, ACTIVITY_RELATIVE_TICK_MS);
}

function stopActivityRelativeTick() {
  if (activityRelativeTickId == null) return;
  clearInterval(activityRelativeTickId);
  activityRelativeTickId = null;
}

/** Synced column — cloud `notes.synced_at` (same as Cookie Bridge); vault time is separate metadata. */
function resolveSyncedDisplay(status, vaultProbe, noteSyncedAt, userActivity) {
  const iso =
    noteSyncedAt?.trim() ||
    status?.cloudSyncedAt?.trim() ||
    status?.userSyncedAt?.trim() ||
    userActivity?.ownerSyncAt?.trim() ||
    status?.pushedAt?.trim() ||
    "";
  return { iso, label: iso ? formatActivityTimeLabel(iso).label : "—" };
}

function syncedSortMs(status, vaultProbe, noteSyncedAt, userActivity) {
  const iso = resolveSyncedDisplay(status, vaultProbe, noteSyncedAt, userActivity).iso;
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function resetRoutePage() {
  routePageIndex = 0;
}

function updateRoutePager(matchedCount) {
  const total = Number(matchedCount) || 0;
  const totalPages = total > 0 ? Math.ceil(total / MAX_VISIBLE_ROUTES) : 1;
  routePageIndex = Math.min(routePageIndex, Math.max(0, totalPages - 1));
  if (routeTablePagerEl) routeTablePagerEl.hidden = false;
  const rangeStart = total === 0 ? 0 : routePageIndex * MAX_VISIBLE_ROUTES + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(total, (routePageIndex + 1) * MAX_VISIBLE_ROUTES);
  const page = routePageIndex + 1;
  if (routePageLabelEl) {
    routePageLabelEl.textContent = `Page ${page} of ${totalPages} · Showing ${rangeStart}-${rangeEnd} of ${total}`;
  }
  if (routePagePrevBtn) routePagePrevBtn.disabled = routePageIndex <= 0;
  if (routePageNextBtn) routePageNextBtn.disabled = routePageIndex >= totalPages - 1;
}

function toastOnce(key, text, type, durationMs) {
  if (!text) return;
  if (lastBannerKey === key) return;
  lastBannerKey = key;
  showToast(text, type, durationMs ?? 4200);
}

const TAB_ACTIVITY_MAX = 40;
const tabActivityLog = [];

function formatTabActivityClock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function renderTabActivityLog() {
  const rows = tabActivityLog
    .map(
      (row) =>
        `<li class="hub-header-ops-panel__item"><time>${escapeHtml(formatTabActivityClock(row.at))}</time><span>${escapeHtml(row.message)}</span></li>`,
    )
    .join("");
  const targets = [
    ["header-log-empty", "header-log-list"],
    ["sidebar-log-empty", "sidebar-log-list"],
  ];
  for (const [emptyId, listId] of targets) {
    const emptyEl = document.getElementById(emptyId);
    const listEl = document.getElementById(listId);
    if (!listEl) continue;
    const has = tabActivityLog.length > 0;
    if (emptyEl) emptyEl.hidden = has;
    listEl.hidden = !has;
    listEl.innerHTML = rows;
  }
  renderHubUserModalLog(tabActivityLog, { escapeHtml });
}

function pushTabActivity(message) {
  const text = String(message || "").trim();
  if (!text) return;
  tabActivityLog.unshift({ at: Date.now(), message: text });
  if (tabActivityLog.length > TAB_ACTIVITY_MAX) tabActivityLog.length = TAB_ACTIVITY_MAX;
  renderTabActivityLog();
}

function bindingKey(b) {
  return bindingRouteKey(b);
}

function readRouteStatus(bindingStatus, binding) {
  const key = bindingKey(binding);
  const legacy = binding?.noteId?.trim() || binding?.syncId?.trim() || "";
  if (!key) return {};
  return bindingStatus?.[key] ?? (legacy && legacy !== key ? bindingStatus?.[legacy] : null) ?? {};
}

function shortError(msg) {
  if (!msg) return "";
  const s = String(msg);
  if (s.length <= 140) return s;
  return `${s.slice(0, 140)}…`;
}

function routeDotTone(binding, status, vaultProbe) {
  if (status?.ok === false) return "error";
  if (binding?.sourceBrowserId) return "source";
  if (vaultProbe?.hasVault) return "ready";
  return "pending";
}

function routeSiteMarkerHtml(binding, status, vaultProbe) {
  const site = siteIcon(binding?.domain);
  const tone = routeDotTone(binding, status, vaultProbe);
  const title = site?.label || binding?.domain || "Route";
  const img = site
    ? `<img src="${escapeHtml(site.src)}" alt="${escapeHtml(site.label)}" loading="lazy" referrerpolicy="no-referrer" />`
    : icon("route");
  return `<span class="route-site-marker" title="${escapeHtml(title)}">${img}<span class="route-status-dot route-status-dot--${tone}"></span></span>`;
}

function attachRouteIconFallback(row) {
  row.querySelectorAll(".route-site-marker img").forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        const marker = img.closest(".route-site-marker");
        if (!marker) return;
        img.remove();
        marker.insertAdjacentHTML("afterbegin", icon("route"));
      },
      { once: true },
    );
  });
}

function runApplyVaultForBinding(binding) {
  if (!binding) {
    showToast("Chọn một route trong bảng trước.", "warn");
    return;
  }
  setSelectedNoteId(binding.noteId);
  void setApplyLocked(true, binding);

  const finishApplyUi = async (res) => {
    if (res?.ok) {
      const type = res.partial || res.failedNames?.length || res.warning ? "warn" : "success";
      const extra = res.warning ? ` ${res.warning}` : "";
      showToast(`${formatApplyResult(res)}${extra}`, type, 12000);
      pushTabActivity(`Load ${binding.noteTitle || binding.domain || "route"}`);
    } else {
      showToast(res?.error || res?.warning || "Load cookies thất bại", "error", 12000);
      pushTabActivity(`Load failed: ${res?.error || res?.warning || "unknown"}`);
    }
    await setApplyLocked(false);
    refresh();
  };

  chrome.runtime.sendMessage({
    type: "LOCK_LOAD_COOKIE_TAB",
    domain: binding.domain,
    noteTitle: binding.noteTitle,
  }, (lockRes) => {
    const lockErr = chrome.runtime.lastError?.message;
    const lockOk = !lockErr && lockRes?.ok === true;
    const needsOpenSite = !lockOk || isGoogleDomain(binding.domain);
    const applyPayload = {
      type: "APPLY_VAULT_NOW",
      noteId: binding.noteId,
      bindingKey: bindingKey(binding),
      binding,
      clearBeforeLoad: !isGoogleDomain(binding.domain),
      openSite: needsOpenSite,
      refreshTab: true,
      confirmSession: true,
      vaultPassOverride: "",
    };

    const sendApply = (attempt) => {
      chrome.runtime.sendMessage(applyPayload, (res) => {
        const err = chrome.runtime.lastError?.message;
        if (err) {
          if (attempt < 1 && isAuthTransportError(err)) {
            window.setTimeout(() => sendApply(attempt + 1), 250);
            return;
          }
          if (isAuthTransportError(err)) {
            setDirectModeActive(true);
            void applyVaultDirectFromPopup(binding, {
              clearBeforeLoad: !isGoogleDomain(binding.domain),
              openSite: needsOpenSite,
              activateSite: true,
              vaultPassOverride: "",
            }).then(finishApplyUi);
            return;
          }
          void finishApplyUi({ ok: false, error: err });
          return;
        }
        if (!res) {
          setDirectModeActive(true);
          void applyVaultDirectFromPopup(binding, {
            clearBeforeLoad: !isGoogleDomain(binding.domain),
            openSite: needsOpenSite,
            activateSite: true,
            vaultPassOverride: "",
          }).then(finishApplyUi);
          return;
        }
        void finishApplyUi(res);
      });
    };

    if (lockErr && isAuthTransportError(lockErr)) {
      setDirectModeActive(true);
      void applyVaultDirectFromPopup(binding, {
        clearBeforeLoad: !isGoogleDomain(binding.domain),
        openSite: true,
        activateSite: true,
        vaultPassOverride: "",
      }).then(finishApplyUi);
      return;
    }

    chrome.runtime.sendMessage({ type: "REFRESH_SESSION" }, () => {
      void chrome.runtime.lastError;
      sendApply(0);
    });
  });
}

function setLoginMode(mode) {
  loginMode = mode === "signup" ? "signup" : "signin";
  extensionLoginTabSignin?.classList.toggle("auth-gate-tab--active", loginMode === "signin");
  extensionLoginTabSignup?.classList.toggle("auth-gate-tab--active", loginMode === "signup");
  extensionLoginTabSignin?.setAttribute("aria-selected", loginMode === "signin" ? "true" : "false");
  extensionLoginTabSignup?.setAttribute("aria-selected", loginMode === "signup" ? "true" : "false");
  const submitLabel = document.getElementById("extension-login-submit-label");
  const submitIcon = document.getElementById("extension-login-submit-icon");
  if (submitLabel) submitLabel.textContent = loginMode === "signup" ? "Sign Up" : "Sign In";
  if (submitIcon) {
    const iconName = loginMode === "signup" ? "user" : "lock";
    submitIcon.setAttribute("data-icon", iconName);
    submitIcon.innerHTML = icon(iconName);
  }
  if (extensionLoginForgot) extensionLoginForgot.hidden = loginMode !== "signin";
  if (extensionLoginPassword) {
    extensionLoginPassword.autocomplete = loginMode === "signup" ? "new-password" : "current-password";
  }
  syncSignupContactField();
  if (extensionLoginForm) extensionLoginForm.hidden = false;
}

function syncSignupContactField() {
  if (!extensionLoginContact) return;
  const login = extensionLoginEmail?.value?.trim() ?? "";
  const show = loginMode === "signup" && !looksLikeEmail(login);
  extensionLoginContact.hidden = !show;
  extensionLoginContact.required = show;
  if (!show) extensionLoginContact.value = "";
}

function isLoginModalOpen() {
  return Boolean(extensionLoginModal && !extensionLoginModal.hidden);
}

function updateAuthChrome(ready) {
  if (ready) {
    sessionReadyCache = true;
    appShellEl?.classList.remove("shell--auth-locked");
    if (isLoginModalOpen() && !loginModalResolver) hideLoginModal();
    return;
  }
  sessionReadyCache = false;
  if (activeNavTab === "cookie") {
    appShellEl?.classList.remove("shell--auth-locked");
    if (isLoginModalOpen()) hideLoginModal();
    return;
  }
  appShellEl?.classList.add("shell--auth-locked");
}

function switchNavTab(nextTab) {
  const tab = nextTab === "cookie" ? "cookie" : "routes";
  activeNavTab = tab;
  const isCookie = tab === "cookie";
  sidebarNavRoutesBtnEl?.classList.toggle("is-active", !isCookie);
  if (sidebarNavRoutesBtnEl) {
    if (!isCookie) sidebarNavRoutesBtnEl.setAttribute("aria-current", "page");
    else sidebarNavRoutesBtnEl.removeAttribute("aria-current");
  }
  sidebarNavCookieBtnEl?.classList.toggle("is-active", isCookie);
  if (sidebarNavCookieBtnEl) {
    if (isCookie) sidebarNavCookieBtnEl.setAttribute("aria-current", "page");
    else sidebarNavCookieBtnEl.removeAttribute("aria-current");
  }
  if (tabPanelRoutesEl) tabPanelRoutesEl.hidden = isCookie;
  if (tabPanelCookieEl) tabPanelCookieEl.hidden = !isCookie;
  if (headerTabTitleEl) headerTabTitleEl.textContent = isCookie ? "Cookie" : "Routes";
  if (headerTabIconEl) {
    headerTabIconEl.setAttribute("data-icon", isCookie ? "cookie" : "route");
    headerTabIconEl.innerHTML = icon(isCookie ? "cookie" : "route");
  }
  if (isCookie) {
    hideLoginModal();
    appShellEl?.classList.remove("shell--auth-locked");
    void refreshCurrentSiteBar();
  } else {
    updateAuthChrome(sessionReadyCache);
    if (!sessionReadyCache) {
      void showLoginModal();
    }
  }
}

/** Unlock when Hub/Data Box session is live. Cookie tab runs without login; Routes tab requires login. */
function applySessionReadyFromStatus(data) {
  const ready = Boolean(data?.sessionReady);
  if (ready) {
    updateAuthChrome(true);
    initialAuthPromptDone = true;
    return true;
  }
  if (sessionReadyCache) {
    updateAuthChrome(true);
    return true;
  }
  updateAuthChrome(false);
  maybePromptLoginOnLoad(false);
  return false;
}

function hideLoginModal() {
  if (extensionLoginModal) extensionLoginModal.hidden = true;
  if (sessionReadyCache || activeNavTab === "cookie") {
    appShellEl?.classList.remove("shell--auth-locked");
  }
  setLoginBusy(false);
  clearLoginMessage();
}

function dismissLoginModal() {
  if (activeNavTab !== "cookie" && !sessionReadyCache) return;
  hideLoginModal();
  const done = loginModalResolver;
  loginModalResolver = null;
  done?.(false);
}

function showLoginModal() {
  return new Promise((resolve) => {
    if (!extensionLoginModal || !extensionLoginForm) {
      resolve(false);
      return;
    }
    if (activeNavTab === "cookie") {
      resolve(false);
      return;
    }
    loginModalResolver = resolve;
    setLoginMode("signin");
    if (extensionLoginError) {
      extensionLoginError.hidden = true;
      extensionLoginError.textContent = "";
    }
    extensionLoginModal.hidden = false;
    appShellEl?.classList.add("shell--auth-locked");
    window.setTimeout(() => extensionLoginEmail?.focus(), 50);
  });
}

let loginInFlight = false;
let adoptLoginFromStorage = null;

const STORAGE_IDENTITY = "e0001-hub-identity-v1";
const STORAGE_AUTH = "e0001-bridge-auth-v1";
const STORAGE_BINDINGS = "e0001-sync-bindings-v1";
const STORAGE_BINDING_STATUS = "e0001-binding-status-v1";
const STORAGE_SELECTED_BINDING = "e0001-selected-binding-v1";
const STORAGE_LAST_ROUTE_PULL = "e0001-last-route-pull";
const HUB_SIGNIN_FAILED_MESSAGE = "Sign-in failed. Please try again.";

function clearLoginMessage() {
  if (!extensionLoginError) return;
  extensionLoginError.hidden = true;
  extensionLoginError.textContent = "";
}

function setLoginBusy(busy, label) {
  if (extensionLoginSubmit) extensionLoginSubmit.disabled = busy;
  if (extensionLoginProgress) extensionLoginProgress.hidden = !busy;
  if (busy) {
    clearLoginMessage();
    if (extensionLoginProgressLabel && label) {
      extensionLoginProgressLabel.textContent = label;
    }
  }
}

function showLoginMessage(text) {
  if (loginInFlight) return;
  setLoginBusy(false);
  if (!extensionLoginError) return;
  const raw = text == null ? "" : text;
  const message = String(raw).trim() === "" ? "" : formatAuthGateError(raw, loginMode);
  extensionLoginError.textContent = message;
  extensionLoginError.hidden = !message;
}

function identityIsLive(identity) {
  return Boolean(identity?.access_token) && !isJwtExpired(identity);
}

function applyIdentitySession(identity, auth = null) {
  const src = identityIsLive(identity) ? identity : identityIsLive(auth) ? auth : null;
  if (!src) return false;
  sessionReadyCache = true;
  initialAuthPromptDone = true;
  applyHeaderUserFromStatus({
    sessionReady: true,
    hasJwt: true,
    browserId: "",
    userId: src.user_id || "",
    dataUserId: auth?.user_id || "",
    hubIdentityUserId: identity?.user_id || "",
    userEmail: identity?.user_email_label || identity?.user_email || auth?.user_email || "",
    userDisplayLabel:
      identity?.user_display_label || identity?.user_login_id || src.user_email || "",
    userLoginId: identity?.user_login_id || "",
    userRole: src.user_role || "",
    userProvider: src.user_provider || "",
    userCreatedAt: src.user_created_at || "",
    userLastSignInAt: src.user_last_sign_in_at || "",
  });
  updateAuthChrome(true);
  return true;
}

function readStoredHubIdentity() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_IDENTITY, STORAGE_AUTH], (items) => {
      resolve({
        identity: items?.[STORAGE_IDENTITY] ?? null,
        auth: items?.[STORAGE_AUTH] ?? null,
      });
    });
  });
}

function successFromIdentity(identity, extra = {}) {
  return {
    ok: true,
    adopted: true,
    userEmail: identity?.user_email_label || identity?.user_email || "",
    userDisplayLabel: identity?.user_display_label || identity?.user_login_id || "",
    userLoginId: identity?.user_login_id || null,
    userId: identity?.user_id || null,
    ...extra,
  };
}

function completeLoginSuccess(res, login) {
  hideLoginModal();
  setLoginBusy(false);
  sessionReadyCache = true;
  initialAuthPromptDone = true;
  updateAuthChrome(true);
  if (extensionLoginPassword) extensionLoginPassword.value = "";
  const done = loginModalResolver;
  loginModalResolver = null;
  done?.(true);
  const warnText = res.warning ? formatAuthGateError(res.warning, loginMode) : "";
  if (warnText && warnText !== HUB_SIGNIN_FAILED_MESSAGE) {
    showToast(`Signed in (Hub). ${warnText}`, "warn", 6000);
  } else {
    showToast(
      `Signed in as ${res.userDisplayLabel || res.userLoginId || login}`,
      "success",
      3200,
    );
  }
  pushTabActivity(`Signed in as ${res.userDisplayLabel || res.userLoginId || login}`);
  pullCloudRoutesThenPaint();
}

function submitExtensionLogin(login, password, mode = "signin", contactEmail = "") {
  return new Promise((resolve) => {
    if (loginInFlight) {
      resolve({ ok: false, ignored: true, error: "Sign-in already in progress." });
      return;
    }
    loginInFlight = true;
    setLoginBusy(true, mode === "signup" ? "Creating account…" : "Signing in…");
    const type = mode === "signup" ? "EXTENSION_SIGN_UP" : "EXTENSION_SIGN_IN";
    let done = false;
    const finish = (value) => {
      if (done) return;
      const settle = (next) => {
        if (done) return;
        done = true;
        loginInFlight = false;
        adoptLoginFromStorage = null;
        window.clearTimeout(timer);
        if (!next?.ok) setLoginBusy(false);
        resolve(next);
      };
      if (value?.ok) {
        settle(value);
        return;
      }
      void readStoredHubIdentity().then(({ identity }) => {
        if (identityIsLive(identity)) {
          settle(successFromIdentity(identity));
          return;
        }
        settle(value);
      });
    };
    adoptLoginFromStorage = (identity) => {
      if (!identityIsLive(identity)) return;
      finish(successFromIdentity(identity));
    };
    const timer = window.setTimeout(() => {
      finish({
        ok: false,
        error: "Login timed out — background did not respond. Please reload the extension and try again.",
      });
    }, 40_000);

    const runDirectPopupAuthFallback = () => {
      setDirectModeActive(true);
      void readStoredHubIdentity().then(({ identity }) => {
        if (identityIsLive(identity)) {
          finish(successFromIdentity(identity));
          return;
        }
        void signInDirectInPopupFallback(login, password, mode)
          .then((fallbackRes) => finish(fallbackRes))
          .catch((fallbackErr) => finish({ ok: false, error: formatSyncError(fallbackErr) }));
      });
    };

    const send = (attempt) => {
      chrome.runtime.sendMessage({ type, login, email: login, password, contactEmail }, (res) => {
        if (chrome.runtime.lastError) {
          const err = chrome.runtime.lastError.message;
          if (attempt < 1 && isAuthTransportError(err)) {
            window.setTimeout(() => send(attempt + 1), 280);
            return;
          }
          if (isAuthTransportError(err)) {
            runDirectPopupAuthFallback();
            return;
          }
          finish({ ok: false, error: err, transport: true });
          return;
        }
        if (!res) {
          runDirectPopupAuthFallback();
          return;
        }
        finish(res);
      });
    };
    send(0);
  });
}

async function pullCloudRoutesDirectFromPopup(authOverride = null) {
  try {
    const stored = await chrome.storage.local.get([STORAGE_AUTH, STORAGE_BINDINGS]);
    const rawAuth = authOverride || stored?.[STORAGE_AUTH] || null;
    const auth = rawAuth ? await refreshAuthIfNeeded(rawAuth, STORAGE_AUTH) : null;
    if (!auth?.supabase_url || !auth?.supabase_anon_key || !auth?.access_token || isJwtExpired(auth)) {
      return { ok: false, error: "Session is not ready for cloud routes." };
    }
    const base = String(auth.supabase_url).replace(/\/$/, "");
    const fetchWithBudget = async (url, init) => {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 8_000);
      try {
        return await fetch(url, { ...init, signal: ctrl.signal });
      } finally {
        window.clearTimeout(timer);
      }
    };
    let source = "rpc:v2";
    let res = await fetchWithBudget(`${base}/rest/v1/rpc/note_cookie_routes_accessible_v2`, {
      method: "POST",
      headers: userHeaders(auth, { "Content-Type": "application/json" }),
      body: "{}",
    });
    let text = await res.text();
    if (!res.ok && /Could not find|schema cache|PGRST202|404/i.test(text)) {
      source = "rpc:v1";
      res = await fetchWithBudget(`${base}/rest/v1/rpc/note_cookie_routes_accessible`, {
        method: "POST",
        headers: userHeaders(auth, { "Content-Type": "application/json" }),
        body: "{}",
      });
      text = await res.text();
    }
    if (!res.ok && /Could not find|schema cache|PGRST202|404/i.test(text)) {
      source = "table:current";
      res = await fetchWithBudget(
        `${base}/rest/v1/cookie_bridge_routes?select=id,user_id,note_id,sync_id,domain,note_title,enabled,source_browser_id,source_label,source_locked_at,updated_at&enabled=eq.true&order=updated_at.desc`,
        { headers: userHeaders(auth) },
      );
      text = await res.text();
    }
    if (!res.ok) {
      throw new Error(`cloud routes ${res.status}: ${parseApiErrorBody(text)}`);
    }
    const cloudRows = JSON.parse(text);
    const prev = Array.isArray(stored?.[STORAGE_BINDINGS]) ? stored[STORAGE_BINDINGS] : [];
    const byKey = new Map(
      prev.map((b) => [`${String(b?.noteId ?? "").trim()}:${String(b?.domain ?? "").trim()}`, b]),
    );
    const merged = [];
    for (const row of Array.isArray(cloudRows) ? cloudRows : []) {
      const noteId = String(row.note_id ?? "").trim();
      const domain = String(row.domain ?? "").trim();
      if (!noteId || !domain) continue;
      const local = byKey.get(`${noteId}:${domain}`);
      merged.push({
        syncId: String(row.sync_id ?? local?.syncId ?? "").trim(),
        noteId,
        pass: local?.pass ?? "",
        domain,
        requiresPass: false,
        noteTitle: String(row.note_title ?? local?.noteTitle ?? "").trim(),
        sourceBrowserId: String(row.source_browser_id ?? local?.sourceBrowserId ?? "").trim() || null,
        sourceLabel: String(row.source_label ?? local?.sourceLabel ?? "").trim() || null,
        ownerUserId: String(row.owner_user_id ?? row.user_id ?? local?.ownerUserId ?? "").trim() || null,
        ownerUserEmail: String(row.owner_email ?? local?.ownerUserEmail ?? "").trim() || null,
        accessRole: row.access_role === "member" ? "member" : "owner",
        canApply: row.can_apply !== false,
        canPublish: (row.can_publish ?? row.access_role !== "member") !== false,
        canManage: Boolean(row.can_manage ?? row.access_role !== "member"),
      });
    }
    await chrome.storage.local.set({
      [STORAGE_BINDINGS]: merged,
      [STORAGE_LAST_ROUTE_PULL]: {
        at: new Date().toISOString(),
        ok: true,
        count: merged.length,
        source: `${source}:popup`,
        userId: auth.user_id ?? null,
        error: null,
      },
    });
    await hydrateRoutesFromStorage();
    return { ok: true, count: merged.length };
  } catch (err) {
    return { ok: false, error: formatSyncError(err) };
  }
}

async function signInDirectInPopupFallback(login, password, mode = "signin") {
  const { identity, data, dataError, dataPending } = await signInWorkspaceDual(login, password, mode);
  const writes = { [STORAGE_IDENTITY]: identity };
  if (data) writes[STORAGE_AUTH] = data;
  await chrome.storage.local.set(writes);
  applyIdentitySession(identity, data);

  void resolveHubUserModalProfile(identity, data)
    .then(async (profile) => {
      if (!profile) return;
      const nextIdentity = {
        ...identity,
        user_role: profile.userRole,
        user_provider: profile.userProvider,
        user_created_at: profile.userCreatedAt,
        user_last_sign_in_at: profile.userLastSignInAt,
      };
      const nextWrites = { [STORAGE_IDENTITY]: nextIdentity };
      if (data) {
        nextWrites[STORAGE_AUTH] = {
          ...data,
          user_role: profile.userRole,
          user_provider: profile.userProvider,
          user_created_at: profile.userCreatedAt,
          user_last_sign_in_at: profile.userLastSignInAt,
        };
      }
      await chrome.storage.local.set(nextWrites);
      applyIdentitySession(nextIdentity, nextWrites[STORAGE_AUTH] || data);
    })
    .catch(() => null);

  if (dataPending) {
    void dataPending
      .then(async ({ session: pendingData }) => {
        if (!pendingData) return;
        const pendingProfile = await resolveHubUserModalProfile(identity, pendingData).catch(() => null);
        const storedData = pendingProfile
          ? {
              ...pendingData,
              user_role: pendingProfile.userRole,
              user_provider: pendingProfile.userProvider,
              user_created_at: pendingProfile.userCreatedAt,
              user_last_sign_in_at: pendingProfile.userLastSignInAt,
            }
          : pendingData;
        await chrome.storage.local.set({ [STORAGE_AUTH]: storedData });
        await pullCloudRoutesDirectFromPopup(storedData);
      })
      .catch(() => null);
  } else if (data) {
    void pullCloudRoutesDirectFromPopup(data);
  }

  return {
    ok: true,
    directFallback: true,
    userEmail: identity.user_email,
    userLoginId: identity.user_login_id || null,
    userDisplayLabel:
      identity.user_display_label || identity.user_login_id || identity.user_email || "",
    userId: identity.user_id,
    warning: data
      ? null
      : dataError ||
        "Signed in on Tool Hub. Cookie cloud sync needs Data Box when the project is active.",
  };
}

async function hydrateSessionFromStorage() {
  const items = await chrome.storage.local.get([STORAGE_IDENTITY, STORAGE_AUTH]);
  let identity = items?.[STORAGE_IDENTITY] ?? null;
  let auth = items?.[STORAGE_AUTH] ?? null;
  if (applyIdentitySession(identity, auth)) return true;
  const canRefreshIdentity = Boolean(identity?.refresh_token && isJwtExpired(identity));
  const canRefreshAuth = Boolean(auth?.refresh_token && isJwtExpired(auth));
  if (!canRefreshIdentity && !canRefreshAuth) return false;
  if (canRefreshIdentity) {
    identity = await refreshAuthIfNeeded(identity, STORAGE_IDENTITY);
  }
  if (canRefreshAuth) {
    auth = await refreshAuthIfNeeded(auth, STORAGE_AUTH);
  }
  return applyIdentitySession(identity, auth);
}

function hydrateRoutesFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [STORAGE_BINDINGS, STORAGE_BINDING_STATUS, STORAGE_SELECTED_BINDING],
      (items) => {
        const list = Array.isArray(items?.[STORAGE_BINDINGS]) ? items[STORAGE_BINDINGS] : [];
        lastBindings = list;
        lastBindingStatus =
          items?.[STORAGE_BINDING_STATUS] && typeof items[STORAGE_BINDING_STATUS] === "object"
            ? items[STORAGE_BINDING_STATUS]
            : {};
        if (items?.[STORAGE_SELECTED_BINDING] !== undefined) {
          selectedNoteId = items[STORAGE_SELECTED_BINDING] || null;
        }
        renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
        if (list.length) {
          void hydrateCloudVaultStatusDirect(list)
            .then((cloud) => {
              if (cloud.browserId) currentBrowserId = cloud.browserId;
              if (cloud.vaultOnServer && Object.keys(cloud.vaultOnServer).length) {
                lastVaultOnServer = cloud.vaultOnServer;
              }
              if (cloud.noteSyncedAtByNoteId && Object.keys(cloud.noteSyncedAtByNoteId).length) {
                lastNoteSyncedAtByNoteId = cloud.noteSyncedAtByNoteId;
              }
              if (cloud.routeUserActivityByKey && Object.keys(cloud.routeUserActivityByKey).length) {
                lastRouteUserActivityByKey = cloud.routeUserActivityByKey;
              }
              if (cloud.bindingStatus && typeof cloud.bindingStatus === "object") {
                lastBindingStatus = cloud.bindingStatus;
              }
              renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
            })
            .catch(() => null);
        }
        resolve(list.length > 0);
      },
    );
  });
}

function maybePromptLoginOnLoad(ready) {
  if (ready) {
    initialAuthPromptDone = true;
    return;
  }
  if (activeNavTab === "cookie") {
    return;
  }
  if (!isLoginModalOpen()) {
    initialAuthPromptDone = true;
    void showLoginModal();
  }
}

function ensureSessionReady() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_STATUS", light: true }, (data) => {
      if (chrome.runtime.lastError) {
        if (isAuthTransportError(chrome.runtime.lastError.message)) {
          setDirectModeActive(true);
          void hydrateSessionFromStorage().then((ready) => resolve(ready || sessionReadyCache));
          return;
        }
        resolve(false);
        return;
      }
      setDirectModeActive(false);
      if (data?.sessionReady) sessionReadyCache = true;
      if (data) applyHeaderUserFromStatus(data);
      resolve(Boolean(data?.sessionReady) || sessionReadyCache);
    });
  });
}

/** Prompt sign-in inside extension when Tool session is missing. */
async function ensureSessionOrLogin() {
  if (await ensureSessionReady()) return true;
  const ok = await showLoginModal();
  if (!ok) {
    showToast("Sign in required to sync.", "warn", 4000);
    return false;
  }
  return ensureSessionReady();
}

function runSyncNowForBinding(binding) {
  if (!binding) {
    showToast("Chọn route trước.", "warn");
    return;
  }
  const role = bindingRoleInfo(binding);
  if (!role.canSync) {
    showToast(role.syncDisabledReason || "Route này chỉ Load cookies.", "warn", 6000);
    return;
  }
  setSelectedNoteId(binding.noteId);

  const finishSyncUi = (res) => {
    if (res?.ok) {
      const syncedN = res.syncedCount ?? (typeof res.ok === "number" ? res.ok : 1);
      const totalN = res.total ?? 1;
      if (res.warning) showToast(res.warning, "warn", 9000);
      else if (res.partial) showToast(res.warning || "Sync một phần — xem vault.", "warn", 7000);
      else showToast(`Sync xong: ${syncedN}/${totalN} route`, "success");
      pushTabActivity(`Sync ${binding.noteTitle || binding.domain || "route"}`);
    } else {
      showToast(res?.error || res?.reason || "Sync failed", "error", 8000);
      pushTabActivity(`Sync failed: ${res?.error || res?.reason || "unknown"}`);
    }
    refresh();
  };

  void ensureSessionOrLogin().then((ready) => {
    if (!ready) return;
    const sendSync = (attempt) => {
      chrome.runtime.sendMessage(
        { type: "SYNC_NOW", bindingKey: bindingRouteKey(binding), binding },
        (res) => {
          const err = chrome.runtime.lastError?.message;
          if (err) {
            if (attempt < 1 && isAuthTransportError(err)) {
              window.setTimeout(() => sendSync(attempt + 1), 250);
              return;
            }
            if (isAuthTransportError(err)) {
              setDirectModeActive(true);
              void syncBindingDirectFromPopup(binding).then(finishSyncUi);
              return;
            }
            finishSyncUi({ ok: false, error: err });
            return;
          }
          if (!res) {
            setDirectModeActive(true);
            void syncBindingDirectFromPopup(binding).then(finishSyncUi);
            return;
          }
          finishSyncUi(res);
        },
      );
    };

    chrome.runtime.sendMessage({ type: "REFRESH_SESSION" }, () => {
      const refreshErr = chrome.runtime.lastError?.message;
      if (refreshErr && isAuthTransportError(refreshErr)) {
        setDirectModeActive(true);
        void syncBindingDirectFromPopup(binding).then(finishSyncUi);
        return;
      }
      sendSync(0);
    });
  });
}

function sendRuntimeMessageAsync(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (res) => {
      const err = chrome.runtime.lastError?.message || null;
      resolve({ res: res ?? null, err });
    });
  });
}

async function runBulkSyncSelectedRoutes() {
  if (bulkRouteOpInFlight) return;
  const targets = selectedRouteBindings().filter((b) => bindingRoleInfo(b).canSync);
  if (!targets.length) {
    showToast("Select one or more writable routes to sync.", "warn");
    return;
  }
  const ready = await ensureSessionReady();
  if (!ready) return;

  bulkRouteOpInFlight = true;
  syncRouteToolbarUi();
  showToast(`Syncing ${targets.length} selected route(s)...`, "info", 4000);

  try {
    let summary = null;
    if (swDirectModeActive) {
      summary = await syncMultipleBindingsDirectFromPopup(targets);
    } else {
      const refreshPing = await sendRuntimeMessageAsync({ type: "REFRESH_SESSION" });
      if (refreshPing.err && isAuthTransportError(refreshPing.err)) {
        setDirectModeActive(true);
        summary = await syncMultipleBindingsDirectFromPopup(targets);
      } else {
        let okCount = 0;
        let skippedCount = 0;
        let failCount = 0;
        const warnings = [];
        const errors = [];
        for (let i = 0; i < targets.length; i += 1) {
          const b = targets[i];
          const { res, err } = await sendRuntimeMessageAsync({
            type: "SYNC_NOW",
            noteId: b.noteId,
            bindingKey: bindingKey(b),
            binding: b,
          });
          if ((err && isAuthTransportError(err)) || (!err && !res)) {
            setDirectModeActive(true);
            const rest = await syncMultipleBindingsDirectFromPopup(targets.slice(i));
            okCount += Number(rest.syncedCount || 0);
            skippedCount += Number(rest.skippedCount || 0);
            failCount += Number(rest.failCount || 0);
            if (rest.warning) warnings.push(rest.warning);
            if (rest.error) errors.push(rest.error);
            break;
          }
          if (!err && res?.ok) {
            setDirectModeActive(false);
            if (res.partial && res.warning && /Guard:|Skipped/i.test(res.warning)) {
              skippedCount += 1;
            } else {
              okCount += 1;
            }
            if (res.warning) warnings.push(`${b.noteTitle || b.domain}: ${res.warning}`);
          } else {
            failCount += 1;
            errors.push(`${b.noteTitle || b.domain}: ${err || res?.error || "Sync failed"}`);
          }
        }
        const warningText = [...warnings, ...errors].slice(0, 3).join(" · ") || null;
        summary = {
          ok: okCount > 0 || (skippedCount > 0 && failCount === 0),
          syncedCount: okCount,
          skippedCount,
          failCount,
          total: targets.length,
          partial: failCount > 0 || skippedCount > 0 || warnings.length > 0,
          warning: warningText,
          error: okCount === 0 && skippedCount === 0 ? errors[0] || "Bulk sync failed." : null,
        };
      }
    }

    if (summary?.ok) {
      if (summary.partial && summary.warning) {
        showToast(
          `Synced ${summary.syncedCount}/${summary.total} route(s) · ${summary.warning}`,
          "warn",
          8000,
        );
      } else {
        showToast(`Synced ${summary.syncedCount}/${summary.total} route(s).`, "success");
      }
      pushTabActivity(`Bulk synced ${summary.syncedCount}/${summary.total} route(s)`);
    } else {
      showToast(summary?.error || "Bulk sync failed.", "error", 9000);
      pushTabActivity(`Bulk sync failed: ${summary?.error || "unknown"}`);
    }
  } finally {
    bulkRouteOpInFlight = false;
    syncRouteToolbarUi();
    refresh();
  }
}

async function runBulkLoadSelectedRoutes() {
  if (bulkRouteOpInFlight) return;
  const targets = selectedRouteBindings();
  if (!targets.length) {
    showToast("Select one or more routes to load.", "warn");
    return;
  }
  const ready = await ensureSessionReady();
  if (!ready) return;

  bulkRouteOpInFlight = true;
  syncRouteToolbarUi();
  showToast(`Loading vaults for ${targets.length} selected route(s)...`, "info", 4000);

  try {
    let summary = null;
    if (swDirectModeActive) {
      summary = await applyMultipleVaultsDirectFromPopup(targets);
    } else {
      const refreshPing = await sendRuntimeMessageAsync({ type: "REFRESH_SESSION" });
      if (refreshPing.err && isAuthTransportError(refreshPing.err)) {
        setDirectModeActive(true);
        summary = await applyMultipleVaultsDirectFromPopup(targets);
      } else {
        let appliedRoutes = 0;
        let appliedCookies = 0;
        let failCount = 0;
        const warnings = [];
        const errors = [];
        for (let i = 0; i < targets.length; i += 1) {
          const b = targets[i];
          const { res, err } = await sendRuntimeMessageAsync({
            type: "APPLY_VAULT_NOW",
            noteId: b.noteId,
            bindingKey: bindingKey(b),
            binding: b,
            clearBeforeLoad: !isGoogleDomain(b.domain),
            openSite: false,
            refreshTab: true,
            confirmSession: false,
            vaultPassOverride: "",
          });
          if ((err && isAuthTransportError(err)) || (!err && !res)) {
            setDirectModeActive(true);
            const rest = await applyMultipleVaultsDirectFromPopup(targets.slice(i));
            appliedRoutes += Number(rest.appliedRoutes || 0);
            appliedCookies += Number(rest.appliedCookies || 0);
            failCount += Number(rest.failCount || 0);
            if (rest.warning) warnings.push(rest.warning);
            if (rest.error) errors.push(rest.error);
            break;
          }
          if (!err && res?.ok) {
            setDirectModeActive(false);
            appliedRoutes += 1;
            appliedCookies += Number(res.applied || 0);
            if (res.warning) warnings.push(`${b.noteTitle || b.domain}: ${res.warning}`);
          } else {
            failCount += 1;
            errors.push(`${b.noteTitle || b.domain}: ${err || res?.error || "Load failed"}`);
          }
        }
        const warningText = [...warnings, ...errors].slice(0, 3).join(" · ") || null;
        summary = {
          ok: appliedRoutes > 0,
          appliedRoutes,
          appliedCookies,
          failCount,
          total: targets.length,
          partial: failCount > 0 || warnings.length > 0,
          warning: warningText,
          error: appliedRoutes === 0 ? errors[0] || "Bulk load failed." : null,
        };
      }
    }

    if (summary?.ok) {
      if (summary.partial && summary.warning) {
        showToast(
          `Loaded ${summary.appliedRoutes}/${summary.total} route(s) (${summary.appliedCookies} cookies) · ${summary.warning}`,
          "warn",
          8000,
        );
      } else {
        showToast(
          `Loaded ${summary.appliedRoutes}/${summary.total} route(s) (${summary.appliedCookies} cookies).`,
          "success",
        );
      }
      pushTabActivity(`Bulk loaded ${summary.appliedRoutes}/${summary.total} route(s)`);
    } else {
      showToast(summary?.error || "Bulk load failed.", "error", 9000);
      pushTabActivity(`Bulk load failed: ${summary?.error || "unknown"}`);
    }
  } finally {
    bulkRouteOpInFlight = false;
    syncRouteToolbarUi();
    refresh();
  }
}

async function syncSingleBindingSmart(binding) {
  if (!swDirectModeActive) {
    const { res, err } = await sendRuntimeMessageAsync({
      type: "SYNC_NOW",
      noteId: binding.noteId,
      bindingKey: bindingKey(binding),
      binding,
    });
    if ((err && isAuthTransportError(err)) || (!err && !res)) {
      setDirectModeActive(true);
      return syncBindingDirectFromPopup(binding);
    }
    if (err) return { ok: false, error: err };
    setDirectModeActive(false);
    return res;
  }
  return syncBindingDirectFromPopup(binding);
}

async function runCreateRouteFromActiveSession() {
  if (createSessionRouteInFlight || bulkRouteOpInFlight) return;
  const ready = await ensureSessionOrLogin();
  if (!ready) return;

  createSessionRouteInFlight = true;
  syncRouteToolbarUi();

  try {
    let { auth } = await readDirectPopupAuth();
    if (!auth?.supabase_url || !auth?.access_token) {
      await sendRuntimeMessageAsync({ type: "REFRESH_SESSION" });
      ({ auth } = await readDirectPopupAuth());
    }
    if (!auth?.supabase_url || !auth?.access_token) {
      showToast(
        "Data Box cloud session is missing. Sign out and sign in again to create routes.",
        "error",
        6000,
      );
      return;
    }

    if (!lastBindings.length) {
      await pullCloudRoutesDirectFromPopup(auth).catch(() => null);
    }

    const res = await createAndSyncActiveSessionRoute({
      auth,
      bindings: lastBindings,
      bindingStatus: lastBindingStatus,
      canSyncFn: (b) => bindingRoleInfo(b).canSync,
      brandRegistry: COOKIE_BRAND_ICON_REGISTRY,
      syncBindingFn: async (targetBinding) => {
        const existsIdx = lastBindings.findIndex(
          (b) => b.noteId === targetBinding.noteId && b.domain === targetBinding.domain,
        );
        if (existsIdx < 0) {
          lastBindings = [targetBinding, ...lastBindings];
        } else {
          lastBindings = [
            targetBinding,
            ...lastBindings.filter((_, idx) => idx !== existsIdx),
          ];
        }
        await chrome.storage.local
          .set({
            [STORAGE_BINDINGS]: lastBindings,
            [STORAGE_SELECTED_BINDING]: targetBinding.noteId,
          })
          .catch(() => null);
        return syncSingleBindingSmart(targetBinding);
      },
    });

    if (!res?.ok) {
      showToast(res?.error || "Unable to create route from active tab.", "error", 6500);
      pushTabActivity(`New route failed: ${res?.error || "unknown"}`);
      return;
    }

    const createdBinding = res.binding;
    resetAllRouteFilters();
    if (createdBinding?.noteId) {
      selectedNoteIds = new Set([createdBinding.noteId]);
      setPrimarySelectedNoteId(createdBinding.noteId);
    }
    await hydrateRoutesFromStorage();
    void refreshCurrentSiteBar();

    const syncOk = res.syncResult?.ok !== false;
    const syncWarn = res.syncResult?.warning || (!syncOk ? res.syncResult?.error : "");
    const actionLabel = res.created ? "Created & synced" : "Synced existing route";
    if (!syncOk) {
      showToast(
        `Created route "${res.noteTitle}", but vault sync reported: ${syncWarn || "check cookies"}`,
        "warn",
        7500,
      );
    } else if (syncWarn) {
      showToast(`${actionLabel} "${res.noteTitle}" · ${syncWarn}`, "warn", 6500);
    } else {
      showToast(`${actionLabel} "${res.noteTitle}" (${res.cookieCount} cookies).`, "success", 5000);
    }
    pushTabActivity(`${actionLabel}: ${res.noteTitle}`);
    refresh(null, { requestTool: false, light: true });
  } finally {
    createSessionRouteInFlight = false;
    syncRouteToolbarUi();
  }
}

routeNewSessionBtnEl?.addEventListener("click", () => {
  void runCreateRouteFromActiveSession();
});
routeBulkSyncBtnEl?.addEventListener("click", () => {
  void runBulkSyncSelectedRoutes();
});
routeBulkLoadBtnEl?.addEventListener("click", () => {
  void runBulkLoadSelectedRoutes();
});

function openSiteForDomain(domain) {
  if (!domain) return;
  chrome.runtime.sendMessage({ type: "OPEN_BINDING_SITE", domain }, (res) => {
    const err = chrome.runtime.lastError?.message;
    if (!err && res?.ok) {
      showToast("Đã mở site — đăng nhập nếu cần, rồi Sync now.", "info");
      return;
    }
    if ((err && isAuthTransportError(err)) || !res) {
      chrome.tabs
        .create({ url: siteUrlForDomain(domain), active: true })
        .then(() => showToast("Đã mở site — đăng nhập nếu cần, rồi Sync now.", "info"))
        .catch((tabErr) => showToast(String(tabErr), "error"));
      return;
    }
    showToast(err || res?.error || "Unable to open site.", "error");
  });
}

const COOKIE_FILTER_DEFS = {
  platform: {
    label: "Platform",
    triggerEmoji: "🧩",
    searchPlaceholder: "Search platform...",
    options: [],
  },
  tab: {
    label: "Status",
    triggerEmoji: "🚦",
    searchPlaceholder: "Search status or scope...",
    options: [
      { value: "active", label: "Active Tab", emoji: "🟢" },
      { value: "open", label: "Open Tab", emoji: "📑" },
      { value: "jar", label: "Stored Jar", emoji: "🗄️" },
      { value: "signed-in", label: "Signed-in Session", emoji: "🔐" },
      { value: "multi", label: "Multi-Domain SSO", emoji: "🔗\uFE0F" },
      { value: "httponly", label: "Has HttpOnly", emoji: "🔒" },
      { value: "empty", label: "Clean (0)", emoji: "⭕" },
    ],
  },
  sso: {
    label: "Scope",
    triggerEmoji: "🔗\uFE0F",
    searchPlaceholder: "Search SSO scope...",
    options: [
      { value: "multi", label: "Multi-Domain SSO", emoji: "🔗\uFE0F" },
      { value: "single", label: "Single Domain", emoji: "📄" },
    ],
  },
  cookies: {
    label: "Cookies",
    triggerEmoji: "🍪",
    searchPlaceholder: "Search cookie state...",
    options: [
      { value: "signed-in", label: "Signed-in Session", emoji: "🟢" },
      { value: "has-cookies", label: "Has Cookies (>0)", emoji: "🍪" },
      { value: "empty", label: "Clean (0)", emoji: "⭕" },
      { value: "httponly", label: "Has HttpOnly", emoji: "🔒" },
      { value: "chips", label: "Has CHIPS", emoji: "🧩" },
    ],
  },
};

function buildCookiePlatformOptions(sites) {
  const keys = new Set();
  for (const s of sites || []) {
    if (s?.domain) keys.add(platformKeyForDomain(s.domain));
  }
  return Array.from(keys)
    .map((key) => platformOptionForKey(key))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

function renderCookieFilterDropdown(container, search = "") {
  renderSharedFilterDropdown(container, search, {
    key: container.dataset.cookieFilter,
    defs: COOKIE_FILTER_DEFS,
    state: cookieFilters,
    attrName: "data-cookie-filter",
    onSelect: () => {
      cookieJarPageIndex = 0;
      renderCookieJarTable();
    },
  });
}

function syncCookieDynamicFilterOptions(sites) {
  const nextPlatforms = buildCookiePlatformOptions(sites);
  const def = COOKIE_FILTER_DEFS.platform;
  const prevValues = def.options.map((o) => o.value).join("\0");
  const nextValues = nextPlatforms.map((o) => o.value).join("\0");
  def.options = nextPlatforms;
  if (cookieFilters.platform !== "all") {
    const valid = new Set(nextPlatforms.map((o) => o.value));
    if (!valid.has(cookieFilters.platform)) cookieFilters.platform = "all";
  }
  if (prevValues !== nextValues) {
    document
      .querySelectorAll('.cookie-filter-dd[data-cookie-filter="platform"]')
      .forEach((el) => renderCookieFilterDropdown(el));
  }
}

function activeCookieFilterCount() {
  let n = cookieFilters.query.trim() ? 1 : 0;
  if (cookieFilters.platform !== "all") n += 1;
  if (cookieFilters.tab !== "all") n += 1;
  if (cookieFilters.sso !== "all") n += 1;
  if (cookieFilters.cookies !== "all") n += 1;
  return n;
}

function hasActiveCookieFilters() {
  return activeCookieFilterCount() > 0;
}

function cookieSiteMatchesFilters(site) {
  if (cookieFilters.platform !== "all" && platformKeyForDomain(site.domain) !== cookieFilters.platform) {
    return false;
  }
  if (cookieFilters.tab !== "all") {
    if (cookieFilters.tab === "active" && !site.isActiveTab) return false;
    if (cookieFilters.tab === "open" && !site.isOpenTab) return false;
    if (cookieFilters.tab === "jar" && site.isOpenTab) return false;
    if (cookieFilters.tab === "signed-in" && !site.isAuthenticated) return false;
    if (cookieFilters.tab === "multi" && !site.isMultiSso) return false;
    if (cookieFilters.tab === "httponly" && site.httpOnlyCount <= 0) return false;
    if (cookieFilters.tab === "empty" && site.cookieCount > 0) return false;
  }
  if (cookieFilters.sso !== "all") {
    if (cookieFilters.sso === "multi" && !site.isMultiSso) return false;
    if (cookieFilters.sso === "single" && site.isMultiSso) return false;
  }
  if (cookieFilters.cookies !== "all") {
    if (cookieFilters.cookies === "signed-in" && !site.isAuthenticated) return false;
    if (cookieFilters.cookies === "has-cookies" && site.cookieCount <= 0) return false;
    if (cookieFilters.cookies === "empty" && site.cookieCount > 0) return false;
    if (cookieFilters.cookies === "httponly" && site.httpOnlyCount <= 0) return false;
    if (cookieFilters.cookies === "chips" && site.chipsCount <= 0) return false;
  }
  const q = cookieFilters.query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    site.domain,
    site.displayDomain,
    site.familyLabel,
    site.sessionHint,
    site.openTabTitle,
    ...(site.scopes || []),
    ...(site.cookieNames || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function updateCookieJarPager(totalItems) {
  if (!cookieJarPagerEl || !cookiePageMetaEl || !cookiePagePrevBtn || !cookiePageNextBtn) return;
  const pageCount = Math.max(1, Math.ceil(totalItems / MAX_VISIBLE_COOKIE_ROWS));
  if (cookieJarPageIndex >= pageCount) cookieJarPageIndex = Math.max(0, pageCount - 1);
  const startIdx = totalItems > 0 ? cookieJarPageIndex * MAX_VISIBLE_COOKIE_ROWS + 1 : 0;
  const endIdx = Math.min(totalItems, (cookieJarPageIndex + 1) * MAX_VISIBLE_COOKIE_ROWS);
  cookiePageMetaEl.textContent = `Page ${cookieJarPageIndex + 1} of ${pageCount} · Showing ${startIdx}-${endIdx} of ${totalItems}`;
  cookiePagePrevBtn.disabled = cookieJarPageIndex <= 0;
  cookiePageNextBtn.disabled = cookieJarPageIndex >= pageCount - 1;
}

function formatSiteMaxExpiryLabel(site) {
  if (!site.cookieCount) return "—";
  const expirySec =
    typeof site.effectiveExpirySec === "number"
      ? site.effectiveExpirySec
      : site.maxExpirySec;
  if (typeof expirySec !== "number") return "Session";
  const ms = expirySec * 1000;
  const diffHours = Math.round((ms - Date.now()) / (1000 * 60 * 60));
  if (diffHours <= 0) return "Expired";
  if (diffHours < 48) return `${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d`;
  if (diffDays < 365) return `${Math.round(diffDays / 30)}mo`;
  return `${(diffDays / 365).toFixed(1)}y`;
}

function formatSiteExpiryTitle(site) {
  if (!site.cookieCount) return "No cookies stored";
  const parts = [];
  if (typeof site.authExpirySec === "number") {
    parts.push(`Auth / HttpOnly expires: ${new Date(site.authExpirySec * 1000).toLocaleString()}`);
  }
  if (typeof site.maxExpirySec === "number") {
    parts.push(`Max cookie expires: ${new Date(site.maxExpirySec * 1000).toLocaleString()}`);
  }
  if (site.sessionCount > 0) {
    parts.push(`${site.sessionCount} session cookie(s) (clear on browser exit)`);
  }
  return parts.join(" · ") || "Session cookies only";
}

function formatCompactSsoScopeLabel(site) {
  if (!site.isMultiSso) return "Single";
  const raw = String(site.familyLabel || "")
    .replace(/\s+SSO$/i, "")
    .trim();
  if (!raw) return `${site.scopes.length} SSO`;
  if (/outlook|microsoft|live/i.test(raw)) return "Microsoft";
  if (/claude|anthropic/i.test(raw)) return "Claude";
  if (/chatgpt|openai/i.test(raw)) return "OpenAI";
  if (/facebook|meta/i.test(raw)) return "Meta";
  if (/twitter|\bx\b/i.test(raw)) return "X / Twitter";
  const firstSegment = raw.split(/\s*\/\s*/)[0].trim();
  return firstSegment.length <= 10 ? firstSegment : `${site.scopes.length} SSO`;
}

function cookieSiteMarkerHtml(site) {
  const brand = siteIcon(site.domain);
  const tone = site.isActiveTab
    ? "source"
    : site.isOpenTab
      ? "ready"
      : site.cookieCount > 0
        ? "pending"
        : "pending";
  const title = brand?.label || site.domain || "Site";
  const img = brand
    ? `<img src="${escapeHtml(brand.src)}" alt="${escapeHtml(brand.label)}" loading="lazy" referrerpolicy="no-referrer" />`
    : icon("cookie");
  return `<span class="route-site-marker" title="${escapeHtml(title)}">${img}<span class="route-status-dot route-status-dot--${tone}"></span></span>`;
}

function cookieSiteStatusChipHtml(site) {
  if (site.isActiveTab) {
    return renderRouteStatusChipHtml(
      { label: "Active", tone: "ok", icon: "check", title: `Currently active tab (${site.domain})` },
      icon,
    );
  }
  if (site.isOpenTab) {
    return renderRouteStatusChipHtml(
      { label: "Open", tone: "ready", icon: "route", title: `Open in ${site.openTabCount || 1} browser tab(s)` },
      icon,
    );
  }
  if (site.cookieCount > 0) {
    return renderRouteStatusChipHtml(
      { label: "Stored", tone: "warn", icon: "vault", title: `${site.cookieCount} cookie(s) stored in browser jar` },
      icon,
    );
  }
  return renderRouteStatusChipHtml(
    { label: "Clean", tone: "pending", icon: "clock", title: "0 cookies stored" },
    icon,
  );
}

function syncCookieSelectAllAndBulkUi() {
  if (cookieSelectAllEl) {
    const domains = visibleCookieSiteDomains;
    const selectedVisible = domains.filter((d) => selectedCookieSites.has(d));
    cookieSelectAllEl.checked = domains.length > 0 && selectedVisible.length === domains.length;
    cookieSelectAllEl.indeterminate =
      selectedVisible.length > 0 && selectedVisible.length < domains.length;
  }
  if (cookieJarSearchClearEl) cookieJarSearchClearEl.hidden = !cookieFilters.query;
  if (cookieJarSearchKbdEl) cookieJarSearchKbdEl.hidden = Boolean(cookieFilters.query);
  const selCount = selectedCookieSites.size;
  if (cookieBulkSelectionBadgeEl) {
    cookieBulkSelectionBadgeEl.hidden = selCount === 0;
    cookieBulkSelectionBadgeEl.textContent = `${selCount} selected`;
  }
  if (cookieBulkClearSelectedBtnEl) {
    cookieBulkClearSelectedBtnEl.disabled = clearSiteInFlight || selCount === 0;
  }
  if (cookieBulkClearSelectedLabelEl) {
    cookieBulkClearSelectedLabelEl.textContent = `Clear (${selCount})`;
  }
  if (cookieBulkClearActiveBtnEl) {
    cookieBulkClearActiveBtnEl.disabled = clearSiteInFlight || !activeTabDetectedDomain;
    cookieBulkClearActiveBtnEl.title = activeTabDetectedDomain
      ? `Clear all cookies & web storage for active tab (${activeTabDetectedDomain})`
      : "Open a web tab to clear its cookies";
  }
  if (cookieBulkClearActiveLabelEl) {
    cookieBulkClearActiveLabelEl.textContent = activeTabDetectedDomain ? "Clear" : "Clear Active";
  }
  if (cookieBulkClearActiveDomainEl) {
    cookieBulkClearActiveDomainEl.hidden = !activeTabDetectedDomain;
    cookieBulkClearActiveDomainEl.textContent = activeTabDetectedDomain || "";
  }
  const activeFilterN = activeCookieFilterCount();
  if (cookieFilterResetBtnEl) {
    cookieFilterResetBtnEl.hidden = activeFilterN === 0;
  }
  if (cookieFilterResetCountEl) {
    cookieFilterResetCountEl.textContent = String(activeFilterN);
  }
}

function renderCookieJarTable() {
  if (!cookieJarBodyEl || !cookieJarEmptyEl) return;
  syncCookieDynamicFilterOptions(cookieSiteItems);
  const filtered = cookieSiteItems.filter((site) => cookieSiteMatchesFilters(site));

  updateCookieJarPager(filtered.length);
  const start = cookieJarPageIndex * MAX_VISIBLE_COOKIE_ROWS;
  const visible = filtered.slice(start, start + MAX_VISIBLE_COOKIE_ROWS);
  visibleCookieSiteDomains = visible.map((s) => s.domain);

  renderHubResultCount(cookieJarCountEl, cookieJarCountTextEl, filtered.length, cookieSiteItems.length, "sites");
  cookieJarTableWrapEl?.classList.toggle("table-wrap--max-five", visible.length > 0);
  cookieJarBodyEl.innerHTML = "";
  cookieJarEmptyEl.hidden = visible.length > 0;

  if (!visible.length) {
    cookieJarEmptyEl.innerHTML = cookieSiteItems.length
      ? "No sites match your search or filters."
      : "No cookies or open websites found in browser jar.";
    syncCookieSelectAllAndBulkUi();
    return;
  }

  visible.forEach((site, rowIndex) => {
    const tr = document.createElement("tr");
    const isSelected = selectedCookieSites.has(site.domain);
    tr.setAttribute("aria-selected", isSelected ? "true" : "false");
    if (isSelected) tr.className = "row-selected";

    const markerHtml = cookieSiteMarkerHtml(site);
    const cookieSummaryHtml = [
      `<span class="route-cookie"><span class="route-cookie-label">Jar</span><span class="route-cookie-count">${site.cookieCount}</span></span>`,
      `<span class="cookies-sep" aria-hidden="true">·</span>`,
      `<span class="route-cookie" title="${site.httpOnlyCount} HttpOnly cookie(s)"><span class="route-cookie-label">HO</span><span class="route-cookie-count">${site.httpOnlyCount}</span></span>`,
    ].join("");
    const cookieCellTitle = site.cookieNames?.length
      ? `${site.cookieCount} cookies (${site.httpOnlyCount} HttpOnly, ${site.secureCount} Secure, ${site.sessionCount} Session, ${site.chipsCount} CHIPS): ${site.cookieNames.slice(0, 12).join(", ")}`
      : "0 cookies in jar";

    const ssoLabel = formatCompactSsoScopeLabel(site);
    const ssoTitle = site.isMultiSso
      ? `${site.familyLabel ? `${site.familyLabel} — ` : ""}Clears across related SSO domains: ${site.scopes.map((s) => s.replace(/^\./, "")).join(", ")}`
      : `Single site scope: ${site.domain}`;
    const ssoBadgeClass = site.isMultiSso
      ? "cookie-site-sso-badge"
      : "cookie-site-sso-badge cookie-site-sso-badge--single";

    const statusChipHtml = cookieSiteStatusChipHtml(site);
    const expiresLabel = formatSiteMaxExpiryLabel(site);
    const expiresTitle = formatSiteExpiryTitle(site);
    const uidBadgeHtml = site.sessionHint
      ? `<span class="cookie-site-uid-badge" title="${escapeHtml(`Detected session: ${site.sessionHint}`)}">${escapeHtml(site.sessionHint)}</span>`
      : "";

    tr.innerHTML = `
      <td class="hub-users-col--select">
        <label class="hub-users-select-row">
          <input type="checkbox" class="hub-checkbox hub-users-checkbox cookie-site-select" data-site-domain="${escapeHtml(site.domain)}" ${isSelected ? "checked" : ""} aria-label="Select ${escapeHtml(site.domain)}" />
        </label>
      </td>
      <td class="col-route">
        <div class="route-cell">
          ${markerHtml}
          <span class="route-note" title="${escapeHtml(site.openTabTitle ? `${site.domain} — ${site.openTabTitle}` : site.domain)}">${escapeHtml(site.domain)}</span>
          ${uidBadgeHtml}
          <button type="button" class="row-open" title="Open ${escapeHtml(site.domain)}">${icon("external")}</button>
        </div>
      </td>
      <td class="col-status">${statusChipHtml}</td>
      <td class="col-actions">
        <div class="route-actions">
          <button type="button" class="route-action cookie-site-copy" ${site.cookieCount <= 0 ? "disabled" : ""} title="Export Cookie-Editor JSON for ${escapeHtml(site.domain)}">${icon("copy")}<span>Copy</span></button>
          <button type="button" class="route-action cookie-site-update" title="Import or update cookies (JSON or header) for ${escapeHtml(site.domain)}">${icon("save")}<span>Update</span></button>
          <button type="button" class="route-action cookie-site-clear" ${clearSiteInFlight ? "disabled" : ""} title="Clear all cookies &amp; web storage for ${escapeHtml(site.domain)}">${icon("trash")}<span>Clear</span></button>
        </div>
      </td>
      <td class="col-cookies" title="${escapeHtml(cookieCellTitle)}"><span class="cookies-cell">${cookieSummaryHtml}</span></td>
      <td class="col-sso"><span class="${ssoBadgeClass}" title="${escapeHtml(ssoTitle)}">${escapeHtml(ssoLabel)}</span></td>
      <td class="col-loaded loaded-cell" title="${escapeHtml(expiresTitle)}">${escapeHtml(expiresLabel)}</td>
    `;

    attachRouteIconFallback(tr);
    tr.querySelector(".row-open")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openSiteForDomain(site.domain);
    });
    tr.querySelector(".cookie-site-copy")?.addEventListener("click", (e) => {
      e.stopPropagation();
      void runExportSiteCookies(site.domain);
    });
    tr.querySelector(".cookie-site-update")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openCookieImportModal(site.domain);
    });
    tr.querySelector(".cookie-site-clear")?.addEventListener("click", (e) => {
      e.stopPropagation();
      void runClearSiteCookies(site.domain);
    });
    tr.querySelector(".cookie-site-select")?.addEventListener("click", (e) => e.stopPropagation());
    tr.querySelector(".cookie-site-select")?.addEventListener("change", (event) => {
      event.stopPropagation();
      const next = new Set(selectedCookieSites);
      if (event.shiftKey && lastSelectedCookieSiteIndex >= 0) {
        const sIdx = Math.min(lastSelectedCookieSiteIndex, rowIndex);
        const eIdx = Math.max(lastSelectedCookieSiteIndex, rowIndex);
        for (const dom of visibleCookieSiteDomains.slice(sIdx, eIdx + 1)) next.add(dom);
      } else if (event.target.checked) {
        next.add(site.domain);
      } else {
        next.delete(site.domain);
      }
      selectedCookieSites = next;
      lastSelectedCookieSiteIndex = rowIndex;
      renderCookieJarTable();
    });
    cookieJarBodyEl.appendChild(tr);
  });

  const padCount = visible.length ? Math.max(0, MAX_VISIBLE_COOKIE_ROWS - visible.length) : 0;
  for (let i = 0; i < padCount; i += 1) {
    const pad = document.createElement("tr");
    pad.className = "hub-users-row hub-users-row--pad";
    pad.setAttribute("aria-hidden", "true");
    pad.innerHTML = `<td colspan="7"></td>`;
    cookieJarBodyEl.appendChild(pad);
  }
  syncCookieSelectAllAndBulkUi();
}

async function refreshCurrentSiteBar() {
  try {
    const dir = await listAllCookieSitesForDirectory();
    if (dir?.ok) {
      activeTabDetectedDomain = String(dir.activeTabDomain || "").trim();
      cookieSiteItems = Array.isArray(dir.sites) ? dir.sites : [];
      const validSet = new Set(cookieSiteItems.map((s) => s.domain));
      selectedCookieSites = new Set([...selectedCookieSites].filter((d) => validSet.has(d)));
      syncRouteToolbarUi();
      renderCookieJarTable();
      return;
    }
  } catch {
    // Fallback below
  }
  try {
    const info = await getCurrentSiteCookieInfo("");
    if (info?.ok) {
      activeTabDetectedDomain = String(info.activeTabDomain || info.targetDomain || "").trim();
    }
  } catch {
    /* ignore */
  }
  renderCookieJarTable();
}

async function runClearSiteCookies(overrideDomain = "") {
  if (clearSiteInFlight) return;
  const rawTarget = String(overrideDomain || activeTabDetectedDomain || "").trim();
  const targetDomain = extractRegistrableDomain(rawTarget) || rawTarget;
  if (!targetDomain) {
    showToast("Select a site in the table or open a website tab first.", "warn", 4000);
    return;
  }
  clearSiteInFlight = true;
  syncCookieSelectAllAndBulkUi();

  let res = null;
  try {
    res = await clearSiteCookiesComplete(targetDomain, {
      clearStorage: true,
      reloadTabs: true,
    });
  } catch (err) {
    res = { ok: false, error: err?.message || String(err) };
  }

  clearSiteInFlight = false;
  if (!res?.ok) {
    const errMsg = res?.error || "Failed to clear site cookies";
    showToast(errMsg, "error", 5000);
    void refreshCurrentSiteBar();
    return;
  }
  const removed = Number(res.removed ?? 0);
  const remaining = Number(res.remaining ?? 0);
  const tabsReloaded = Number(res.tabsReloaded ?? 0);
  const scopeSummary =
    Array.isArray(res.scopes) && res.scopes.length > 1
      ? ` (${res.scopes.length} SSO domains)`
      : "";
  const reloadSummary = tabsReloaded > 0 ? ` · reloaded ${tabsReloaded} tab(s)` : "";
  const tone = remaining === 0 ? "success" : "warn";
  showToast(
    `Cleared ${removed} cookie(s) + web storage for ${res.targetDomain || targetDomain}${scopeSummary}${reloadSummary}.`,
    tone,
    5500,
  );
  pushTabActivity(`Cleared ${removed} cookies for ${res.targetDomain || targetDomain}`);
  selectedCookieSites.delete(targetDomain);
  await refreshCurrentSiteBar();
  refresh(null, { requestTool: false, light: true });
}

async function runBulkClearSelectedSites() {
  if (clearSiteInFlight) return;
  const targets = [...selectedCookieSites];
  if (!targets.length) {
    showToast("Select at least one site row to clear.", "warn", 3200);
    return;
  }
  clearSiteInFlight = true;
  syncCookieSelectAllAndBulkUi();

  let res = null;
  try {
    res = await clearMultipleSitesCookies(targets, {
      clearStorage: true,
      reloadTabs: true,
    });
  } catch (err) {
    res = { ok: false, error: err?.message || String(err) };
  }

  clearSiteInFlight = false;
  if (!res?.ok) {
    showToast(res?.error || "Failed to clear selected sites.", "error", 5000);
    void refreshCurrentSiteBar();
    return;
  }
  selectedCookieSites.clear();
  showToast(
    `Cleared ${res.removed ?? 0} cookie(s) across ${res.clearedSitesCount ?? targets.length} site(s).`,
    "success",
    5500,
  );
  pushTabActivity(`Bulk cleared ${res.clearedSitesCount ?? targets.length} site(s) (${res.removed ?? 0} cookies)`);
  await refreshCurrentSiteBar();
  refresh(null, { requestTool: false, light: true });
}

async function runExportSiteCookies(domain) {
  try {
    const out = await exportSiteCookiesForDirectory(domain, { includeSsoScope: true });
    if (!out?.ok || !out.json) {
      showToast(out?.error || "Failed to export site cookies.", "error", 4500);
      return;
    }
    await navigator.clipboard.writeText(out.json);
    const scopeNote = Array.isArray(out.scopes) && out.scopes.length > 1 ? ` (${out.scopes.length} SSO domains)` : "";
    showToast(`Copied ${out.count} cookie(s) as JSON for ${out.domain}${scopeNote}.`, "success", 4200);
    pushTabActivity(`Exported ${out.count} cookies for ${out.domain}`);
  } catch (err) {
    showToast(err?.message || "Clipboard copy failed.", "error", 4500);
  }
}

function setCookieImportStatus(msg = "", isError = false) {
  if (!cookieImportStatusEl) return;
  if (!msg) {
    cookieImportStatusEl.hidden = true;
    cookieImportStatusEl.textContent = "";
    cookieImportStatusEl.style.color = "";
    return;
  }
  cookieImportStatusEl.hidden = false;
  cookieImportStatusEl.textContent = msg;
  cookieImportStatusEl.style.color = isError ? "#fca5a5" : "#a7f3d0";
}

function openCookieImportModal(domain = "") {
  if (!cookieImportPanelEl) return;
  const prefill = String(domain || activeTabDetectedDomain || "").trim();
  if (cookieImportDomainInputEl) cookieImportDomainInputEl.value = prefill;
  if (cookieImportTextareaEl) cookieImportTextareaEl.value = "";
  if (cookieImportReplaceCbEl) cookieImportReplaceCbEl.checked = false;
  setCookieImportStatus("");
  cookieImportPanelEl.hidden = false;
  window.setTimeout(() => {
    if (prefill) cookieImportTextareaEl?.focus();
    else cookieImportDomainInputEl?.focus();
  }, 0);
}

function closeCookieImportModal() {
  if (!cookieImportPanelEl) return;
  cookieImportPanelEl.hidden = true;
  setCookieImportStatus("");
}

async function runSubmitCookieImportModal() {
  const domain = String(cookieImportDomainInputEl?.value ?? "").trim();
  const rawJson = String(cookieImportTextareaEl?.value ?? "").trim();
  const replaceExisting = Boolean(cookieImportReplaceCbEl?.checked);
  if (!rawJson) {
    setCookieImportStatus("Paste Cookie-Editor JSON or a name=value cookie string first.", true);
    cookieImportTextareaEl?.focus();
    return;
  }
  if (cookieImportSubmitBtnEl) cookieImportSubmitBtnEl.disabled = true;
  setCookieImportStatus("Applying cookies to browser jar...");
  try {
    const res = await importSiteCookiesFromJsonForDirectory(domain, rawJson, {
      replaceExisting,
      reloadTabs: true,
    });
    if (!res?.ok) {
      const failSample = res?.failedNames?.length ? ` (${res.failedNames.slice(0, 4).join(", ")})` : "";
      setCookieImportStatus(`Failed to apply cookies${failSample}. Check domain and JSON format.`, true);
      return;
    }
    const reloadNote = res.tabsReloaded > 0 ? ` · reloaded ${res.tabsReloaded} tab(s)` : "";
    showToast(
      `Applied ${res.applied}/${res.total} cookie(s) for ${res.domain || domain || "site"}${reloadNote}.`,
      res.failed > 0 ? "warn" : "success",
      5000,
    );
    pushTabActivity(`Updated ${res.applied}/${res.total} cookies for ${res.domain || domain || "site"}`);
    closeCookieImportModal();
    await refreshCurrentSiteBar();
    refresh(null, { requestTool: false, light: true });
  } catch (err) {
    setCookieImportStatus(err?.message || String(err), true);
  } finally {
    if (cookieImportSubmitBtnEl) cookieImportSubmitBtnEl.disabled = false;
  }
}

function bindCurrentSiteCleanerBar() {
  sidebarNavRoutesBtnEl?.addEventListener("click", () => {
    switchNavTab("routes");
  });
  sidebarNavCookieBtnEl?.addEventListener("click", () => {
    switchNavTab("cookie");
  });
  document.querySelectorAll(".cookie-filter-dd").forEach((el) => renderCookieFilterDropdown(el));
  cookieFilterResetBtnEl?.addEventListener("click", () => {
    cookieFilters.query = "";
    cookieFilters.platform = "all";
    cookieFilters.tab = "all";
    cookieFilters.sso = "all";
    cookieFilters.cookies = "all";
    if (cookieJarSearchInputEl) cookieJarSearchInputEl.value = "";
    if (cookieJarSearchClearEl) cookieJarSearchClearEl.hidden = true;
    cookieJarPageIndex = 0;
    document.querySelectorAll(".cookie-filter-dd").forEach((el) => renderCookieFilterDropdown(el));
    renderCookieJarTable();
  });
  cookieSelectAllEl?.addEventListener("change", (event) => {
    const next = new Set(selectedCookieSites);
    if (event.target.checked) {
      for (const dom of visibleCookieSiteDomains) next.add(dom);
    } else {
      for (const dom of visibleCookieSiteDomains) next.delete(dom);
    }
    selectedCookieSites = next;
    renderCookieJarTable();
  });
  cookieBulkImportBtnEl?.addEventListener("click", () => {
    const firstSelected = selectedCookieSites.size === 1 ? [...selectedCookieSites][0] : "";
    openCookieImportModal(firstSelected || activeTabDetectedDomain);
  });
  cookieImportCloseBtnEl?.addEventListener("click", closeCookieImportModal);
  cookieImportCancelBtnEl?.addEventListener("click", closeCookieImportModal);
  cookieImportPanelEl?.addEventListener("click", (event) => {
    if (event.target === cookieImportPanelEl) closeCookieImportModal();
  });
  cookieImportPasteBtnEl?.addEventListener("click", async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip && cookieImportTextareaEl) {
        cookieImportTextareaEl.value = clip.trim();
        setCookieImportStatus("Pasted from clipboard.");
      } else {
        setCookieImportStatus("Clipboard is empty.", true);
      }
    } catch {
      setCookieImportStatus("Press Ctrl+V in the box below to paste.", true);
      cookieImportTextareaEl?.focus();
    }
  });
  cookieImportSubmitBtnEl?.addEventListener("click", () => {
    void runSubmitCookieImportModal();
  });
  cookieBulkClearSelectedBtnEl?.addEventListener("click", () => {
    void runBulkClearSelectedSites();
  });
  cookieBulkClearActiveBtnEl?.addEventListener("click", () => {
    void runClearSiteCookies(activeTabDetectedDomain);
  });
  cookieJarSearchInputEl?.addEventListener("input", (event) => {
    cookieFilters.query = event.target.value || "";
    if (cookieJarSearchClearEl) cookieJarSearchClearEl.hidden = !cookieFilters.query;
    cookieJarPageIndex = 0;
    renderCookieJarTable();
  });
  cookieJarSearchClearEl?.addEventListener("click", () => {
    cookieFilters.query = "";
    if (cookieJarSearchInputEl) cookieJarSearchInputEl.value = "";
    if (cookieJarSearchClearEl) cookieJarSearchClearEl.hidden = true;
    cookieJarPageIndex = 0;
    renderCookieJarTable();
    cookieJarSearchInputEl?.focus();
  });
  cookiePagePrevBtn?.addEventListener("click", () => {
    if (cookieJarPageIndex <= 0) return;
    cookieJarPageIndex -= 1;
    renderCookieJarTable();
  });
  cookiePageNextBtn?.addEventListener("click", () => {
    cookieJarPageIndex += 1;
    renderCookieJarTable();
  });
}

function routeMatchesFilters(binding, status, vaultProbe) {
  const query = routeFilters.query.trim().toLowerCase();
  const role = bindingRoleInfo(binding);
  const vaultState = vaultProbe?.hasVault ? "has-vault" : "no-vault";
  if (routeFilters.platform !== "all" && platformKeyForDomain(binding.domain) !== routeFilters.platform) {
    return false;
  }
  if (routeFilters.role !== "all" && role.roleFilter !== routeFilters.role) return false;
  if (routeFilters.vault !== "all" && vaultState !== routeFilters.vault) return false;
  if (routeFilters.source !== "all" && role.sourceFilter !== routeFilters.source) return false;
  if (!query) return true;
  const haystack = [
    binding.domain,
    binding.noteTitle,
    binding.noteId,
    binding.syncId,
    binding.ownerUserEmail,
    binding.ownerUserId,
    lastNoteSyncedAtByNoteId[binding.noteId],
    status?.cloudSyncedAt,
    status?.pushedAt,
    vaultProbe?.updatedAt,
    status?.loadedAt,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function renderBindingsTable(bindings, bindingStatus, vaultOnServer) {
  syncDynamicFilterOptions(bindings, vaultOnServer);
  const enabled = enabledRouteBindings(bindings);
  tbody.innerHTML = "";
  lastBindingStatus = bindingStatus ?? {};
  lastVaultOnServer = vaultOnServer ?? {};

  if (selectedNoteId && !enabled.some((b) => b.noteId === selectedNoteId)) {
    selectedNoteId = null;
    selectedNoteIds.clear();
    void chrome.storage.local.set({ [STORAGE_SELECTED_BINDING]: null }).catch(() => null);
    chrome.runtime.sendMessage({ type: "SET_SELECTED_BINDING", noteId: null }, () => {
      void chrome.runtime.lastError;
    });
  }

  const rows = enabled.filter((binding) => {
    const key = bindingKey(binding);
    const st = readRouteStatus(bindingStatus, binding);
    const vaultProbe = vaultOnServer?.[key] ?? vaultOnServer?.[binding.syncId] ?? {};
    return routeMatchesFilters(binding, st, vaultProbe);
  });

  const sortedRows = [...rows].sort((a, b) => {
    const keyA = bindingKey(a);
    const keyB = bindingKey(b);
    const stA = readRouteStatus(bindingStatus, a);
    const stB = readRouteStatus(bindingStatus, b);
    const vaultA = vaultOnServer?.[keyA] ?? vaultOnServer?.[a.syncId] ?? {};
    const vaultB = vaultOnServer?.[keyB] ?? vaultOnServer?.[b.syncId] ?? {};
    const actA =
      lastRouteUserActivityByKey[keyA] ?? lastRouteUserActivityByKey[bindingRouteKey(a)] ?? null;
    const actB =
      lastRouteUserActivityByKey[keyB] ?? lastRouteUserActivityByKey[bindingRouteKey(b)] ?? null;
    return (
      syncedSortMs(stB, vaultB, lastNoteSyncedAtByNoteId[b.noteId], actB) -
      syncedSortMs(stA, vaultA, lastNoteSyncedAtByNoteId[a.noteId], actA)
    );
  });

  const matchedCount = sortedRows.length;
  updateRoutePager(matchedCount);
  const pageStart = routePageIndex * MAX_VISIBLE_ROUTES;
  const visibleRows = sortedRows.slice(pageStart, pageStart + MAX_VISIBLE_ROUTES);
  tableWrapEl?.classList.toggle("table-wrap--max-five", visibleRows.length > 0);

  visibleRouteNoteIds = visibleRows.map((row) => row.noteId).filter(Boolean);
  selectedNoteIds = new Set([...selectedNoteIds].filter((id) => visibleRouteNoteIds.includes(id)));
  if (selectedNoteId && !selectedNoteIds.has(selectedNoteId)) {
    selectedNoteId = selectedNoteIds.values().next().value || null;
  }
  emptyEl.hidden = visibleRows.length > 0;
  if (!visibleRows.length) {
    emptyEl.innerHTML = enabled.length
      ? "No routes match search or filters."
      : "No routes yet.<br />Open Tool → Cookie sync to add routes.";
  }
  renderHubResultCount(routeCountEl, routeCountTextEl, matchedCount, enabled.length, "routes");
  syncRouteToolbarUi();
  renderHeaderCenterStats(enabled, lastBindingStatus);

  visibleRows.forEach((b, rowIndex) => {
    const key = bindingKey(b);
    const st = readRouteStatus(bindingStatus, b);
    const tr = document.createElement("tr");
    const isSelected = Boolean(b.noteId && selectedNoteIds.has(b.noteId));
    tr.setAttribute("aria-selected", isSelected ? "true" : "false");
    if (isSelected) tr.className = "row-selected";

    let statusChipHtml = renderRouteStatusChipHtml(resolveExtensionRouteStatusDisplay(st), icon);

    const noteLabel = b.noteTitle?.trim() || (b.noteId ? `${b.noteId.slice(0, 8)}…` : "—");
    const host = b.domain.replace(/^\./, "");
    const vaultProbe = vaultOnServer?.[key] ?? vaultOnServer?.[b.syncId] ?? {};
    const userActivity =
      lastRouteUserActivityByKey[key] ?? lastRouteUserActivityByKey[bindingRouteKey(b)] ?? null;
    const userHtml = formatRouteUserCell(b, st, userActivity);
    const userTitle = routeOwnerTitle(b, vaultProbe, st, userActivity) || formatVaultUser(vaultProbe, st);
    const roleInfo = bindingRoleInfo(b);
    const vaultN = vaultProbe?.hasVault ? vaultProbe.cookieCount : null;
    const lineN = typeof st.cookies === "number" ? st.cookies : typeof st.lines === "number" ? st.lines : null;
    const loadedAt = formatActivityTimeHtml(st.loadedAt);
    const synced = resolveSyncedDisplay(
      st,
      vaultProbe,
      lastNoteSyncedAtByNoteId[b.noteId],
      userActivity,
    );
    const markerHtml = routeSiteMarkerHtml(b, st, vaultProbe);
    const spaIdentityLabel =
      typeof st.storageEmail === "string" && st.storageEmail.trim()
        ? st.storageEmail.trim()
        : typeof st.storageUid === "string" && st.storageUid.trim()
          ? `UID ${st.storageUid.trim().slice(0, 10)}`
          : "";
    const spaIdentityBadgeHtml = spaIdentityLabel
      ? `<span class="cookie-site-uid-badge" title="SPA Auth Session: ${escapeHtml(spaIdentityLabel)}">${escapeHtml(spaIdentityLabel)}</span>`
      : "";
    const storageN = typeof st.storageCount === "number" && st.storageCount > 0 ? st.storageCount : 0;
    const cookieHtml = [
      `<span class="route-cookie" title="${storageN > 0 ? `Includes ${storageN} SPA auth storage items (IndexedDB / localStorage)` : ""}"><span class="route-cookie-label">Jar</span><span class="route-cookie-count">${lineN ?? "—"}${storageN > 0 ? "+SPA" : ""}</span></span>`,
      `<span class="cookies-sep" aria-hidden="true">·</span>`,
      `<span class="route-cookie"><span class="route-cookie-label">Vault</span><span class="route-cookie-count">${vaultN ?? "—"}</span></span>`,
    ].join("");

    tr.innerHTML = `
      <td class="hub-users-col--select">
        <label class="hub-users-select-row">
          <input type="checkbox" class="hub-checkbox hub-users-checkbox route-select" ${isSelected ? "checked" : ""} aria-label="Select ${escapeHtml(noteLabel)}" />
        </label>
      </td>
      <td class="col-route">
        <div class="route-cell">
          ${markerHtml}
          <span class="route-note">${escapeHtml(noteLabel)}</span>
          ${spaIdentityBadgeHtml}
          <button type="button" class="row-open" title="Open ${escapeHtml(host)}">${icon("external")}</button>
        </div>
      </td>
      <td class="col-actions">
        <div class="route-actions">
          <button type="button" class="route-action route-sync" ${roleInfo.canSync ? "" : "disabled"} title="${escapeHtml(roleInfo.syncDisabledReason || "Sync now")}">${icon("sync")}<span>Sync</span></button>
          <button type="button" class="route-action route-load">${icon("download")}<span>Load</span></button>
          ${
            roleInfo.ownsRoute && b.noteId
              ? `<button type="button" class="route-action route-share" title="Share Username">${icon("userPlus")}<span>Share</span></button>`
              : ""
          }
        </div>
      </td>
      <td class="col-synced synced-cell">${synced.iso ? formatActivityTimeHtml(synced.iso) : "—"}</td>
      <td class="col-loaded loaded-cell">${loadedAt}</td>
      <td class="col-status">${statusChipHtml}</td>
      <td class="col-user synced-at">${userHtml}</td>
      <td class="col-cookies"><span class="cookies-cell">${cookieHtml}</span></td>
    `;

    attachRouteIconFallback(tr);
    tr.querySelector(".row-open")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openSiteForDomain(b.domain);
    });
    tr.querySelector(".route-load")?.addEventListener("click", (e) => {
      e.stopPropagation();
      runApplyVaultForBinding(b);
    });
    tr.querySelector(".route-sync")?.addEventListener("click", (e) => {
      e.stopPropagation();
      runSyncNowForBinding(b);
    });
    tr.querySelector(".route-share")?.addEventListener("click", (e) => {
      e.stopPropagation();
      void cookieSharePanel.open(b);
    });
    tr.querySelector(".route-select")?.addEventListener("click", (event) => event.stopPropagation());
    tr.querySelector(".route-select")?.addEventListener("change", (event) => {
      event.stopPropagation();
      if (!b.noteId) return;
      const next = new Set(selectedNoteIds);
      if (event.shiftKey && lastSelectedRouteIndex >= 0) {
        const start = Math.min(lastSelectedRouteIndex, rowIndex);
        const end = Math.max(lastSelectedRouteIndex, rowIndex);
        for (const id of visibleRouteNoteIds.slice(start, end + 1)) next.add(id);
      } else if (event.target.checked) next.add(b.noteId);
      else next.delete(b.noteId);
      selectedNoteIds = next;
      lastSelectedRouteIndex = rowIndex;
      setPrimarySelectedNoteId(event.target.checked ? b.noteId : [...next][0] || null);
      renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
    });
    if (st.ok && st.empty) {
      tr.title = "Open ↗, log in, then Sync now.";
    }
    if (st.ok === false && st.error) {
      tr.title = st.error;
    }
    tbody.appendChild(tr);
  });
  const padCount = visibleRows.length ? Math.max(0, MAX_VISIBLE_ROUTES - visibleRows.length) : 0;
  for (let i = 0; i < padCount; i += 1) {
    const pad = document.createElement("tr");
    pad.className = "hub-users-row hub-users-row--pad";
    pad.setAttribute("aria-hidden", "true");
    pad.innerHTML = `<td colspan="8"></td>`;
    tbody.appendChild(pad);
  }
  syncRouteSelectAllCheckbox();
  ensureActivityRelativeTick();
}

function syncRouteSelectAllCheckbox() {
  const el = document.getElementById("route-select-all");
  if (!el) return;
  const ids = visibleRouteNoteIds;
  const selectedVisible = ids.filter((id) => selectedNoteIds.has(id));
  el.checked = ids.length > 0 && selectedVisible.length === ids.length;
  el.indeterminate = selectedVisible.length > 0 && selectedVisible.length < ids.length;
}

function bindRouteSelectAll() {
  document.getElementById("route-select-all")?.addEventListener("change", (event) => {
    if (event.target.checked) selectedNoteIds = new Set(visibleRouteNoteIds);
    else selectedNoteIds = new Set();
    setPrimarySelectedNoteId([...selectedNoteIds][0] || null);
    renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyHeaderUserFromStatus(data) {
  if (!data) return;
  if (data.browserId) currentBrowserId = data.browserId;
  if (data.userId !== undefined) currentUserId = data.userId || "";
  if (data.dataUserId !== undefined) currentDataUserId = data.dataUserId || data.userId || "";
  if (data.hubIdentityUserId !== undefined) currentHubUserId = data.hubIdentityUserId || "";
  if (data.userEmail !== undefined) currentUserEmail = data.userEmail || "";
  if (data.userLoginId !== undefined) currentUserLoginId = data.userLoginId || "";
  if (data.userFullName !== undefined) currentUserFullName = data.userFullName || "";
  if (data.userPhone !== undefined) currentUserPhone = data.userPhone || "";
  if (data.userDisplayLabel !== undefined || data.userLoginId !== undefined || data.userEmail !== undefined) {
    currentUserDisplayLabel =
      data.userDisplayLabel || data.userLoginId || currentUserEmail || "";
  }
  if (data.userRole !== undefined) currentUserRole = data.userRole || "";
  if (data.userProvider !== undefined) currentUserProvider = data.userProvider || "";
  if (data.userCreatedAt !== undefined) currentUserCreatedAt = data.userCreatedAt || "";
  if (data.userLastSignInAt !== undefined) currentUserLastSignInAt = data.userLastSignInAt || "";
  const hasUser = Boolean(currentUserId || currentUserLoginId || currentUserDisplayLabel || currentUserEmail);
  updateHubAuthLogoutChip({
    emailEl: sidebarUserLabel,
    identityBtn: sidebarUserBtn,
    roleIconEl: sidebarUserRoleIcon,
    roleIconClassName: "hub-sidebar-footer-btn__icon",
    email: sidebarUsernameLabel(),
    roleKey: currentUserRole,
    linked: hasUser,
    canLogout: Boolean(hasUser || data?.hasJwt || data?.sessionReady),
    renderIconHtml: (name, className) => icon(name, className),
  });
}

/** Sidebar User row — Username only (never display name / email). */
function sidebarUsernameLabel() {
  const login = String(currentUserLoginId || "").trim();
  if (login && !looksLikeEmail(login)) return login;
  const email = String(currentUserEmail || "").trim();
  if (looksLikeEmail(email)) return email.split("@")[0] || "User";
  return login || "User";
}

function cachedUserModalData() {
  return {
    userEmail: currentUserEmail,
    userDisplayLabel: currentUserDisplayLabel,
    userLoginId: currentUserLoginId,
    userFullName: currentUserFullName,
    userPhone: currentUserPhone,
    userId: currentHubUserId || currentUserId,
    userRole: currentUserRole,
    userProvider: currentUserProvider,
    userCreatedAt: currentUserCreatedAt,
    userLastSignInAt: currentUserLastSignInAt,
  };
}

function renderStatus(data) {
  if (data?.light) {
    applyHeaderUserFromStatus(data);
    renderVersionMeta(data?.version);
    applySessionReadyFromStatus(data);
    if (Array.isArray(data.bindingList) && (data.bindingList.length || !lastBindings.length)) {
      lastBindings = data.bindingList;
      if (data.bindingStatus && typeof data.bindingStatus === "object") {
        lastBindingStatus = data.bindingStatus;
      }
      if (data.selectedNoteId !== undefined) selectedNoteId = data.selectedNoteId || null;
      renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
    }
    return;
  }
  const list = data?.bindingList ?? [];
  lastBindings = list;
  lastNoteSyncedAtByNoteId =
    data?.noteSyncedAtByNoteId && typeof data.noteSyncedAtByNoteId === "object"
      ? data.noteSyncedAtByNoteId
      : {};
  lastRouteUserActivityByKey =
    data?.routeUserActivityByKey && typeof data.routeUserActivityByKey === "object"
      ? data.routeUserActivityByKey
      : {};
  if (data?.selectedNoteId !== undefined) {
    selectedNoteId = data.selectedNoteId || null;
  }
  const ready = Boolean(data?.sessionReady);
  const hasBindings = Boolean(data?.hasBindings ?? list.length > 0);
  const hasSupabase = Boolean(data?.hasSupabase);
  const firstErr = Object.values(data?.bindingStatus ?? {}).find((s) => s?.ok === false)?.error;
  const schemaOk = data?.schemaOk !== false;

  if (data?.sessionExpired) {
    if (!firstErr) {
      toastOnce("jwt", "JWT expired — re-link the extension in Tool.", "warn");
    }
  } else if (hasBindings && !hasSupabase) {
    if (!firstErr) {
      toastOnce("link", "Extension must be linked in Tool → Cookie sync.", "warn");
    }
  } else if (hasBindings && !ready) {
    if (!firstErr) {
      toastOnce("signin", "Sign in on Tool → Cookie Bridge tab, then Refresh in User modal.", "warn");
    }
  }

  applyHeaderUserFromStatus(data);

  renderVersionMeta(data?.version);
  renderBindingsTable(list, data?.bindingStatus ?? {}, data?.vaultOnServer ?? {});

  if (!schemaOk && !data?.sessionExpired && data?.hasSupabase) {
    toastOnce("schema", "Schema chưa đủ — chạy APPLY_FIX_V_NOTE_DROP.sql trên Supabase.", "error");
  } else if (data?.displayWarning) {
    toastOnce("warn", data.displayWarning, "warn");
  } else if (firstErr) {
    toastOnce("sync-err", shortError(firstErr), "error");
  }

  applySessionReadyFromStatus(data);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const userModalEl = document.getElementById("user-modal");

function withModalIcons(data) {
  return {
    ...(data || {}),
    renderIconHtml: (name, className = "ui-icon") => icon(name, className),
    workspaceNote: "Workspace data syncs per signed-in user on the Home Server data API.",
  };
}

function openUserModal() {
  if (!userModalEl) return;
  openHubWorkspaceUserModal(userModalEl);
  populateHubWorkspaceUserModal(withModalIcons(cachedUserModalData()));
  renderTabActivityLog();
  chrome.runtime.sendMessage({ type: "GET_STATUS", light: true }, (data) => {
    if (chrome.runtime.lastError || !data) return;
    applyHeaderUserFromStatus(data);
    populateHubWorkspaceUserModal(withModalIcons(data));
  });
}

function refreshSessionFromTool() {
  requestToolRelay().then((relay) => {
    window.setTimeout(() => {
      refresh((data) => {
        populateHubWorkspaceUserModal(withModalIcons(data));
        if (data?.userId || data?.userDisplayLabel || data?.userEmail) {
          showToast("Session and routes refreshed from Tool tab.", "success", 3200);
        } else if (relay?.ok) {
          showToast("Requested Tool session — if still empty, sign in on Cookie Bridge tab.", "warn", 5000);
        } else {
          showToast(
            "Open Cookie Bridge (databox.infi28.com/cookie), sign in, then open User again.",
            "warn",
            6500,
          );
        }
      }, { requestTool: false, pullRoutes: true });
    }, 400);
  });
}

function closeUserModal() {
  closeHubWorkspaceUserModal(userModalEl);
}

function doLogout() {
  closeUserModal();
  currentUserId = "";
  currentDataUserId = "";
  currentHubUserId = "";
  currentUserEmail = "";
  currentUserDisplayLabel = "";
  currentUserLoginId = "";
  currentUserFullName = "";
  currentUserPhone = "";
  currentUserRole = "";
  currentUserProvider = "";
  currentUserCreatedAt = "";
  currentUserLastSignInAt = "";
  sessionReadyCache = false;
  initialAuthPromptDone = false;
  updateAuthChrome(false);
  updateHubAuthLogoutChip({
    emailEl: sidebarUserLabel,
    identityBtn: sidebarUserBtn,
    email: "User",
    linked: false,
    canLogout: false,
    renderIconHtml: (name, className) => icon(name, className),
  });
  populateHubWorkspaceUserModal(withModalIcons({}));
  void showLoginModal();
  chrome.runtime.sendMessage({ type: "LOG_OUT" }, (res) => {
    if (chrome.runtime.lastError) {
      const errMsg = chrome.runtime.lastError.message;
      if (isAuthTransportError(errMsg)) {
        void chrome.storage.local
          .remove([
            STORAGE_AUTH,
            STORAGE_IDENTITY,
            STORAGE_BINDINGS,
            STORAGE_SELECTED_BINDING,
            "e0001-last-sync",
            STORAGE_LAST_ROUTE_PULL,
          ])
          .then(() => showToast("Logged out.", "success", 2500));
        pushTabActivity("Signed out");
        return;
      }
      showToast(errMsg, "warn", 4000);
    } else if (!res?.ok) {
      showToast(res?.error || "Log out failed", "warn", 4000);
    } else {
      showToast("Logged out.", "success", 2500);
    }
    pushTabActivity("Signed out");
    refresh(null, { requestTool: false, light: true });
  });
}

function requestToolRelay() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "REQUEST_TOOL_BINDINGS" }, (res) => {
      lastToolRelay = chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : (res ?? null);
      resolve(lastToolRelay);
    });
  });
}

function pullCloudRoutesThenPaint(done) {
  const send = (attempt) => {
    chrome.runtime.sendMessage({ type: "PULL_CLOUD_ROUTES" }, () => {
      const err = chrome.runtime.lastError?.message;
      if (err && isAuthTransportError(err)) {
        if (attempt < 1) {
          window.setTimeout(() => send(attempt + 1), 280);
          return;
        }
        setDirectModeActive(true);
        void pullCloudRoutesDirectFromPopup().finally(() => refresh(done, { light: true }));
        return;
      }
      refresh(done, { light: true });
    });
  };
  send(0);
}

function refresh(done, opts = {}) {
  const payload =
    opts.light === true
      ? { type: "GET_STATUS", light: true }
      : { type: "GET_STATUS", pullRoutes: opts.pullRoutes === true };
  const send = (attempt) => {
    chrome.runtime.sendMessage(payload, (data) => {
      const err = chrome.runtime.lastError?.message;
      if (err) {
        if (attempt < 2 && isAuthTransportError(err)) {
          window.setTimeout(() => send(attempt + 1), 280);
          return;
        }
        if (isAuthTransportError(err)) {
          setDirectModeActive(true);
          renderVersionMeta(window.E0001_BUILD?.version);
          void hydrateSessionFromStorage()
            .then((ready) => {
              maybePromptLoginOnLoad(ready || sessionReadyCache);
              return hydrateRoutesFromStorage();
            })
            .finally(() => done?.(null));
          return;
        }
        showToast(err, "error");
        done?.(null);
        return;
      }
      if (data) {
        setDirectModeActive(false);
      }
      renderStatus(data);
      done?.(data);
    });
  };
  if (opts.requestTool === true) {
    requestToolRelay().then(() => window.setTimeout(() => send(0), 250));
    return;
  }
  send(0);
}

routeSearchInput?.addEventListener("input", (event) => {
  routeFilters.query = event.target.value || "";
  if (routeSearchClear) routeSearchClear.hidden = !routeFilters.query;
  resetRoutePage();
  renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
});

routeSearchClear?.addEventListener("click", () => {
  routeFilters.query = "";
  if (routeSearchInput) routeSearchInput.value = "";
  routeSearchClear.hidden = true;
  routeSearchInput?.focus();
  resetRoutePage();
  renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
});

routePagePrevBtn?.addEventListener("click", () => {
  if (routePageIndex <= 0) return;
  routePageIndex -= 1;
  renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
});

routePageNextBtn?.addEventListener("click", () => {
  routePageIndex += 1;
  renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const active = document.activeElement;
    if (active === cookieJarSearchInputEl && cookieFilters.query) {
      cookieFilters.query = "";
      cookieJarSearchInputEl.value = "";
      cookieJarPageIndex = 0;
      renderCookieJarTable();
      return;
    }
    if (active === routeSearchInput && routeFilters.query) {
      routeFilters.query = "";
      routeSearchInput.value = "";
      resetRoutePage();
      renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
      return;
    }
    closeCookieImportModal();
    closeUserModal();
    closeSettingsModal();
    if (extensionLoginModal && !extensionLoginModal.hidden) {
      dismissLoginModal();
    }
    return;
  }
  const focusActiveSearch = () => {
    if (activeNavTab === "cookie") {
      cookieJarSearchInputEl?.focus();
      cookieJarSearchInputEl?.select();
    } else {
      routeSearchInput?.focus();
      routeSearchInput?.select();
    }
  };
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    focusActiveSearch();
    return;
  }
  if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "f") {
    const active = document.activeElement;
    const inEditable =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement ||
      Boolean(active?.isContentEditable);
    const anyModalOpen =
      (cookieImportPanelEl && !cookieImportPanelEl.hidden) ||
      (userModalEl && !userModalEl.hidden) ||
      (settingsModalEl && !settingsModalEl.hidden) ||
      isLoginModalOpen();
    if (!inEditable && !anyModalOpen) {
      event.preventDefault();
      focusActiveSearch();
      return;
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    if (activeNavTab === "cookie") {
      if (!visibleCookieSiteDomains.length) return;
      event.preventDefault();
      for (const dom of visibleCookieSiteDomains) selectedCookieSites.add(dom);
      lastSelectedCookieSiteIndex = visibleCookieSiteDomains.length - 1;
      renderCookieJarTable();
      showToast(`Selected ${visibleCookieSiteDomains.length} site(s).`, "info", 2200);
      return;
    }
    if (!visibleRouteNoteIds.length) return;
    event.preventDefault();
    selectedNoteIds = new Set(visibleRouteNoteIds);
    lastSelectedRouteIndex = visibleRouteNoteIds.length - 1;
    setPrimarySelectedNoteId(visibleRouteNoteIds[0]);
    renderBindingsTable(lastBindings, lastBindingStatus, lastVaultOnServer);
    showToast(`Selected ${visibleRouteNoteIds.length} route(s).`, "info", 2200);
  }
});

window.addEventListener("mouseup", () => {
  isRouteDragging = false;
});

applyDirectoryTableHeaderIcons();
hydrateStaticIcons();
initDirectoryColumnHeaderHints();
bindRouteSelectAll();
initFilterDropdowns();
bindCurrentSiteCleanerBar();
refreshCurrentSiteBar();
setLoginMode("signin");
hydrateSessionFromStorage()
  .then((restored) => {
    if (restored) pushTabActivity("Session restored");
    return hydrateRoutesFromStorage();
  })
  .finally(() => {
    if (sessionReadyCache || currentUserDisplayLabel) updateAuthChrome(true);
    refresh(null, { light: true });
    refreshCurrentSiteBar();
    chrome.storage.local.get(STORAGE_AUTH, (items) => {
      if (items?.[STORAGE_AUTH]?.access_token) pullCloudRoutesThenPaint();
    });
  });

let storageRefreshTimer = null;
function scheduleStorageRefresh() {
  if (storageRefreshTimer) window.clearTimeout(storageRefreshTimer);
  storageRefreshTimer = window.setTimeout(() => {
    storageRefreshTimer = null;
    void hydrateRoutesFromStorage();
    refresh(null, { requestTool: false, light: true });
  }, 400);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (loginInFlight) {
    const nextIdentity = changes[STORAGE_IDENTITY]?.newValue;
    if (identityIsLive(nextIdentity)) {
      applyIdentitySession(nextIdentity, changes[STORAGE_AUTH]?.newValue ?? null);
      adoptLoginFromStorage?.(nextIdentity);
    }
    return;
  }
  scheduleStorageRefresh();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refresh(null, { requestTool: false, light: true });
});

function openCookieBridgeWebSettings(event) {
  event?.preventDefault();
  const local = window.E0001_BUILD?.toolLocal;
  chrome.runtime.sendMessage({ type: "OPEN_TOOL_COOKIE", url: "prod" }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      const prod = window.E0001_BUILD?.toolProd;
      if (prod) chrome.tabs.create({ url: prod });
      else if (local) chrome.tabs.create({ url: local });
    }
  });
}

function openSettingsModal(event) {
  event?.preventDefault();
  if (!settingsModalEl) {
    openCookieBridgeWebSettings(event);
    return;
  }
  settingsModalEl.hidden = false;
}

function closeSettingsModal() {
  if (!settingsModalEl) return;
  settingsModalEl.hidden = true;
}

openSettingsBtn?.addEventListener("click", openSettingsModal);
document.getElementById("sidebar-settings-btn")?.addEventListener("click", openSettingsModal);
document.getElementById("settings-modal-close")?.addEventListener("click", closeSettingsModal);
document.getElementById("settings-modal-footer-close")?.addEventListener("click", closeSettingsModal);
document.getElementById("settings-modal-open-web")?.addEventListener("click", openCookieBridgeWebSettings);
settingsModalEl?.addEventListener("click", (event) => {
  if (event.target === settingsModalEl) closeSettingsModal();
});
document.querySelectorAll("[data-settings-section]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const secId = btn.getAttribute("data-settings-section");
    document.querySelectorAll("[data-settings-section]").forEach((b) => {
      b.classList.toggle("is-active", b === btn);
    });
    if (secId) {
      document.getElementById(secId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

function openUserFromChrome() {
  const cachedReady = Boolean(
    sessionReadyCache || currentUserId || currentUserDisplayLabel || currentUserEmail,
  );
  if (cachedReady) {
    openUserModal();
    return;
  }
  void ensureSessionReady().then((ready) => {
    if (ready) {
      openUserModal();
      return;
    }
    void showLoginModal().then((ok) => {
      if (ok) openUserModal();
    });
  });
}

bindHubAuthLogoutChip({
  identityBtn: sidebarUserBtn,
  onOpenUser: () => openUserFromChrome(),
  onLogout: () => doLogout(),
});
const popupOpenedAt = Date.now();
function tickSessionClock() {
  const el = document.getElementById("header-session-clock");
  if (!el) return;
  const sec = Math.floor((Date.now() - popupOpenedAt) / 1000);
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  el.textContent = `${mm}:${ss}`;
}
tickSessionClock();
window.setInterval(tickSessionClock, 1000);

function renderHeaderCenterStats(bindings, bindingStatus) {
  const el = document.getElementById("header-center-stats");
  if (!el) return;
  const list = Array.isArray(bindings) ? bindings : [];
  let ready = 0;
  for (const binding of list) {
    const st = readRouteStatus(bindingStatus, binding);
    if (st?.ok) ready += 1;
  }
  const routeEmoji = COOKIE_BRIDGE_ROUTE_TABLE_HEADER_EMOJI.route;
  const readyEmoji = COOKIE_BRIDGE_ROUTE_TABLE_HEADER_EMOJI.status;
  el.innerHTML = [
    `<span class="app-tab-header-stat-line" title="Routes"><span class="app-tab-header-stat-emoji" aria-hidden="true">${routeEmoji}</span><span class="app-tab-header-stat-value">${list.length}</span></span>`,
    `<span class="app-tab-header-rule" aria-hidden="true"></span>`,
    `<span class="app-tab-header-stat-line" title="Ready"><span class="app-tab-header-stat-emoji" aria-hidden="true">${readyEmoji}</span><span class="app-tab-header-stat-value">${ready}</span></span>`,
  ].join("");
}

function bindHeaderOpsPanels() {
  const pairs = [
    ["header-notify-btn", "header-notify-panel"],
    ["header-log-btn", "header-log-panel"],
    ["sidebar-log-btn", "sidebar-log-panel"],
  ];
  const closeAll = () => {
    for (const [btnId, panelId] of pairs) {
      document.getElementById(panelId)?.setAttribute("hidden", "");
      document.getElementById(btnId)?.setAttribute("aria-expanded", "false");
    }
  };
  for (const [btnId, panelId] of pairs) {
    document.getElementById(btnId)?.addEventListener("click", (event) => {
      event.stopPropagation();
      const panel = document.getElementById(panelId);
      const open = panel && !panel.hasAttribute("hidden");
      closeAll();
      if (!open && panel) {
        panel.removeAttribute("hidden");
        document.getElementById(btnId)?.setAttribute("aria-expanded", "true");
      }
    });
    document.getElementById(panelId)?.addEventListener("click", (event) => event.stopPropagation());
  }
  document.addEventListener("click", closeAll);
}

bindHeaderOpsPanels();
bindHubWorkspaceUserModal({
  modalEl: userModalEl,
  onClose: () => closeUserModal(),
  onRefresh: () => refreshSessionFromTool(),
  onSignOut: () => doLogout(),
  onSave: async ({ pendingPassword }) => {
    const pwd = String(pendingPassword || "").trim();
    if (!pwd) {
      showToast("Saved.", "success", 2000);
      return;
    }
    if (pwd.length < 6) {
      showToast("Password must be at least 6 characters.", "error", 4500);
      return;
    }
    const saveBtn = document.getElementById("user-modal-save");
    saveBtn?.setAttribute("disabled", "");
    saveBtn?.classList.add("hub-tool-detail-modal__confirm--disabled");
    const { identity, auth } = await readStoredHubIdentity();
    const res = await updateExtensionUserPassword(pwd, {
      identity,
      auth,
      loginId: currentUserLoginId,
      identityStorageKey: STORAGE_IDENTITY,
      authStorageKey: STORAGE_AUTH,
    });
    if (!res.ok) {
      saveBtn?.removeAttribute("disabled");
      saveBtn?.classList.remove("hub-tool-detail-modal__confirm--disabled");
      showToast(res.message || "Unable to save password.", "error", 5000);
      return;
    }
    if (userModalEl) delete userModalEl.dataset.pendingPassword;
    const pwdEl = document.getElementById("user-field-password");
    if (pwdEl) {
      pwdEl.textContent = "New password (min 6 characters)";
      pwdEl.classList.add("hub-adm-click-edit__text--empty");
    }
    pushTabActivity("Password changed");
    renderTabActivityLog();
    showToast("Password updated.", "success", 3200);
  },
});

extensionLoginClose?.addEventListener("click", () => dismissLoginModal());
extensionLoginBackdrop?.addEventListener("click", () => dismissLoginModal());
extensionLoginTabSignin?.addEventListener("click", () => setLoginMode("signin"));
extensionLoginTabSignup?.addEventListener("click", () => setLoginMode("signup"));
extensionLoginEmail?.addEventListener("input", () => syncSignupContactField());
extensionLoginForgot?.addEventListener("click", () => {
  const login = extensionLoginEmail?.value?.trim() ?? "";
  if (!login) {
    showLoginMessage("Enter your username, email, or phone first.");
    return;
  }
  setLoginBusy(true, "Sending reset link…");
  void requestHubPasswordReset(login)
    .then((msg) => showLoginMessage(msg))
    .catch((err) => showLoginMessage(formatAuthGateError(err)))
    .finally(() => setLoginBusy(false));
});
extensionLoginForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const login = extensionLoginEmail?.value?.trim() ?? "";
  const password = extensionLoginPassword?.value ?? "";
  const contactEmail = extensionLoginContact?.value?.trim() ?? "";
  if (!login || !password) return;
  if (loginMode === "signup" && !looksLikeEmail(login)) {
    if (!contactEmail || !looksLikeEmail(contactEmail) || isHubTechnicalAuthEmail(contactEmail)) {
      showLoginMessage("Enter a real contact email — @infix1.io.vn is retired.");
      return;
    }
  }
  clearLoginMessage();
  void submitExtensionLogin(login, password, loginMode, contactEmail).then((res) => {
    if (res?.ignored) return;
    if (res.ok) {
      completeLoginSuccess(res, login);
      return;
    }
    void readStoredHubIdentity().then(({ identity, auth }) => {
      if (identityIsLive(identity)) {
        applyIdentitySession(identity, auth);
        completeLoginSuccess(successFromIdentity(identity), login);
        return;
      }
      showLoginMessage(res.error);
    });
  });
});

renderVersionMeta(chrome.runtime.getManifest().version);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopActivityRelativeTick();
  else if (lastBindings.length) ensureActivityRelativeTick();
});
window.addEventListener("pagehide", stopActivityRelativeTick);

function formatApplyResult(res) {
  const n = res.applied ?? 0;
  const t = res.total ?? res.decrypted ?? n;
  const failed = res.failedNames ?? [];
  let msg = `Vault ${res.decrypted ?? t} cookie → ghi ${n}/${t}`;
  if (res.jarAfter != null) msg += ` · jar hiện ${res.jarAfter}`;
  if (failed.length) msg += ` — lỗi: ${failed.slice(0, 6).join(", ")}`;
  if (res.vaultStale) msg += " — Sync lại trên browser gốc (vault lệch)";
  if (res.tabsRefreshed > 0) msg += ` · refresh ${res.tabsRefreshed} tab`;
  else if (n > 0) msg += " — tab site đã sẵn sàng";
  return msg;
}

function runApplyVault() {
  runApplyVaultForBinding(getSelectedBinding());
}

// Manual-only policy: no ?auto=sync|apply-vault from URL (use Sync / Load buttons per route).
