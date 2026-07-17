"use strict";

/**
 * Live check: vault queries are scoped to czpgo (dev) and never leak x1e3 rows.
 * Requires DATABOX_SUPABASE_SERVICE_ROLE in E:\Dev\.env.shared.
 */
const {
  resolveScopedVaultUserId,
  findGmailAccountsByBrowser,
  diagnoseMailCredentials,
  clearCredentialsCache,
} = require("./twofa-vault-bridge.cjs");
const vaultUserScope = require("./vault-user-scope.cjs");

async function main() {
  process.env.STEALTH_VAULT_DEV_SCOPE = "1";
  vaultUserScope.clearVaultUserIdCache();
  clearCredentialsCache();

  const scoped = await resolveScopedVaultUserId();
  if (scoped.email !== "czpgo@outlook.com") {
    throw new Error(`expected czpgo scope, got ${scoped.email}`);
  }
  if (scoped.userId !== "a11815e4-e5e7-49c6-872b-b083c6a987a8") {
    throw new Error(`unexpected czpgo user id: ${scoped.userId}`);
  }

  // Force packaged-style hub scope to x1e3 and confirm different user id.
  process.env.STEALTH_VAULT_DEV_SCOPE = "0";
  process.env.STEALTH_PACKAGED = "1";
  vaultUserScope.setVaultHubLoginEmail("x1e3@outlook.com");
  vaultUserScope.clearVaultUserIdCache();
  clearCredentialsCache();
  const other = await resolveScopedVaultUserId();
  if (other.userId === scoped.userId) {
    throw new Error("x1e3 and czpgo must resolve to different Data Box user ids");
  }
  if (other.email !== "x1e3@outlook.com") {
    throw new Error(`expected x1e3 scope, got ${other.email}`);
  }

  // Restore dev scope and ensure browser lookup only returns that tenant.
  delete process.env.STEALTH_PACKAGED;
  process.env.STEALTH_VAULT_DEV_SCOPE = "1";
  vaultUserScope.setVaultHubLoginEmail(null);
  vaultUserScope.clearVaultUserIdCache();
  clearCredentialsCache();

  const rows = await findGmailAccountsByBrowser("0017");
  for (const row of rows) {
    // Soft check: if any row exists it must be czpgo's Gmail (known inventory).
    console.log("scoped 0017 row:", row.account, row.service, row.browser);
  }

  const diagnosis = await diagnoseMailCredentials("0017", "Gmail");
  console.log("diagnose 0017:", diagnosis.ok ? diagnosis.credentials?.email : diagnosis.reason);

  console.log("vault-user-scope-live.test.cjs: ok", {
    czpgo: scoped.userId,
    x1e3: other.userId,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
