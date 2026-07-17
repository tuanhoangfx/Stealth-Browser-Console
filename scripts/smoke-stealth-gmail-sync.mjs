#!/usr/bin/env node
/** Gmail stealth sync smoke — agent runs headless via X-Stealth-Agent-Smoke on API. */
if (!process.env.STEALTH_AGENT_SMOKE) {
  process.env.STEALTH_AGENT_SMOKE = "1";
}

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resolveVaultConfig } = require("../electron/lib/twofa-vault-bridge.cjs");

const positional = process.argv.slice(2).filter((arg) => !String(arg).startsWith("--api-base="));
const apiBaseArg = process.argv.find((arg) => String(arg).startsWith("--api-base="));
if (apiBaseArg) {
  process.env.STEALTH_BROWSER_API_URL = apiBaseArg.slice("--api-base=".length);
}

const { closeStealthProfile, launchStealthProfile, listStealthProfiles, findStealthProfileByName, openStealthUrl, getStealthSyncStatus } =
  await import("../../scripts/lib/stealth-browser-client.mjs");

const profileName = positional[0] || "0003";
const accountEmail = String(positional[1] || "czprofess@gmail.com").trim().toLowerCase();
const service = String(positional[2] || "Gmail").trim();
const targetUrl = positional[3] || "https://mail.google.com/mail/u/0/#inbox";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCloudRow() {
  const { url, key, source } = resolveVaultConfig();
  if (!url || !key) throw new Error("Vault REST config missing — set DATABOX_SUPABASE_URL / SERVICE_ROLE in .env.shared");

  const { resolveScopedVaultUserId } = require("../electron/lib/twofa-vault-bridge.cjs");
  const { userId, email: scopeEmail } = await resolveScopedVaultUserId();

  const params = new URLSearchParams({
    select: "id,service,account,browser,stealth_checked_at,stealth_snapshot,user_id",
    account: `ilike.${accountEmail}`,
    service: `ilike.${service}`,
    user_id: `eq.${userId}`,
    deleted_at: "is.null",
    order: "updated_at.desc,created_at.desc",
    limit: "1",
  });

  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/twofa_accounts?${params.toString()}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  const rows = await res.json();
  if (!res.ok) {
    throw new Error(`Vault REST ${source} ${res.status}: ${JSON.stringify(rows).slice(0, 240)}`);
  }
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (row && row.user_id && row.user_id !== userId) {
    throw new Error(`Vault row user_id mismatch (scope ${scopeEmail})`);
  }
  return row;
}

function buildSteps() {
  return [
    { id: "nav", kind: "navigate", name: "Open Gmail", selector: "", value: targetUrl, timeoutMs: 60000, enabled: true },
    { id: "settle", kind: "wait", name: "Settle Gmail", selector: "", value: "", timeoutMs: 12000, enabled: true },
    { id: "shot", kind: "screenshot", name: "Gmail evidence", selector: "", value: "", timeoutMs: 0, enabled: true },
  ];
}

async function main() {
  const vault = resolveVaultConfig();
  const profiles = await listStealthProfiles();
  const profile = findStealthProfileByName(profiles, profileName);
  if (!profile) throw new Error(`Missing Stealth profile ${profileName}`);

  const before = await fetchCloudRow();
  const beforeCheckedAt = String(before?.stealth_checked_at || "");

  await launchStealthProfile(profile.id).catch(() => {});
  await sleep(5000);

  const openResult = await openStealthUrl({
    profileId: profile.id,
    profileName,
    targetUrl,
    closeWhenDone: false,
    screenshot: false,
    steps: buildSteps(),
  });

  await sleep(8000);
  await closeStealthProfile(profile.id).catch(() => {});

  let after = null;
  for (let i = 0; i < 12; i += 1) {
    await sleep(5000);
    after = await fetchCloudRow();
    const checkedAt = String(after?.stealth_checked_at || "");
    if (checkedAt && checkedAt !== beforeCheckedAt) break;
  }

  const sync = await getStealthSyncStatus({ limit: 10 }).catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));

  const afterCheckedAt = String(after?.stealth_checked_at || "");
  const changed = Boolean(afterCheckedAt && afterCheckedAt !== beforeCheckedAt);
  const snapshot = after?.stealth_snapshot || null;

  console.log(
    JSON.stringify(
      {
        ok: changed,
        vault: { source: vault.source, url: vault.url },
        profile: { id: profile.id, name: profileName },
        account: { email: accountEmail, service },
        targetUrl,
        before: before
          ? {
              id: before.id,
              browser: before.browser,
              stealth_checked_at: before.stealth_checked_at,
              stealth_snapshot: before.stealth_snapshot,
            }
          : null,
        openResult: {
          ok: openResult?.ok === true,
          screenshotPath: openResult?.screenshotPath ?? null,
          logs: Array.isArray(openResult?.logs) ? openResult.logs.slice(-8) : [],
          error: openResult?.error ?? null,
        },
        after: after
          ? {
              id: after.id,
              browser: after.browser,
              stealth_checked_at: after.stealth_checked_at,
              stealth_snapshot: snapshot,
            }
          : null,
        changed,
        sync,
      },
      null,
      2,
    ),
  );

  if (!changed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
