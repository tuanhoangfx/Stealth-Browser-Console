"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  resolveProfileBiometricBillingIdentity,
  generateTotpCode,
  resolveBillingCardFromVault,
  resolveCandidateBillingCardsFromVault,
  listMaskedBillingCards,
  upsertBillingCardInVault,
  syncChatGptPlusPlanByVerifiedEmail,
} = require("./billing-autofill-bridge.cjs");

test("billing-autofill-bridge unifies Card Vault, Fallback Rotation (ok 1), Biometric Billing Address (ok 2), and RFC 6238 TOTP (ok 3)", () => {
  const tmpVault = path.join(os.tmpdir(), `p0003-billing-vault-test-${Date.now()}.json`);
  process.env.STEALTH_BILLING_VAULT_PATH = tmpVault;
  try {
    const bio = resolveProfileBiometricBillingIdentity("0001");
    assert.equal(bio.code, "0001");
    assert.equal(Boolean(bio.fullName), true);
    assert.equal(Boolean(bio.addressLine1), true);
    assert.equal(Boolean(bio.postalCode), true);
    assert.equal(bio.countryCode, "VN");

    const totp = generateTotpCode("JBSWY3DPEHPK3PXP", 1700000000000);
    assert.match(totp, /^\d{6}$/);

    const up = upsertBillingCardInVault("visa-main", {
      number: "4242 4242 4242 4242",
      expiry: "08/29",
      cvc: "123",
      name: "TUAN HOANG",
      postalCode: "700000",
      country: "VN",
    });
    assert.equal(up.ok, true);
    assert.equal(up.maskedCard, "**** **** **** 4242");
    assert.equal(up.expiry, "08/29");

    const listed = listMaskedBillingCards();
    assert.equal(listed.ok, true);
    assert.equal(listed.cards.some((c) => c.alias === "visa-main" && c.last4 === "4242"), true);
    for (const c of listed.cards) {
      assert.equal("number" in c, false);
      assert.equal("cvc" in c, false);
    }

    const resolved = resolveBillingCardFromVault({ cardAlias: "visa-main", profileCode: "0001" });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.card.number, "4242424242424242");
    assert.equal(resolved.card.exp.mmyy, "0829");
    assert.equal(resolved.card.cvc, "123");
    assert.equal(resolved.card.name, "TUAN HOANG");
    assert.equal(Boolean(resolved.card.addressLine1), true);
    assert.equal(Boolean(resolved.card.city), true);

    upsertBillingCardInVault("backup-card", {
      number: "5555 5555 5555 4444",
      expiry: "10/30",
      cvc: "999",
      name: "TUAN HOANG",
    });
    const pool = resolveCandidateBillingCardsFromVault({
      cardAlias: "visa-main",
      profileCode: "0001",
      excludeCards: ["4242"],
    });
    assert.equal(pool.ok, true);
    assert.equal(pool.candidates[0].last4, "4444");

    // Static bad data & domestic Napas 9704 cards are automatically filtered out by default
    upsertBillingCardInVault("napas-ocb", {
      number: "9704480313639738",
      expiry: "11/31",
      cvc: "598",
      name: "TUAN HOANG",
    });
    upsertBillingCardInVault("bad-cvc", {
      number: "4553720125721254",
      expiry: "08/29",
      cvc: "456",
      name: "TUAN HOANG",
    });
    upsertBillingCardInVault("bad-num-note", {
      number: "5438960063137331",
      expiry: "09/27",
      cvc: "123",
      name: "TUAN HOANG",
    });
    const rawVault = JSON.parse(fs.readFileSync(tmpVault, "utf8"));
    rawVault.cards["bad-cvc"].last_stripe_decline_code = "incorrect_cvc";
    rawVault.cards["bad-num-note"].note = "[Static Bad Data: incorrect_number]";
    fs.writeFileSync(tmpVault, JSON.stringify(rawVault, null, 2), "utf8");

    const filteredPool = resolveCandidateBillingCardsFromVault({ profileCode: "0001" });
    const filteredAliases = new Set(filteredPool.candidates.map((c) => c.alias));
    assert.equal(filteredAliases.has("napas-ocb"), false);
    assert.equal(filteredAliases.has("bad-cvc"), false);
    assert.equal(filteredAliases.has("bad-num-note"), false);
    assert.equal(filteredAliases.has("backup-card"), true);

    // GPay rejected cards (OR_MIVEM_02 / OR_CCREU_01) are filtered out when excludeGpayRejected is set
    rawVault.cards["gpay-bad-6169"] = {
      ...rawVault.cards["backup-card"],
      alias: "mb-bank-6169",
      last4: "6169",
      gpay_status: "rejected",
      gpay_last_code: "OR_MIVEM_02",
    };
    rawVault.cards["gpay-bad-7320"] = {
      ...rawVault.cards["backup-card"],
      alias: "mb-bank-7320",
      last4: "7320",
      gpay_status: "rejected",
      gpay_last_code: "OR_CCREU_01",
    };
    fs.writeFileSync(tmpVault, JSON.stringify(rawVault, null, 2), "utf8");
    const gpayPool = resolveCandidateBillingCardsFromVault({
      profileCode: "0001",
      excludeGpayRejected: true,
      includeTrialClaimed: true,
      includeDeclined: true,
    });
    const gpayAliases = new Set(gpayPool.candidates.map((c) => c.alias));
    assert.equal(gpayAliases.has("mb-bank-6169"), false);
    assert.equal(gpayAliases.has("mb-bank-7320"), false);
    assert.equal(gpayAliases.has("backup-card"), true);
  } finally {
    delete process.env.STEALTH_BILLING_VAULT_PATH;
    try {
      fs.unlinkSync(tmpVault);
    } catch {
      /* ignore */
    }
  }
});

test("syncChatGptPlusPlanByVerifiedEmail protects 8xxx/buyer/existing-plan rows and never emits #0000", async () => {
  const origFetch = globalThis.fetch;
  let patchCount = 0;
  process.env.SUPABASE_URL = "https://mock.databox.local";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-key";
  globalThis.fetch = async (_url, init = {}) => {
    if (String(init.method || "GET").toUpperCase() === "PATCH") {
      patchCount += 1;
      return { ok: true, status: 204, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "174101cf-bdfa-4720-b188-0994edf1f7ee",
          account: "thisisnotatshirt.vtg@gmail.com",
          browser: "8370",
          status: "active",
          ownership: "buyer",
          plan_package: "ChatGPT Plus 4m bhf 08/26 - Trần Quang Duy 101",
          note: "05/10/26 : 💎 Plan - ChatGPT Plus 4m bhf 08/26 - Trần Quang Duy 101",
        },
      ],
    };
  };
  try {
    const res = await syncChatGptPlusPlanByVerifiedEmail({
      email: "thisisnotatshirt.vtg@gmail.com",
      hasActiveSubscription: true,
      planType: "plus",
    });
    assert.equal(res.ok, true);
    assert.equal(res.skippedProtectedPlan, true);
    assert.equal(res.planPackage, "ChatGPT Plus 4m bhf 08/26 - Trần Quang Duy 101");
    assert.equal(patchCount, 0);
  } finally {
    globalThis.fetch = origFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
});

test("classifyOpenAiCheckoutConfirmPayload detects blocked, replaced session, and setup_intent", () => {
  const { classifyOpenAiCheckoutConfirmPayload } = require("./billing-autofill-bridge.cjs");

  const blocked = classifyOpenAiCheckoutConfirmPayload(200, JSON.stringify({ status: "blocked" }));
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.abortRetries, true);
  assert.equal(blocked.ok, false);

  const replaced = classifyOpenAiCheckoutConfirmPayload(
    200,
    JSON.stringify({ replaced_checkout_session: { id: "oaics_new" } })
  );
  assert.equal(replaced.replacedSession, true);
  assert.equal(replaced.abortRetries, false);

  const si = classifyOpenAiCheckoutConfirmPayload(200, JSON.stringify({ type: "setup_intent", status: "success" }));
  assert.equal(si.setupIntent, true);
  assert.equal(si.ok, true);
});

test("fetchChatGptEntitlementWithBearer parses Bearer entitlement without cookie fallback false positives", async () => {
  const { fetchChatGptEntitlementWithBearer } = require("./billing-autofill-bridge.cjs");

  const mockPage = {
    async evaluate(fn) {
      const prevFetch = globalThis.fetch;
      globalThis.fetch = async (url, opts) => {
        if (String(url).includes("/api/auth/session")) {
          return {
            ok: true,
            async json() {
              return { user: { email: "test@example.com" }, accessToken: "tok_123" };
            },
          };
        }
        assert.equal(opts?.headers?.authorization, "Bearer tok_123");
        return {
          ok: true,
          async json() {
            return {
              accounts: {
                default: {
                  entitlement: {
                    subscription_plan: "chatgptplusplan",
                    has_active_subscription: true,
                    expires_at: "2026-12-22T02:28:52+00:00",
                    renews_at: null,
                    cancels_at: "2026-12-21T20:28:52+00:00",
                  },
                },
              },
            };
          },
        };
      };
      try {
        return await fn();
      } finally {
        globalThis.fetch = prevFetch;
      }
    },
  };

  const res = await fetchChatGptEntitlementWithBearer(mockPage);
  assert.equal(res.ok, true);
  assert.equal(res.email, "test@example.com");
  assert.equal(res.plan, "chatgptplusplan");
  assert.equal(res.active, true);
  assert.equal(res.cancelsAt, "2026-12-21T20:28:52+00:00");
});
