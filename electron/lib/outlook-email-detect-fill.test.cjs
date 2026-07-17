"use strict";

process.env.STEALTH_VAULT_DEV_SCOPE = "1";
const assert = require("node:assert/strict");
const {
  diagnoseMailCredentials,
  clearCredentialsCache,
} = require("./twofa-vault-bridge.cjs");

async function main() {
  clearCredentialsCache();

  // 0183 has multiple Outlook rows — without email detect must fail closed.
  const ambiguous = await diagnoseMailCredentials("0183", "Outlook");
  assert.equal(ambiguous.ok, false);
  assert.equal(ambiguous.matchMode, "ambiguous");
  assert.match(String(ambiguous.reason), /Multiple Outlook rows/);

  // With preferred email — must pick that row.
  const preferred = "q1x83@outlook.com";
  clearCredentialsCache();
  const picked = await diagnoseMailCredentials("0183", "Outlook", { preferredEmail: preferred });
  assert.equal(picked.ok, true);
  assert.equal(String(picked.credentials?.email || "").toLowerCase(), preferred);
  assert.equal(picked.matchMode, "email_detect");

  // Single-Outlook profile 0140 — cold login path.
  clearCredentialsCache();
  const single = await diagnoseMailCredentials("0140", "Outlook");
  assert.equal(single.ok, true);
  assert.ok(single.credentials?.email);

  console.log(
    JSON.stringify(
      {
        ok: true,
        ambiguous: { ok: ambiguous.ok, matchMode: ambiguous.matchMode },
        emailDetect: { ok: picked.ok, email: picked.credentials?.email, matchMode: picked.matchMode },
        single: { ok: single.ok, email: single.credentials?.email, matchMode: single.matchMode },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
