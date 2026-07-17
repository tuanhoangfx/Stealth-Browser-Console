"use strict";

/** Gmail family — Stealth Google session stamps only these vault services. */
function isGmailFamilyService(service) {
  return /^(gmail|google|google\s*mail|googlemail)$/i.test(String(service || "").trim());
}

/** Outlook/Hotmail family — Stealth Microsoft session stamps only these. */
function isOutlookFamilyService(service) {
  return /^(outlook|hotmail|live|mail|microsoft)$/i.test(String(service || "").trim());
}

/** Any mail provider row eligible for Stealth (union of families). */
function isMailVaultService(service) {
  return isGmailFamilyService(service) || isOutlookFamilyService(service);
}

/** @deprecated use isMailVaultService — kept for callers/tests */
function isGmailLikeService(service) {
  return isMailVaultService(service);
}

/**
 * @param {"google"|"outlook"|"mail"} [serviceFamily]
 */
function familyFilter(serviceFamily) {
  if (serviceFamily === "google") return isGmailFamilyService;
  if (serviceFamily === "outlook") return isOutlookFamilyService;
  return isMailVaultService;
}

/**
 * Identity-first vault row resolution (pure — no I/O).
 * Keyed by Profile (browser) + service family — Gmail and Outlook on the same
 * browser code are not ambiguous when serviceFamily is set.
 *
 * @param {{ email?: string, result_code?: string }} detectResult
 * @param {string} actualBrowser
 * @param {{ emailRows: object[], browserRows: object[], serviceFamily?: "google"|"outlook"|"mail" }} lists
 */
function resolveVaultTargetsSync(detectResult, actualBrowser, { emailRows, browserRows, serviceFamily = "mail" }) {
  const matchFamily = familyFilter(serviceFamily);
  const scopedEmailRows = (emailRows || []).filter((row) => matchFamily(row.service));
  const scopedBrowserRows = (browserRows || []).filter((row) => matchFamily(row.service));

  const email = String(detectResult.email || "").trim().toLowerCase();
  if (email) {
    if (scopedEmailRows.length === 1) {
      const row = scopedEmailRows[0];
      const assigned = String(row.browser || "").trim();
      const note =
        assigned && actualBrowser && assigned !== actualBrowser
          ? `email match; browser vault=${assigned} actual=${actualBrowser}`
          : "";
      return { targets: scopedEmailRows, resultCode: detectResult.result_code, note };
    }
    if (scopedEmailRows.length > 1) {
      return {
        targets: [],
        resultCode: "session_ambiguous",
        note: `multiple ${serviceFamily} vault rows for ${email}`,
      };
    }
    return { targets: [], resultCode: "no_vault_match", note: `no ${serviceFamily} vault row for ${email}` };
  }

  // No detected email — browser fallback only with exactly one row in this service family.
  if (scopedBrowserRows.length === 1) {
    return {
      targets: scopedBrowserRows,
      resultCode: detectResult.result_code,
      note: `browser_fallback:${serviceFamily}`,
    };
  }
  if (scopedBrowserRows.length > 1) {
    return {
      targets: [],
      resultCode: "session_ambiguous",
      note: `multiple ${serviceFamily} rows on browser ${actualBrowser}`,
    };
  }
  return {
    targets: [],
    resultCode: "no_vault_match",
    note: `no ${serviceFamily} row for browser ${actualBrowser}`,
  };
}

module.exports = {
  isGmailLikeService,
  isMailVaultService,
  isGmailFamilyService,
  isOutlookFamilyService,
  resolveVaultTargetsSync,
};
