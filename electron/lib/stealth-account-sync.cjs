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
  captureAndQueueStealthSnapshot,
  captureAndQueueStealthSnapshotSafe,
  resolveVaultTargets,
};
