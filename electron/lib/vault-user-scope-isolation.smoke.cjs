"use strict";

/**
 * Smoke: same browser code must not leak credentials across Hub/Data Box tenants.
 * Simulates packaged Hub login for czpgo vs x1e3 (STEALTH_VAULT_DEV_SCOPE=0).
 *
 *   node electron/lib/vault-user-scope-isolation.smoke.cjs
 *   node electron/lib/vault-user-scope-isolation.smoke.cjs 0017
 */
const {
  diagnoseMailCredentials,
  findGmailAccountsByBrowser,
  resolveScopedVaultUserId,
  clearCredentialsCache,
} = require("./twofa-vault-bridge.cjs");
const vaultUserScope = require("./vault-user-scope.cjs");

const BROWSER = String(process.argv[2] || "0017").trim();
const CZPGO = "czpgo@outlook.com";
const X1E3 = "x1e3@outlook.com";
const CZPGO_GMAIL = "czpgopro@gmail.com";

async function asTenant(email, fn) {
  process.env.STEALTH_VAULT_DEV_SCOPE = "0";
  process.env.STEALTH_PACKAGED = "1";
  delete process.env.STEALTH_VAULT_SCOPE_EMAIL;
  vaultUserScope.setVaultHubLoginEmail(email);
  vaultUserScope.clearVaultUserIdCache();
  clearCredentialsCache();
  return fn();
}

async function main() {
  const czpgo = await asTenant(CZPGO, async () => {
    const scoped = await resolveScopedVaultUserId();
    const diagnosis = await diagnoseMailCredentials(BROWSER, "Gmail");
    const rows = await findGmailAccountsByBrowser(BROWSER);
    return { scoped, diagnosis, rows };
  });

  const x1e3 = await asTenant(X1E3, async () => {
    const scoped = await resolveScopedVaultUserId();
    const diagnosis = await diagnoseMailCredentials(BROWSER, "Gmail");
    const rows = await findGmailAccountsByBrowser(BROWSER);
    return { scoped, diagnosis, rows };
  });

  const missing = await asTenant(null, async () => {
    vaultUserScope.setVaultHubLoginEmail(null);
    vaultUserScope.clearVaultUserIdCache();
    clearCredentialsCache();
    const diagnosis = await diagnoseMailCredentials(BROWSER, "Gmail");
    return { diagnosis };
  });

  const czpgoEmail = czpgo.diagnosis.ok ? String(czpgo.diagnosis.credentials?.email || "").toLowerCase() : "";
  const x1e3Email = x1e3.diagnosis.ok ? String(x1e3.diagnosis.credentials?.email || "").toLowerCase() : "";
  const x1e3Accounts = x1e3.rows.map((r) => String(r.account || "").toLowerCase());

  const checks = {
    distinctUserIds: czpgo.scoped.userId !== x1e3.scoped.userId,
    czpgoSeesOwnGmail: czpgoEmail === CZPGO_GMAIL,
    x1e3DoesNotSeeCzpgoGmail:
      x1e3Email !== CZPGO_GMAIL && !x1e3Accounts.includes(CZPGO_GMAIL),
    missingScopeFailsClosed:
      missing.diagnosis.ok === false &&
      /Vault scope|Vault user scope missing|sign in/i.test(String(missing.diagnosis.reason || "")),
  };

  const ok = Object.values(checks).every(Boolean);
  console.log(
    JSON.stringify(
      {
        ok,
        browser: BROWSER,
        checks,
        czpgo: {
          userId: czpgo.scoped.userId,
          gmail: czpgoEmail || null,
          reason: czpgo.diagnosis.ok ? null : czpgo.diagnosis.reason,
          rowCount: czpgo.rows.length,
        },
        x1e3: {
          userId: x1e3.scoped.userId,
          gmail: x1e3Email || null,
          reason: x1e3.diagnosis.ok ? null : x1e3.diagnosis.reason,
          rowCount: x1e3.rows.length,
          accountsSample: x1e3Accounts.slice(0, 5),
        },
        missingScope: {
          ok: missing.diagnosis.ok,
          reason: missing.diagnosis.reason,
          scopeError: missing.diagnosis.scopeError || null,
        },
      },
      null,
      2,
    ),
  );

  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
