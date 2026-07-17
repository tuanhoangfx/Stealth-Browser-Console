"use strict";

/**
 * Align Outlook vault browser codes with Stealth profiles (Profile + service keying).
 *
 * Strategy (tenant = vault scope / czpgo in dev):
 * 1. Outlook row missing browser + Gmail on browser N has mail_recover == Outlook account → assign N
 * 2. Outlook row missing browser + only one free Stealth-style code unused by other Outlook → skip mass assign
 * 3. Report Outlook rows already keyed (ready for Outlook Login script)
 *
 *   node scripts/align-outlook-browser-for-stealth.cjs           # dry-run
 *   node scripts/align-outlook-browser-for-stealth.cjs --apply
 */
const { createClient } = require("@supabase/supabase-js");
const {
  resolveVaultConfig,
  resolveScopedVaultUserId,
  diagnoseMailCredentials,
  clearCredentialsCache,
} = require("../electron/lib/twofa-vault-bridge.cjs");

const APPLY = process.argv.includes("--apply");

function normBrowser(value) {
  const t = String(value || "").trim();
  if (!t) return "";
  if (/^\d{1,4}$/.test(t)) return t.padStart(4, "0");
  return t;
}

function isGmail(service) {
  return /^(gmail|google|google\s*mail|googlemail)$/i.test(String(service || "").trim());
}

function isOutlook(service) {
  return /^(outlook|hotmail|live|mail|microsoft)$/i.test(String(service || "").trim());
}

async function main() {
  process.env.STEALTH_VAULT_DEV_SCOPE = process.env.STEALTH_VAULT_DEV_SCOPE || "1";
  clearCredentialsCache();

  const { userId, email: scopeEmail } = await resolveScopedVaultUserId();
  const config = resolveVaultConfig();
  const client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client
    .from("twofa_accounts")
    .select("id, account, browser, service, mail_recover, status")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("status", "active");
  if (error) throw error;

  const rows = data || [];
  const gmail = rows.filter((r) => isGmail(r.service));
  const outlook = rows.filter((r) => isOutlook(r.service));

  const plans = [];
  for (const o of outlook) {
    if (normBrowser(o.browser)) continue;
    const account = String(o.account || "").trim().toLowerCase();
    const link = gmail.find((g) => {
      const recover = String(g.mail_recover || "").trim().toLowerCase();
      const gBrowser = normBrowser(g.browser);
      return gBrowser && recover && recover === account;
    });
    if (link) {
      plans.push({
        outlookId: o.id,
        outlookAccount: o.account,
        from: o.browser || null,
        to: normBrowser(link.browser),
        via: `gmail ${link.account} mail_recover`,
      });
    }
  }

  const ready = outlook
    .filter((o) => normBrowser(o.browser))
    .map((o) => ({ account: o.account, browser: normBrowser(o.browser), service: o.service }))
    .slice(0, 20);

  let applied = 0;
  if (APPLY && plans.length) {
    for (const plan of plans) {
      const { error: updErr } = await client
        .from("twofa_accounts")
        .update({ browser: plan.to, updated_at: new Date().toISOString() })
        .eq("id", plan.outlookId)
        .eq("user_id", userId);
      if (updErr) throw updErr;
      applied += 1;
    }
  }

  // Smoke: diagnose Outlook Login fill for first ready browser
  let diagnoseSample = null;
  const sampleBrowser = (plans[0] && APPLY ? plans[0].to : null) || ready[0]?.browser;
  if (sampleBrowser) {
    clearCredentialsCache();
    const diagnosis = await diagnoseMailCredentials(sampleBrowser, "Outlook");
    diagnoseSample = {
      browser: sampleBrowser,
      ok: diagnosis.ok,
      email: diagnosis.ok ? diagnosis.credentials?.email : null,
      reason: diagnosis.ok ? null : diagnosis.reason,
    };
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        apply: APPLY,
        scopeEmail,
        counts: {
          gmail: gmail.length,
          outlook: outlook.length,
          outlookMissingBrowser: outlook.filter((o) => !normBrowser(o.browser)).length,
          plans: plans.length,
          applied,
        },
        plans: plans.slice(0, 30),
        readySample: ready,
        diagnoseSample,
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
