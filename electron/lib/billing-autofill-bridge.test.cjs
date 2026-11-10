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
  } finally {
    delete process.env.STEALTH_BILLING_VAULT_PATH;
    try {
      fs.unlinkSync(tmpVault);
    } catch {
      /* ignore */
    }
  }
});
