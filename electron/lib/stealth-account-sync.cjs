"use strict";

const { randomUUID } = require("node:crypto");
const { detectGoogleSession } = require("./google-session-detect.cjs");
const { detectMicrosoftSession } = require("./microsoft-session-detect.cjs");
const { buildStealthSnapshot } = require("./stealth-snapshot-types.cjs");
const { resolveVaultTargetsSync } = require("./stealth-resolve-targets.cjs");
const { extractProfileCode } = require("./profile-code.cjs");
const {
  findGmailAccountsByEmail,
  findGmailAccountsByBrowser,
  patchStealthSnapshotByAccountId,
} = require("./twofa-vault-bridge.cjs");
const { enqueueStealthSync, flushStealthSyncOutbox } = require("./stealth-sync-outbox.cjs");

const CAPTURE_TIMEOUT_MS = 5500;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("stealth capture timeout")), ms);
    }),
  ]);
}

/**
 * Resolve vault targets for one service family (google | outlook).
 * Profile + service keying: Gmail and Outlook on the same browser never collide.
 */
async function resolveVaultTargets(detectResult, actualBrowser, serviceFamily) {
  const email = String(detectResult.email || "").trim().toLowerCase();
  const emailRows = email ? await findGmailAccountsByEmail(email) : [];
  const browserRows = await findGmailAccountsByBrowser(actualBrowser);
  return resolveVaultTargetsSync(detectResult, actualBrowser, {
    emailRows,
    browserRows,
    serviceFamily,
  });
}

function enqueueFamilyTargets({
  resolved,
  detectResult,
  actualBrowser,
  profileId,
  source,
  checkedAt,
}) {
  if (!resolved.targets.length) {
    enqueueStealthSync({
      id: randomUUID(),
      accountEmail: detectResult.email || "",
      accountId: null,
      snapshot: buildStealthSnapshot({
        status: detectResult.status,
        result_code: resolved.resultCode,
        checked_at: checkedAt,
        source,
        actual_browser: actualBrowser,
        profile_id: profileId,
        evidence: detectResult.evidence,
        note: resolved.note,
      }),
      createdAt: checkedAt,
      skipCloud: true,
      lastError: resolved.note,
    });
    return [];
  }

  const results = [];
  for (const row of resolved.targets) {
    const assigned = String(row.browser || "").trim();
    const snapshot = buildStealthSnapshot({
      status: detectResult.status,
      result_code: resolved.resultCode,
      checked_at: checkedAt,
      source,
      assigned_browser: assigned || null,
      actual_browser: actualBrowser,
      profile_id: profileId,
      evidence: detectResult.evidence,
      note: resolved.note,
    });
    enqueueStealthSync({
      id: randomUUID(),
      accountEmail: row.account,
      accountId: row.id,
      snapshot,
      createdAt: checkedAt,
    });
    results.push({ accountId: row.id, account: row.account, service: row.service, snapshot });
  }
  return results;
}

/**
 * Detect Google + Microsoft sessions and stamp matching vault rows by service family.
 * @param {import('playwright-core').BrowserContext | null | undefined} context
 * @param {{ id: string, name: string }} profile
 * @param {{ source?: string }} [opts]
 */
async function captureAndQueueStealthSnapshot(context, profile, { source = "auto" } = {}) {
  if (!profile?.id) return { ok: false, reason: "missing profile" };
  if (!context) return { ok: false, reason: "missing context" };

  const profileId = String(profile.id);
  const actualBrowser = extractProfileCode(profile.name, profileId);
  const checkedAt = new Date().toISOString();

  const [googleDetect, microsoftDetect] = await Promise.all([
    detectGoogleSession(context),
    detectMicrosoftSession(context),
  ]);

  const googleResolved = await resolveVaultTargets(googleDetect, actualBrowser, "google");
  const outlookResolved = await resolveVaultTargets(microsoftDetect, actualBrowser, "outlook");

  const results = [
    ...enqueueFamilyTargets({
      resolved: googleResolved,
      detectResult: googleDetect,
      actualBrowser,
      profileId,
      source: `${source}:google`,
      checkedAt,
    }),
    ...enqueueFamilyTargets({
      resolved: outlookResolved,
      detectResult: microsoftDetect,
      actualBrowser,
      profileId,
      source: `${source}:outlook`,
      checkedAt,
    }),
  ];

  if (results.length) {
    void flushStealthSyncOutbox().catch((error) => {
      console.warn("[stealth-sync] flush:", error instanceof Error ? error.message : error);
    });
    return { ok: true, results };
  }

  const notes = [googleResolved.note, outlookResolved.note].filter(Boolean).join(" | ");
  return {
    ok: false,
    reason: notes || "no vault match for google/outlook on this profile",
    google: { detect: googleDetect, resolved: googleResolved },
    outlook: { detect: microsoftDetect, resolved: outlookResolved },
  };
}

/**
 * Snapshot for one vault row already chosen by Agent Login (stored Gmail/Outlook).
 * Does not search by the email painted in the browser.
 */
/** Mail Live Status written only when the login page proves a bucket. */
function vaultStatusForAgentLogin(detect) {
  if (detect?.status === "logged_in") return "active";
  switch (String(detect?.result_code || "")) {
    case "phone_challenge":
      return "check_phone";
    case "mail_challenge":
      return "check_mail";
    case "password_rejected":
      return "incorrect_info";
    case "account_disabled":
      return "disable";
    case "account_appeal":
      return "appeal";
    default:
      return null;
  }
}

function buildAgentLoginSnapshot({
  detect,
  actualBrowser,
  profileId,
  email,
  family,
  checkedAt,
} = {}) {
  const stored = String(email || "").trim().toLowerCase();
  const sessionEmail = String(detect?.email || "").trim().toLowerCase();
  let note = stored ? `vault:${stored}` : "";
  if (sessionEmail && stored && sessionEmail !== stored) {
    note = `vault:${stored} session:${sessionEmail}`;
  }
  const familyKey = family === "outlook" ? "outlook" : "google";
  return buildStealthSnapshot({
    status: detect?.status,
    result_code: detect?.result_code,
    checked_at: checkedAt,
    source: `agent_login:${familyKey}`,
    assigned_browser: actualBrowser || null,
    actual_browser: actualBrowser || null,
    profile_id: profileId,
    evidence: detect?.evidence,
    note,
  });
}

/**
 * After Gmail/Outlook Agent Login, write Stealth status onto the vault row
 * whose credentials were used. Profile open, navigation, and close do not call this.
 */
async function stampStoredMailLoginSnapshot(context, profile, {
  accountId,
  email,
  serviceFamily = "google",
} = {}) {
  if (!accountId) return { ok: false, reason: "missing account id" };
  if (!profile?.id) return { ok: false, reason: "missing profile" };
  const family = serviceFamily === "outlook" ? "outlook" : "google";
  let detect = await withTimeout(
    family === "outlook" ? detectMicrosoftSession(context) : detectGoogleSession(context),
    CAPTURE_TIMEOUT_MS,
  );
  if (family === "google" && detect?.status === "logged_in") {
    const storedLower = String(email || "").trim().toLowerCase();
    const detectedLower = String(detect?.email || "").trim().toLowerCase();
    if (storedLower && detectedLower && storedLower !== detectedLower) {
      detect = {
        ...detect,
        status: "not_logged_in",
        result_code: "account_mismatch",
        evidence: `account_mismatch:${detectedLower}`,
      };
    } else if (detect?.result_code === "google_cookies") {
      // Landing on workspace.google.com or non-inbox with stale cookies is not a Gmail login
      detect = {
        ...detect,
        status: "not_logged_in",
        result_code: "login_page",
        evidence: "non_inbox_google_cookies",
      };
    }
  }
  const actualBrowser = extractProfileCode(profile.name, profile.id);
  const checkedAt = new Date().toISOString();
  const snapshot = buildAgentLoginSnapshot({
    detect,
    actualBrowser,
    profileId: profile.id,
    email,
    family,
    checkedAt,
  });
  const vaultStatus = family === "google" ? vaultStatusForAgentLogin(detect) : null;
  let authCookies = null;
  if (detect?.status === "logged_in" && typeof context?.cookies === "function") {
    try {
      const rawCookies = await context.cookies();
      if (Array.isArray(rawCookies) && rawCookies.length > 0) {
        const filtered = rawCookies.filter((c) => {
          const d = String(c?.domain || "").toLowerCase();
          const n = String(c?.name || "");
          if (!c?.value) return false;
          if (family === "outlook") {
            return (
              (d.includes("live.com") || d.includes("outlook.com") || d.includes("microsoft.com") || d.includes("office.com")) &&
              ["__Host-MSAAUTH", "__Host-MSAAUTHP", "WLSSC", "MSPAuth", "RPSSecAuth", "MSNRPSAuth", "PPLState", "OParams", "ESTSAUTH", "ESTSAUTHPERSISTENT"].includes(n)
            );
          }
          return (
            d.includes("google.com") &&
            ["SID", "HSID", "SSID", "APISID", "SAPISID", "__Secure-1PSID", "__Secure-3PSID", "__Secure-1PAPISID", "__Secure-3PAPISID", "LSID"].includes(n)
          );
        });
        if (filtered.length > 0) {
          authCookies = filtered.map((c) => ({
            name: String(c.name),
            value: String(c.value),
            domain: String(c.domain || ""),
            path: String(c.path || "/"),
            secure: Boolean(c.secure),
            httpOnly: Boolean(c.httpOnly),
          }));
        }
      }
    } catch {
      /* ignore cookie extraction error */
    }
  }
  const patched = await patchStealthSnapshotByAccountId(accountId, snapshot, {
    status: vaultStatus,
    cookies: authCookies,
  });
  return { ok: Boolean(patched.ok), snapshot, vaultStatus, reason: patched.reason, detect };
}

async function captureAndQueueStealthSnapshotSafe(context, profile, opts = {}) {
  try {
    return await withTimeout(captureAndQueueStealthSnapshot(context, profile, opts), CAPTURE_TIMEOUT_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Vault user scope missing|No Data Box auth user|Vault scope/i.test(message)) {
      console.warn("[stealth-sync] vault scope blocked:", message);
    } else {
      console.warn("[stealth-sync] capture skipped:", message);
    }
    return { ok: false, reason: message };
  }
}

module.exports = {
  buildAgentLoginSnapshot,
  vaultStatusForAgentLogin,
  captureAndQueueStealthSnapshot,
  captureAndQueueStealthSnapshotSafe,
  resolveVaultTargets,
  stampStoredMailLoginSnapshot,
};
