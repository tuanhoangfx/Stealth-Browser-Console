"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_VAULT_PATHS = [
  "D:\\StealthBrowser\\vault\\billing-cards.json",
  "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\billing-cards.local.json",
];
const P0020_CARDS_CACHE_FILE = "D:\\StealthBrowser\\vault\\p0020-cards-cache.json";
const BIOMETRIC_VAULT_FILE = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\profile-biometric-vault.json";
const DATABOX_ORIGIN_CACHE_FILE = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\.databox-origin-auth.json";

const LOCKED_BANK_STK_SET = new Set(["0825846888"]);

const KNOWN_OPENAI_TRIAL_CLAIMED_MAP = new Map([
  ["msb-0516", { claimedAt: "2026-11-12T06:46:44.000Z", claimedBy: "khahaox28@outlook.com" }],
]);

const KNOWN_STRIPE_DECLINE_CODE_MAP = new Map([
  ["mb-bank-0819", "generic_decline"],
  ["mb-bank-7173", "generic_decline"],
  ["mb-bank-7603", "generic_decline"],
  ["mb-bank-7967", "generic_decline"],
  ["mb-bank-5339", "generic_decline"],
  ["mb-bank-8824", "generic_decline"],
  ["mb-bank-2114", "generic_decline"],
  ["mb-bank-1800", "generic_decline"],
  ["mb-bank-6697", "generic_decline"],
  ["mb-bank-3249", "generic_decline"],
  ["mb-bank-0865", "generic_decline"],
  ["mb-bank-8153", "generic_decline"],
  ["mb-bank-3784", "generic_decline"],
  ["mb-bank-0212", "generic_decline"],
  ["mb-bank-3864", "generic_decline"],
  ["mb-bank-5921", "generic_decline"],
  ["mb-bank-9728", "generic_decline"],
  ["mb-bank-4422", "generic_decline"],
  ["mb-bank-3140", "generic_decline"],
  ["mb-bank-8190", "generic_decline"],
  ["vietcombank-4853", "generic_decline"],
  ["vietcombank-5055", "generic_decline"],
  ["cake-0516", "generic_decline"],
  ["scb-2114", "generic_decline"],
  ["bidv-1916", "generic_decline"],
  ["acb-1234", "generic_decline"],
  ["vp-bank-0063", "generic_decline"],
  ["tp-bank-0613", "generic_decline"],
  ["liobank-9315", "generic_decline"],
  ["liobank-2372", "generic_decline"],
]);

const PROVINCE_POSTAL_MAP = {
  "001": { name: "Hà Nội", ascii: "Ha Noi", postalCode: "100000" },
  "079": { name: "TP. Hồ Chí Minh", ascii: "Ho Chi Minh City", postalCode: "700000" },
  "048": { name: "Đà Nẵng", ascii: "Da Nang", postalCode: "550000" },
  "031": { name: "Hải Phòng", ascii: "Hai Phong", postalCode: "180000" },
  "092": { name: "Cần Thơ", ascii: "Can Tho", postalCode: "900000" },
  "040": { name: "Nghệ An", ascii: "Nghe An", postalCode: "460000" },
  "038": { name: "Thanh Hóa", ascii: "Thanh Hoa", postalCode: "440000" },
  "027": { name: "Bắc Ninh", ascii: "Bac Ninh", postalCode: "160000" },
  "022": { name: "Quảng Ninh", ascii: "Quang Ninh", postalCode: "200000" },
  "075": { name: "Đồng Nai", ascii: "Dong Nai", postalCode: "810000" },
  "074": { name: "Bình Dương", ascii: "Binh Duong", postalCode: "820000" },
  "068": { name: "Lâm Đồng", ascii: "Lam Dong", postalCode: "670000" },
  "056": { name: "Khánh Hòa", ascii: "Khanh Hoa", postalCode: "650000" },
  "046": { name: "Thừa Thiên Huế", ascii: "Thua Thien Hue", postalCode: "530000" },
  "036": { name: "Nam Định", ascii: "Nam Dinh", postalCode: "420000" },
  "034": { name: "Thái Bình", ascii: "Thai Binh", postalCode: "410000" },
};

const VN_STREETS = [
  { vn: "Nguyễn Trãi", ascii: "Nguyen Trai" },
  { vn: "Lê Lợi", ascii: "Le Loi" },
  { vn: "Trần Hưng Đạo", ascii: "Tran Hung Dao" },
  { vn: "Lý Thường Kiệt", ascii: "Ly Thuong Kiet" },
  { vn: "Quang Trung", ascii: "Quang Trung" },
  { vn: "Điện Biên Phủ", ascii: "Dien Bien Phu" },
  { vn: "Hai Bà Trưng", ascii: "Hai Ba Trung" },
  { vn: "Phan Chu Trinh", ascii: "Phan Chu Trinh" },
];

function stripVietnameseDiacritics(str = "") {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim();
}

function getPrimaryVaultFilePath() {
  return process.env.STEALTH_BILLING_VAULT_PATH || DEFAULT_VAULT_PATHS[0];
}

function resolveDataboxRestCredentials() {
  let origin =
    process.env.DATABOX_ORIGIN_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";
  let key =
    process.env.DATABOX_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";
  if ((!origin || !key) && fs.existsSync(DATABOX_ORIGIN_CACHE_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DATABOX_ORIGIN_CACHE_FILE, "utf8"));
      if (!origin && parsed?.origin) origin = parsed.origin;
      if (!key && parsed?.key) key = parsed.key;
    } catch {
      /* ignore */
    }
  }
  if (!key) {
    try {
      const envPaths = [
        "E:\\Dev\\Tool\\P0002-Social-Hub\\.env.local",
        "E:\\Dev\\Tool\\P0002-Social-Hub\\.env",
        "E:\\Dev\\.env",
      ];
      for (const ep of envPaths) {
        if (!fs.existsSync(ep)) continue;
        const txt = fs.readFileSync(ep, "utf8");
        const m =
          txt.match(/^(?:SUPABASE_SERVICE_ROLE_KEY|VITE_SUPABASE_ANON_KEY|DATABOX_KEY)\s*=\s*["']?([^"'\r\n]+)["']?/m);
        if (m && m[1]) {
          key = m[1].trim();
          break;
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (!origin) origin = "https://api.tuanhoang.work";
  return { origin, key };
}

/**
 * Resolve Profile Biometric Identity & Billing Address (`ok 2`: Unified with Biometric Vault).
 */
function resolveProfileBiometricBillingIdentity(profileCode = "") {
  const code = String(profileCode || "").replace(/\D/g, "").padStart(4, "0");
  let item = null;
  try {
    if (fs.existsSync(BIOMETRIC_VAULT_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(BIOMETRIC_VAULT_FILE, "utf8")) || {};
      const items = Array.isArray(parsed.items) ? parsed.items : [];
      item = items.find((it) => String(it.code || "").padStart(4, "0") === code) || null;
    }
  } catch {
    /* ignore */
  }
  const uid = String(item?.uid || code || "0000");
  const hashHex = crypto.createHash("sha256").update(`${code}:${uid}`).digest("hex");
  const byte27 = Number.parseInt(hashHex.slice(54, 56), 16) || 0;
  const word14 = Number.parseInt(hashHex.slice(28, 32), 16) || 100;
  const provCode = String(item?.provinceCode || "001").padStart(3, "0");
  const provMeta = PROVINCE_POSTAL_MAP[provCode] || {
    name: item?.hometown || "Hà Nội",
    ascii: stripVietnameseDiacritics(item?.hometown || "Ha Noi"),
    postalCode: "100000",
  };
  const streetObj = VN_STREETS[byte27 % VN_STREETS.length];
  const houseNumber = 12 + (word14 % 380);
  const fullName = String(item?.fullName || "Hoàng Anh Tuấn").trim();
  const fullNameUpperAscii = stripVietnameseDiacritics(fullName).toUpperCase();
  const addressLine1 = item?.addressLine1 || `Số ${houseNumber} ${streetObj.vn}`;
  const addressLine1Ascii = item?.addressLine1Ascii || `${houseNumber} ${streetObj.ascii} St`;
  const city = item?.city || item?.hometown || provMeta.name;
  const cityAscii = item?.cityAscii || provMeta.ascii;
  const postalCode = item?.postalCode || provMeta.postalCode || "100000";
  const countryCode = item?.countryCode || "VN";

  return {
    code,
    uid,
    fullName,
    fullNameUpperAscii,
    nationalIdNumber: item?.nationalIdNumber || "",
    birthDate: item?.birthDate || "",
    addressLine1,
    addressLine1Ascii,
    city,
    cityAscii,
    state: cityAscii,
    postalCode,
    countryCode,
    googleMailAccount: item?.googleMailAccount || item?.mailRecover || "",
  };
}

/**
 * Pure Node RFC 6238 6-digit TOTP generator (`ok 3`: 2FA/TOTP autofill during checkout).
 */
function generateTotpCode(rawSecret = "", nowMs = Date.now()) {
  const clean = String(rawSecret || "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");
  if (clean.length < 8) return "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < clean.length; i += 1) {
    const idx = alphabet.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const keyBuf = Buffer.from(bytes);
  const counter = Math.floor(nowMs / 1000 / 30);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac("sha1", keyBuf).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codeInt =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1_000_000;
  return String(codeInt).padStart(6, "0");
}

function readBillingVaultStore() {
  if (process.env.STEALTH_BILLING_VAULT_PATH) {
    const customFp = process.env.STEALTH_BILLING_VAULT_PATH;
    try {
      if (fs.existsSync(customFp)) {
        const parsed = JSON.parse(fs.readFileSync(customFp, "utf8"));
        const c = parsed?.cards && typeof parsed.cards === "object" ? parsed.cards : parsed || {};
        return { path: customFp, cards: c };
      }
    } catch {
      /* ignore */
    }
    return { path: customFp, cards: {} };
  }

  const mergedCards = {};
  if (fs.existsSync(P0020_CARDS_CACHE_FILE)) {
    try {
      const p0020Parsed = JSON.parse(fs.readFileSync(P0020_CARDS_CACHE_FILE, "utf8"));
      const rows = p0020Parsed?.cards && typeof p0020Parsed.cards === "object" ? p0020Parsed.cards : {};
      Object.assign(mergedCards, rows);
    } catch {
      /* ignore */
    }
  }
  const activeVaultPath = fs.existsSync(P0020_CARDS_CACHE_FILE)
    ? P0020_CARDS_CACHE_FILE
    : getPrimaryVaultFilePath();

  for (const fp of DEFAULT_VAULT_PATHS) {
    try {
      if (!fp || !fs.existsSync(fp)) continue;
      const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
      if (parsed && typeof parsed === "object") {
        const c = parsed.cards && typeof parsed.cards === "object" ? parsed.cards : parsed;
        Object.assign(mergedCards, c);
      }
    } catch {
      /* ignore */
    }
  }
  return { path: activeVaultPath, cards: mergedCards };
}

/**
 * Syncs `service = 'Card'` rows from P0020 (`Account -> Card` tab) into `D:\StealthBrowser\vault\p0020-cards-cache.json`.
 * Automatically deletes expired cards (`MM/YY` < current month/year) from P0020 (`ok 2`).
 */
async function syncP0020CardsToLocalCache() {
  const { origin, key } = resolveDataboxRestCredentials();
  if (!origin || !key) return { ok: false, reason: "missing_databox_credentials" };
  try {
    const url = `${origin}/rest/v1/twofa_accounts?select=id,service,browser,account,password,phone,bank_login_id,bank_holder,bank_name,bank_stk,status,ownership,note&deleted_at=is.null&service=in.(Card,card)&limit=200`;
    const res = await fetch(url, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const rows = await res.json();
    if (!Array.isArray(rows)) return { ok: false, reason: "invalid_payload" };
    let existingCards = {};
    if (fs.existsSync(P0020_CARDS_CACHE_FILE)) {
      try {
        const prev = JSON.parse(fs.readFileSync(P0020_CARDS_CACHE_FILE, "utf8"));
        if (prev?.cards && typeof prev.cards === "object") existingCards = prev.cards;
      } catch {
        /* ignore */
      }
    }
    const cards = {};
    const purgedExpiredIds = [];
    for (const row of rows) {
      const pan = String(row.account || "").replace(/\D/g, "");
      const cvc = String(row.password || "").replace(/\D/g, "");
      const expiry = String(row.bank_login_id || "").trim();
      if (pan.length < 13 || !expiry || cvc.length < 3) continue;
      const expParts = normalizeExpiryParts(expiry);
      if (!isCardExpiryValid(expParts)) {
        if (row.id) {
          purgedExpiredIds.push({ id: row.id, last4: pan.slice(-4), expiry, bankName: row.bank_name || "" });
          await fetch(`${origin}/rest/v1/twofa_accounts?id=eq.${encodeURIComponent(row.id)}`, {
            method: "DELETE",
            headers: { apikey: key, authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(4000),
          }).catch(() => null);
        }
        continue;
      }
      const last4 = pan.slice(-4);
      const bankName = String(row.bank_name || "Card").trim();
      const holderName = String(row.bank_holder || "").trim();
      const bankStk = String(row.bank_stk || "").trim();
      const aliasKey = `${bankName.toLowerCase().replace(/\s+/g, "-")}-${last4}`;
      const prevEntry = existingCards[aliasKey] || existingCards[last4] || {};
      const knownTrial = KNOWN_OPENAI_TRIAL_CLAIMED_MAP.get(aliasKey) || null;
      const knownDecline = KNOWN_STRIPE_DECLINE_CODE_MAP.get(aliasKey) || null;
      const noteStr = String(row.note || "");
      const noteDeclinedMatch = noteStr.match(/declined[^(\r\n]*(?:\(([^)]+)\))?/i);
      const openaiTrialClaimedAt =
        prevEntry.openai_trial_claimed_at ||
        knownTrial?.claimedAt ||
        (/openai_trial_claimed|ChatGPT Plus 1m/i.test(noteStr) ? new Date().toISOString() : null);
      const openaiTrialClaimedBy =
        prevEntry.openai_trial_claimed_by || knownTrial?.claimedBy || null;
      const lastStripeDeclineCode =
        prevEntry.last_stripe_decline_code ||
        knownDecline ||
        (noteDeclinedMatch ? "generic_decline" : null);
      const lastStripeDeclinedAt =
        prevEntry.last_stripe_declined_at ||
        (lastStripeDeclineCode ? prevEntry.updatedAt || new Date().toISOString() : null);
      const lockedBankStk = LOCKED_BANK_STK_SET.has(bankStk);

      const entry = {
        id: row.id,
        alias: aliasKey,
        last4,
        number: pan,
        expiry,
        cvc,
        pin: String(row.phone || "").trim(),
        name: holderName,
        bankName,
        bankStk,
        locked_bank_stk: lockedBankStk,
        openai_trial_claimed_at: openaiTrialClaimedAt,
        openai_trial_claimed_by: openaiTrialClaimedBy,
        last_stripe_decline_code: lastStripeDeclineCode,
        last_stripe_declined_at: lastStripeDeclinedAt,
        status: String(row.status || "active"),
        ownership: String(row.ownership || "usable"),
        note: noteStr,
        source: "p0020_card_tab",
      };
      cards[aliasKey] = entry;
      if (!cards[last4] || cards[last4].last_stripe_decline_code || cards[last4].openai_trial_claimed_at) {
        cards[last4] = entry;
      }
      if (
        !cards.default &&
        entry.status === "active" &&
        !entry.locked_bank_stk &&
        !entry.openai_trial_claimed_at &&
        !entry.last_stripe_decline_code &&
        holderName.toUpperCase().includes("HOANG ANH TUAN")
      ) {
        cards.default = entry;
      }
    }
    if (!cards.default) {
      const firstEligible = Object.values(cards).find(
        (c) =>
          c &&
          typeof c === "object" &&
          !c.locked_bank_stk &&
          !c.openai_trial_claimed_at &&
          !c.last_stripe_decline_code,
      );
      if (firstEligible) {
        cards.default = firstEligible;
      } else {
        const firstKey = Object.keys(cards)[0];
        if (firstKey) cards.default = cards[firstKey];
      }
    }
    fs.mkdirSync(path.dirname(P0020_CARDS_CACHE_FILE), { recursive: true });
    fs.writeFileSync(
      P0020_CARDS_CACHE_FILE,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          count: rows.length - purgedExpiredIds.length,
          purgedExpiredIds,
          cards,
        },
        null,
        2,
      ),
      "utf8",
    );
    return {
      ok: true,
      count: rows.length - purgedExpiredIds.length,
      purgedExpiredIds,
      cachePath: P0020_CARDS_CACHE_FILE,
    };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

function maskCardNumber(pan) {
  const digits = String(pan || "").replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `**** **** **** ${digits.slice(-4)}`;
}

function normalizeExpiryParts(rawExpiry, expMonth, expYear) {
  let mm = String(expMonth || "").replace(/\D/g, "");
  let yy = String(expYear || "").replace(/\D/g, "");
  if ((!mm || !yy) && rawExpiry) {
    const clean = String(rawExpiry).trim();
    const slashMatch = clean.match(/^(\d{1,2})\s*[/\-.\s]\s*(\d{2,4})$/);
    if (slashMatch) {
      mm = slashMatch[1];
      yy = slashMatch[2];
    } else {
      const digits = clean.replace(/\D/g, "");
      if (digits.length === 4) {
        mm = digits.slice(0, 2);
        yy = digits.slice(2, 4);
      } else if (digits.length === 6) {
        mm = digits.slice(0, 2);
        yy = digits.slice(4, 6);
      }
    }
  }
  if (mm.length === 1) mm = `0${mm}`;
  const yyyy = yy.length === 2 ? `20${yy}` : yy;
  const yy2 = yy.length === 4 ? yy.slice(-2) : yy;
  return {
    mm,
    yy: yy2,
    yyyy,
    mmyy: mm && yy2 ? `${mm}${yy2}` : "",
    formatted: mm && yy2 ? `${mm}/${yy2}` : "",
  };
}

function isCardExpiryValid(expParts, nowDate = new Date()) {
  const mm = Number(expParts?.mm || 0);
  const yyyy = Number(expParts?.yyyy || 0);
  if (mm < 1 || mm > 12 || yyyy < 2000) return false;
  const curYear = nowDate.getUTCFullYear();
  const curMonth = nowDate.getUTCMonth() + 1;
  return yyyy > curYear || (yyyy === curYear && mm >= curMonth);
}

function resolveBillingCardFromVault(opts = {}) {
  const alias = String(opts.cardAlias || opts.alias || "default").trim() || "default";
  const profileCode = String(opts.profileCode || "").replace(/\D/g, "").padStart(4, "0");
  const biometric = resolveProfileBiometricBillingIdentity(profileCode);
  const { cards, path: vaultPath } = readBillingVaultStore();

  let rawEntry = cards[alias];
  if (!rawEntry) {
    const lowerAlias = alias.toLowerCase();
    const allEntries = Object.values(cards).filter((v) => v && typeof v === "object");
    if (alias !== "default") {
      rawEntry = allEntries.find(
        (c) =>
          String(c.last4 || "") === alias ||
          String(c.id || "") === alias ||
          String(c.bankName || "").toLowerCase() === lowerAlias ||
          String(c.name || "").toLowerCase() === lowerAlias,
      );
    }
    if (!rawEntry && biometric.fullNameUpperAscii) {
      rawEntry = allEntries.find(
        (c) =>
          stripVietnameseDiacritics(c.name || "").toUpperCase() === biometric.fullNameUpperAscii &&
          c.status !== "inactive",
      );
    }
    if (!rawEntry) {
      rawEntry = cards.default || allEntries[0] || null;
    }
  }

  if (!rawEntry && process.env.STEALTH_BILLING_CARD_NUMBER) {
    rawEntry = {
      number: process.env.STEALTH_BILLING_CARD_NUMBER,
      expiry: process.env.STEALTH_BILLING_CARD_EXPIRY || "",
      cvc: process.env.STEALTH_BILLING_CARD_CVC || "",
      name: process.env.STEALTH_BILLING_CARD_NAME || biometric.fullNameUpperAscii,
      postalCode: process.env.STEALTH_BILLING_ZIP || biometric.postalCode,
      country: process.env.STEALTH_BILLING_COUNTRY || biometric.countryCode,
    };
  }

  if (!rawEntry || typeof rawEntry !== "object") {
    return {
      ok: false,
      error: `billing_card_not_found_in_vault (alias="${alias}", vault="${vaultPath}")`,
      vaultPath,
      alias,
    };
  }

  const number = String(rawEntry.number || rawEntry.pan || rawEntry.cardNumber || "").replace(/\D/g, "");
  const cvc = String(rawEntry.cvc || rawEntry.cvv || rawEntry.cardCvc || "").replace(/\D/g, "");
  const exp = normalizeExpiryParts(
    rawEntry.expiry || rawEntry.cardExpiry || rawEntry.exp,
    rawEntry.expMonth || rawEntry.month,
    rawEntry.expYear || rawEntry.year,
  );
  const name = String(
    rawEntry.name || rawEntry.holderName || rawEntry.billingName || biometric.fullNameUpperAscii || "",
  ).trim();
  const postalCode = String(rawEntry.postalCode || rawEntry.zip || biometric.postalCode || "100000").trim();
  const country = String(rawEntry.country || biometric.countryCode || "VN").trim();

  if (number.length < 13 || !exp.mmyy || cvc.length < 3) {
    return {
      ok: false,
      error: `billing_card_incomplete_in_vault (alias="${alias}")`,
      vaultPath,
      alias,
    };
  }
  if (!isCardExpiryValid(exp)) {
    return {
      ok: false,
      error: `billing_card_expired (alias="${alias}", exp="${exp.formatted}")`,
      vaultPath,
      alias,
    };
  }

  const entryAlias = String(rawEntry.alias || alias).toLowerCase();
  const knownTrial = KNOWN_OPENAI_TRIAL_CLAIMED_MAP.get(entryAlias) || null;
  const knownDecline = KNOWN_STRIPE_DECLINE_CODE_MAP.get(entryAlias) || null;
  const lockedBankStk =
    Boolean(rawEntry.locked_bank_stk) || LOCKED_BANK_STK_SET.has(String(rawEntry.bankStk || "").trim());
  const openaiTrialClaimedAt = rawEntry.openai_trial_claimed_at || knownTrial?.claimedAt || null;
  const openaiTrialClaimedBy = rawEntry.openai_trial_claimed_by || knownTrial?.claimedBy || null;
  const lastStripeDeclineCode =
    rawEntry.last_stripe_decline_code ||
    knownDecline ||
    (/declined/i.test(String(rawEntry.note || "")) ? "generic_decline" : null);
  const lastStripeDeclinedAt = rawEntry.last_stripe_declined_at || null;

  return {
    ok: true,
    id: rawEntry.id || "",
    alias: rawEntry.alias || alias,
    last4: number.slice(-4),
    vaultPath,
    maskedCard: maskCardNumber(number),
    bankName: rawEntry.bankName || "",
    bankStk: String(rawEntry.bankStk || ""),
    locked_bank_stk: lockedBankStk,
    openai_trial_claimed_at: openaiTrialClaimedAt,
    openai_trial_claimed_by: openaiTrialClaimedBy,
    last_stripe_decline_code: lastStripeDeclineCode,
    last_stripe_declined_at: lastStripeDeclinedAt,
    biometric,
    card: {
      number,
      cvc,
      pin: String(rawEntry.pin || ""),
      exp,
      name,
      addressLine1: rawEntry.addressLine1 || biometric.addressLine1Ascii || biometric.addressLine1,
      city: rawEntry.city || biometric.cityAscii || biometric.city,
      state: rawEntry.state || biometric.cityAscii || biometric.city,
      postalCode,
      country,
    },
  };
}

/**
 * Returns an ordered candidate list of active cards from P0020 Card Vault for Fallback Card Rotation (`ok 1`).
 */
function resolveCandidateBillingCardsFromVault(opts = {}) {
  const excludeAliases = new Set(
    (Array.isArray(opts.excludeCards) ? opts.excludeCards : []).map((x) => String(x || "").toLowerCase()),
  );
  const includeTrialClaimed = Boolean(opts.includeTrialClaimed);
  const includeDeclined = Boolean(opts.includeDeclined);
  const isCardDisqualified = (resolved) => {
    if (!resolved || !resolved.ok || !resolved.card?.number) return true;
    if (resolved.locked_bank_stk) return true;
    if (!includeTrialClaimed && resolved.openai_trial_claimed_at) return true;
    if (!includeDeclined && resolved.last_stripe_decline_code) return true;
    const al = String(resolved.alias || "").toLowerCase();
    const l4 = String(resolved.last4 || "").toLowerCase();
    if (excludeAliases.has(al) || excludeAliases.has(l4)) return true;
    return false;
  };

  const primary = resolveBillingCardFromVault(opts);
  const candidates = [];
  const seenNumbers = new Set();

  if (!isCardDisqualified(primary)) {
    seenNumbers.add(primary.card.number);
    candidates.push(primary);
  }

  const profileCode = String(opts.profileCode || "").replace(/\D/g, "").padStart(4, "0");
  const biometric = primary.biometric || resolveProfileBiometricBillingIdentity(profileCode);
  const { cards, path: vaultPath } = readBillingVaultStore();

  const PREFERRED_ALIASES = [
    "mb-bank-0400",
    "mb-bank-6169",
    "mb-bank-3863",
    "mb-bank-3478",
    "mb-bank-7302",
    "mb-bank-7528",
  ];

  const bankRank = (bankName = "") => {
    const b = String(bankName || "").toLowerCase();
    if (b.includes("mastercard") || b.includes("visa") || b.includes("msb")) return 1;
    if (b.includes("techcombank") || b.includes("vp") || b.includes("mb")) return 2;
    if (b.includes("vietcombank") || b.includes("acb") || b.includes("tp")) return 3;
    return 4;
  };

  const allRaw = Object.values(cards)
    .filter((v) => v && typeof v === "object" && v.status !== "inactive")
    .sort((a, b) => {
      const aDeclined = a.last_stripe_decline_code || /declined/i.test(String(a.note || "")) ? 1 : 0;
      const bDeclined = b.last_stripe_decline_code || /declined/i.test(String(b.note || "")) ? 1 : 0;
      if (aDeclined !== bDeclined) return aDeclined - bDeclined;
      const aClaimed = a.openai_trial_claimed_at ? 1 : 0;
      const bClaimed = b.openai_trial_claimed_at ? 1 : 0;
      if (aClaimed !== bClaimed) return aClaimed - bClaimed;
      const aPref = PREFERRED_ALIASES.indexOf(String(a.alias || "").toLowerCase());
      const bPref = PREFERRED_ALIASES.indexOf(String(b.alias || "").toLowerCase());
      if (aPref !== -1 || bPref !== -1) {
        return (aPref !== -1 ? aPref : 999) - (bPref !== -1 ? bPref : 999);
      }
      const aMatchBio =
        stripVietnameseDiacritics(a.name || "").toUpperCase() === biometric.fullNameUpperAscii ? 0 : 1;
      const bMatchBio =
        stripVietnameseDiacritics(b.name || "").toUpperCase() === biometric.fullNameUpperAscii ? 0 : 1;
      if (aMatchBio !== bMatchBio) return aMatchBio - bMatchBio;
      return bankRank(a.bankName) - bankRank(b.bankName);
    });

  for (const raw of allRaw) {
    const num = String(raw.number || raw.pan || raw.cardNumber || "").replace(/\D/g, "");
    if (num.length < 13 || seenNumbers.has(num)) continue;
    const last4 = num.slice(-4);
    const entryAlias = String(raw.alias || last4);
    const res = resolveBillingCardFromVault({ ...opts, cardAlias: entryAlias });
    if (!isCardDisqualified(res) && !seenNumbers.has(res.card.number)) {
      seenNumbers.add(res.card.number);
      candidates.push(res);
    }
  }

  return { ok: candidates.length > 0, vaultPath, biometric, candidates };
}

/**
 * Stamps `openai_trial_claimed_at` or `last_stripe_decline_code` directly in `p0020-cards-cache.json` (`ok 1`).
 */
function recordCardStripeOutcome({
  alias = "",
  last4 = "",
  outcome = "",
  declineCode = "",
  claimedBy = "",
} = {}) {
  const cleanAlias = String(alias || "").trim().toLowerCase();
  const cleanLast4 = String(last4 || cleanAlias.slice(-4) || "").replace(/\D/g, "").slice(-4);
  if (!cleanAlias && !cleanLast4) {
    return { ok: false, error: "missing_card_alias_or_last4" };
  }
  const nowIso = new Date().toISOString();
  let parsed = { updatedAt: nowIso, count: 0, purgedExpiredIds: [], cards: {} };
  if (fs.existsSync(P0020_CARDS_CACHE_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(P0020_CARDS_CACHE_FILE, "utf8"));
      if (raw && typeof raw === "object") {
        parsed = {
          ...raw,
          cards: raw.cards && typeof raw.cards === "object" ? raw.cards : {},
        };
      }
    } catch {
      /* ignore */
    }
  }
  let matchedCount = 0;
  for (const [k, entry] of Object.entries(parsed.cards || {})) {
    if (!entry || typeof entry !== "object") continue;
    const entryAlias = String(entry.alias || k || "").toLowerCase();
    const entryLast4 = String(entry.last4 || "").trim();
    if (
      (cleanAlias && (entryAlias === cleanAlias || k.toLowerCase() === cleanAlias)) ||
      (!cleanAlias && cleanLast4 && entryLast4 === cleanLast4)
    ) {
      if (outcome === "trial_claimed" || outcome === "openai_trial_claimed") {
        entry.openai_trial_claimed_at = entry.openai_trial_claimed_at || nowIso;
        if (claimedBy) entry.openai_trial_claimed_by = String(claimedBy).trim();
      } else if (outcome === "card_declined" || declineCode) {
        entry.last_stripe_decline_code = String(declineCode || "generic_decline").trim();
        entry.last_stripe_declined_at = nowIso;
      }
      entry.updatedAt = nowIso;
      matchedCount += 1;
    }
  }
  parsed.updatedAt = nowIso;
  fs.mkdirSync(path.dirname(P0020_CARDS_CACHE_FILE), { recursive: true });
  fs.writeFileSync(P0020_CARDS_CACHE_FILE, JSON.stringify(parsed, null, 2), "utf8");
  return {
    ok: true,
    matchedCount,
    alias: cleanAlias,
    last4: cleanLast4,
    outcome,
    declineCode: declineCode || null,
    updatedAt: nowIso,
  };
}

/**
 * Record Linked Card (`4 Digits`) or Declined status into Biometric Vault & P0020 `twofa_accounts` (`ok 2`).
 */
async function recordLinkedCardAssociation({
  profileCode = "",
  cardResolved = null,
  pageUrl = "",
  status = "linked",
  declineReason = "",
} = {}) {
  if (!cardResolved || !cardResolved.card?.number) return { ok: false, reason: "missing_card" };
  const code = String(profileCode || cardResolved.biometric?.code || "").replace(/\D/g, "").padStart(4, "0");
  const last4 = cardResolved.last4 || cardResolved.card.number.slice(-4);
  const bankName = cardResolved.bankName || "Card";
  const holderName = cardResolved.card.name || "";
  let host = "checkout";
  try {
    if (pageUrl) host = new URL(pageUrl).hostname.replace(/^www\./, "") || "checkout";
  } catch {
    /* ignore */
  }
  const nowIso = new Date().toISOString();
  const dateShort = nowIso.slice(0, 10);

  // 1. Update local Biometric Vault (`profile-biometric-vault.json`) if status === "linked"
  let biometricUpdated = false;
  if (status === "linked" && /^\d{4}$/.test(code) && fs.existsSync(BIOMETRIC_VAULT_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(BIOMETRIC_VAULT_FILE, "utf8")) || {};
      if (Array.isArray(parsed.items)) {
        const item = parsed.items.find((it) => String(it.code || "").padStart(4, "0") === code);
        if (item) {
          item.linkedCardLast4 = last4;
          item.linkedCardBank = bankName;
          item.linkedCardHolder = holderName;
          item.linkedCardUpdatedAt = nowIso;
          fs.writeFileSync(BIOMETRIC_VAULT_FILE, JSON.stringify(parsed, null, 2), "utf8");
          biometricUpdated = true;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 2. Patch P0020 `twofa_accounts` notes for both the Card row and the Profile Service Account row
  const { origin, key } = resolveDataboxRestCredentials();
  let p0020Patched = false;
  if (origin && key) {
    try {
      if (cardResolved.id) {
        const tag =
          status === "declined"
            ? `⚠️ Declined on ${host} (${dateShort}${declineReason ? `: ${declineReason}` : ""})`
            : `🔗 #${code} (${host} · ${dateShort})`;
        const rGet = await fetch(
          `${origin}/rest/v1/twofa_accounts?select=id,note&id=eq.${encodeURIComponent(cardResolved.id)}&limit=1`,
          { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) },
        );
        const rows = rGet.ok ? await rGet.json().catch(() => []) : [];
        const existingNote = String(rows?.[0]?.note || "").trim();
        if (!existingNote.includes(tag)) {
          const nextNote = existingNote ? `${existingNote}\n${tag}` : tag;
          await fetch(`${origin}/rest/v1/twofa_accounts?id=eq.${encodeURIComponent(cardResolved.id)}`, {
            method: "PATCH",
            headers: {
              apikey: key,
              authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              Prefer: "return=minimal",
            },
            body: JSON.stringify({ note: nextNote, updated_at: nowIso }),
            signal: AbortSignal.timeout(4000),
          });
          p0020Patched = true;
        }
      }
      if (status === "linked" && /^\d{4}$/.test(code)) {
        const rAcct = await fetch(
          `${origin}/rest/v1/twofa_accounts?select=id,service,note&deleted_at=is.null&browser=eq.${encodeURIComponent(code)}&limit=10`,
          { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) },
        );
        const acctRows = rAcct.ok ? await rAcct.json().catch(() => []) : [];
        const matchAcct =
          acctRows.find((r) => host.includes(String(r.service || "").toLowerCase())) || acctRows[0] || null;
        if (matchAcct?.id) {
          const cardTag = `💳 Card *${last4} (${bankName})`;
          const curNote = String(matchAcct.note || "").trim();
          if (!curNote.includes(cardTag)) {
            const nextNote = curNote ? `${curNote}\n${cardTag}` : cardTag;
            await fetch(`${origin}/rest/v1/twofa_accounts?id=eq.${encodeURIComponent(matchAcct.id)}`, {
              method: "PATCH",
              headers: {
                apikey: key,
                authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({ note: nextNote, updated_at: nowIso }),
              signal: AbortSignal.timeout(4000),
            });
          }
        }
      }
    } catch {
      /* ignore network errors */
    }
  }

  return { ok: true, code, last4, bankName, status, biometricUpdated, p0020Patched };
}

function listMaskedBillingCards() {
  const { cards, path: vaultPath } = readBillingVaultStore();
  const seen = new Set();
  const items = [];
  for (const [alias, raw] of Object.entries(cards || {})) {
    if (!raw || typeof raw !== "object") continue;
    const number = String(raw.number || raw.pan || raw.cardNumber || "").replace(/\D/g, "");
    if (!number) continue;
    const dedupKey = process.env.STEALTH_BILLING_VAULT_PATH ? `${alias}:${number}` : number;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const exp = normalizeExpiryParts(
      raw.expiry || raw.cardExpiry || raw.exp,
      raw.expMonth || raw.month,
      raw.expYear || raw.year,
    );
    items.push({
      alias: raw.alias || alias,
      maskedCard: maskCardNumber(number),
      last4: number.slice(-4),
      expiry: exp.formatted,
      holderName: String(raw.name || raw.holderName || raw.billingName || ""),
      bankName: String(raw.bankName || ""),
      country: String(raw.country || "VN"),
      source: raw.source || "local_vault",
    });
  }
  return { ok: true, vaultPath, totalCards: items.length, cards: items };
}

function upsertBillingCardInVault(alias, cardInput = {}) {
  const cleanAlias = String(alias || cardInput.alias || "default").trim() || "default";
  const vaultPath = getPrimaryVaultFilePath();
  let cards = {};
  if (fs.existsSync(vaultPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
      cards = parsed?.cards && typeof parsed.cards === "object" ? parsed.cards : parsed || {};
    } catch {
      cards = {};
    }
  }
  const number = String(cardInput.number || cardInput.cardNumber || cardInput.pan || "").replace(/\D/g, "");
  const cvc = String(cardInput.cvc || cardInput.cvv || cardInput.cardCvc || "").replace(/\D/g, "");
  const exp = normalizeExpiryParts(
    cardInput.expiry || cardInput.cardExpiry || cardInput.exp,
    cardInput.expMonth || cardInput.month,
    cardInput.expYear || cardInput.year,
  );
  if (number.length < 13 || !exp.mmyy || cvc.length < 3) {
    return { ok: false, error: "Invalid card number, expiry (MM/YY), or CVC" };
  }
  cards[cleanAlias] = {
    alias: cleanAlias,
    last4: number.slice(-4),
    number,
    expiry: exp.formatted,
    expMonth: exp.mm,
    expYear: exp.yyyy,
    cvc,
    name: String(cardInput.name || cardInput.holderName || cardInput.billingName || "").trim(),
    postalCode: String(cardInput.postalCode || cardInput.zip || "").trim(),
    country: String(cardInput.country || "VN").trim(),
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(vaultPath), { recursive: true });
  fs.writeFileSync(vaultPath, JSON.stringify({ cards }, null, 2), "utf8");
  return {
    ok: true,
    alias: cleanAlias,
    maskedCard: maskCardNumber(number),
    expiry: exp.formatted,
    vaultPath,
  };
}

/**
 * Look up Profile's account credentials (password + TOTP secret) in P0020 (`ok 3`).
 */
async function resolveProfileAccountCredentialsFromP0020(profileCode = "", pageUrl = "") {
  const code = String(profileCode || "").replace(/\D/g, "").padStart(4, "0");
  if (!/^\d{4}$/.test(code)) return null;
  const { origin, key } = resolveDataboxRestCredentials();
  if (!origin || !key) return null;
  try {
    const url = `${origin}/rest/v1/twofa_accounts?select=id,service,account,password,secret&deleted_at=is.null&browser=eq.${encodeURIComponent(code)}&limit=20`;
    const res = await fetch(url, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const lowerUrl = String(pageUrl || "").toLowerCase();
    let best = rows.find((r) => {
      const svc = String(r.service || "").toLowerCase();
      return svc && lowerUrl.includes(svc);
    });
    if (!best && (lowerUrl.includes("google") || lowerUrl.includes("youtube"))) {
      best = rows.find((r) => /gmail|google/i.test(String(r.service || "")));
    }
    if (!best) {
      best = rows.find((r) => r.secret && r.password) || rows.find((r) => r.secret || r.password) || rows[0];
    }
    const totpCode = best?.secret ? generateTotpCode(best.secret) : "";
    return {
      service: best?.service || "",
      account: best?.account || "",
      password: best?.password || "",
      totpCode,
    };
  } catch {
    return null;
  }
}

const FIELD_SELECTORS = {
  cardNumber: [
    "#payment-numberInput",
    'input[name="number"]',
    'input[autocomplete="cc-number"]',
    'input[data-elements-stable-field-name="cardNumber"]',
    'input[name="cardnumber"]',
    'input[name="cardNumber"]',
    'input[name="ccnumber"]',
    'input[id*="cardNumber" i]',
    'input[id*="card-number" i]',
    'input[aria-label*="Card number" i]',
    'input[aria-label*="Số thẻ" i]',
    'input[placeholder*="1234 1234" i]',
  ],
  cardExpiry: [
    "#payment-expiryInput",
    'input[autocomplete="cc-exp"]',
    'input[data-elements-stable-field-name="cardExpiry"]',
    'input[name="exp-date"]',
    'input[name="cardExpiry"]',
    'input[name="expiry"]',
    'input[id*="cardExpiry" i]',
    'input[placeholder*="MM / YY" i]',
    'input[placeholder*="MM/YY" i]',
  ],
  cardCvc: [
    "#payment-cvcInput",
    'input[autocomplete="cc-csc"]',
    'input[data-elements-stable-field-name="cardCvc"]',
    'input[name="cvc"]',
    'input[name="cvv"]',
    'input[name="cardCvc"]',
    'input[name="securityCode"]',
    'input[id*="cardCvc" i]',
    'input[aria-label*="CVC" i]',
    'input[aria-label*="CVV" i]',
    'input[aria-label*="Security code" i]',
  ],
  cardName: [
    "#billingAddress-nameInput",
    'input[name="name"]',
    'input[autocomplete="cc-name"]',
    'input[autocomplete="billing name"]',
    'input[data-elements-stable-field-name="name"]',
    'input[name="billingName"]',
    'input[name="cardholderName"]',
    'input[name="nameOnCard"]',
    'input[id*="billingName" i]',
    'input[aria-label*="Full name" i]',
    'input[aria-label*="Name on card" i]',
    'input[aria-label*="Cardholder name" i]',
    'input[aria-label*="Tên trên thẻ" i]',
  ],
  addressLine1: [
    "#billingAddress-addressLine1Input",
    'input[autocomplete="billing address-line1"]',
    'input[autocomplete="address-line1"]',
    'input[autocomplete="street-address"]',
    'input[data-elements-stable-field-name="addressLine1"]',
    'input[name="addressLine1"]',
    'input[name="billingAddressLine1"]',
    'input[name="address1"]',
    'input[name="line1"]',
    'input[aria-label*="Address line 1" i]',
    'input[aria-label*="Street address" i]',
    'input[aria-label*="Địa chỉ" i]',
  ],
  city: [
    "#billingAddress-localityInput",
    'input[autocomplete="billing address-level2"]',
    'input[autocomplete="address-level2"]',
    'input[data-elements-stable-field-name="locality"]',
    'input[name="city"]',
    'input[name="locality"]',
    'input[name="billingCity"]',
    'input[aria-label*="City" i]',
    'input[aria-label*="Thành phố" i]',
  ],
  state: [
    "#billingAddress-administrativeAreaInput",
    'select[name="administrativeArea"]',
    'input[name="administrativeArea"]',
    'select[name="state"]',
    'input[autocomplete="billing address-level1"]',
    'input[autocomplete="address-level1"]',
    'input[data-elements-stable-field-name="administrativeArea"]',
    'input[name="state"]',
    'input[name="province"]',
    'input[name="region"]',
  ],
  postalCode: [
    "#billingAddress-postalCodeInput",
    'input[autocomplete="billing postal-code"]',
    'input[autocomplete="postal-code"]',
    'input[data-elements-stable-field-name="postalCode"]',
    'input[name="postal"]',
    'input[name="postalCode"]',
    'input[name="billingPostalCode"]',
    'input[name="zip"]',
    'input[aria-label*="Postal code" i]',
    'input[aria-label*="ZIP" i]',
    'input[aria-label*="Mã bưu chính" i]',
  ],
  totpCode: [
    'input[autocomplete="one-time-code"]',
    'input[name="totpPin"]',
    'input[name*="totp" i]',
    'input[name*="otp" i]',
    'input[id*="totp" i]',
    'input[id*="idvPin" i]',
    'input[aria-label*="verification code" i]',
    'input[aria-label*="6-digit code" i]',
    'input[aria-label*="Authenticator" i]',
    'input[aria-label*="mã xác minh" i]',
  ],
  reauthPassword: [
    'input[type="password"][name="Passwd"]',
    'input[type="password"][name="password"]',
    'input[type="password"][autocomplete="current-password"]',
  ],
};

async function tryFillInAllFrames(page, selectors, value, { sequential = true } = {}) {
  if (!value) return { filled: false };
  const frames = page.frames();
  for (const frame of frames) {
    for (const sel of selectors) {
      try {
        const loc = frame.locator(sel).first();
        const count = await loc.count().catch(() => 0);
        if (count < 1) continue;
        const visible = await loc.isVisible().catch(() => false);
        if (!visible) continue;
        const tag = await loc.evaluate((el) => el.tagName).catch(() => "");
        if (tag === "SELECT") {
          const picked = await loc
            .selectOption({ label: String(value) }, { timeout: 1200 })
            .catch(() => loc.selectOption({ value: String(value) }, { timeout: 1200 }))
            .catch(() => loc.selectOption({ index: 1 }, { timeout: 1200 }))
            .catch(() => null);
          if (picked) {
            return { filled: true, selector: sel, frameUrl: frame.url() };
          }
          continue;
        }
        await loc.click({ timeout: 1500 }).catch(() => {});
        await loc.fill("").catch(() => {});
        if (sequential) {
          await loc.pressSequentially(String(value), { delay: 18 });
        } else {
          await loc.fill(String(value));
        }
        return { filled: true, selector: sel, frameUrl: frame.url() };
      } catch {
        /* try next selector / frame */
      }
    }
  }
  return { filled: false };
}

const DECLINE_ERROR_REGEX =
  /your card was declined|card has been declined|insufficient funds|do not honor|generic_decline|invalid card number|card number is invalid|thẻ của bạn bị từ chối|thẻ bị từ chối|không đủ số dư|số thẻ không hợp lệ/i;

async function detectPaymentDeclineInPage(page) {
  for (const frame of page.frames()) {
    try {
      const alertText = await frame
        .locator('[role="alert"], .FieldError, .StripeElement--invalid, [class*="error" i], [id*="error" i]')
        .allInnerTexts()
        .then((arr) => arr.join(" | "))
        .catch(() => "");
      if (alertText && DECLINE_ERROR_REGEX.test(alertText)) {
        const m = alertText.match(DECLINE_ERROR_REGEX);
        return { declined: true, reason: m ? m[0] : alertText.slice(0, 120) };
      }
    } catch {
      /* ignore frame error */
    }
  }
  return { declined: false, reason: "" };
}

async function autofillProfileBillingViaCdp(opts = {}) {
  const wsEndpoint = String(opts.wsEndpoint || "").trim();
  if (!wsEndpoint) {
    return { ok: false, error: "missing_cdp_ws_endpoint" };
  }
  if (!fs.existsSync(P0020_CARDS_CACHE_FILE) && !process.env.STEALTH_BILLING_VAULT_PATH) {
    await syncP0020CardsToLocalCache().catch(() => null);
  }
  const pool = resolveCandidateBillingCardsFromVault(opts);
  if (!pool.ok || pool.candidates.length === 0) {
    return resolveBillingCardFromVault(opts);
  }

  let playwright;
  try {
    playwright = require("playwright-core");
  } catch (err) {
    return { ok: false, error: `playwright_unavailable: ${err.message}` };
  }

  const browser = await playwright.chromium.connectOverCDP(wsEndpoint, { timeout: 12000 });
  try {
    const allPages = [];
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        const u = p.url() || "";
        if (!u.startsWith("devtools://") && !u.startsWith("chrome-extension://")) {
          allPages.push(p);
        }
      }
    }
    if (allPages.length === 0) {
      return { ok: false, error: "no_open_page_in_profile" };
    }

    const urlIncludes = String(opts.urlIncludes || "").trim().toLowerCase();
    let targetPage = allPages[allPages.length - 1];
    if (urlIncludes) {
      const matched = allPages.find((p) => (p.url() || "").toLowerCase().includes(urlIncludes));
      if (matched) targetPage = matched;
    } else {
      for (const p of [...allPages].reverse()) {
        const frameUrls = p.frames().map((f) => (f.url() || "").toLowerCase());
        if (
          frameUrls.some(
            (u) =>
              u.includes("stripe.com") ||
              u.includes("checkout") ||
              u.includes("billing") ||
              u.includes("braintree") ||
              u.includes("adyen") ||
              u.includes("pay.google.com"),
          )
        ) {
          targetPage = p;
          break;
        }
      }
    }

    const maxAttempts = opts.autoRotateOnDecline === false ? 1 : Math.min(pool.candidates.length, Number(opts.maxRotations) || 3);
    const rotatedDeclinedCards = [];
    let chosenResolved = pool.candidates[0];
    let filledFields = [];

    const accountCreds =
      opts.includeTotp !== false
        ? await resolveProfileAccountCredentialsFromP0020(
            opts.profileCode || chosenResolved.biometric.code,
            targetPage.url(),
          )
        : null;

    for (let idx = 0; idx < maxAttempts; idx += 1) {
      chosenResolved = pool.candidates[idx];
      const { card } = chosenResolved;
      filledFields = [];

      if (idx === 0 && accountCreds?.password) {
        const pwRes = await tryFillInAllFrames(targetPage, FIELD_SELECTORS.reauthPassword, accountCreds.password, {
          sequential: false,
        });
        if (pwRes.filled) filledFields.push("reauthPassword");
      }

      const numRes = await tryFillInAllFrames(targetPage, FIELD_SELECTORS.cardNumber, card.number, { sequential: true });
      if (numRes.filled) filledFields.push("cardNumber");

      const expRes = await tryFillInAllFrames(targetPage, FIELD_SELECTORS.cardExpiry, card.exp.mmyy, { sequential: true });
      if (expRes.filled) filledFields.push("cardExpiry");

      const cvcRes = await tryFillInAllFrames(targetPage, FIELD_SELECTORS.cardCvc, card.cvc, { sequential: true });
      if (cvcRes.filled) filledFields.push("cardCvc");

      if (card.name) {
        const nameRes = await tryFillInAllFrames(targetPage, FIELD_SELECTORS.cardName, card.name, { sequential: false });
        if (nameRes.filled) filledFields.push("cardName");
      }

      if (card.addressLine1) {
        const addrRes = await tryFillInAllFrames(targetPage, FIELD_SELECTORS.addressLine1, card.addressLine1, {
          sequential: false,
        });
        if (addrRes.filled) filledFields.push("addressLine1");
      }

      if (card.city) {
        const cityRes = await tryFillInAllFrames(targetPage, FIELD_SELECTORS.city, card.city, { sequential: false });
        if (cityRes.filled) filledFields.push("city");
      }

      if (card.state) {
        const stateRes = await tryFillInAllFrames(targetPage, FIELD_SELECTORS.state, card.state, { sequential: false });
        if (stateRes.filled) filledFields.push("state");
      }

      if (card.postalCode) {
        const zipRes = await tryFillInAllFrames(targetPage, FIELD_SELECTORS.postalCode, card.postalCode, {
          sequential: false,
        });
        if (zipRes.filled) filledFields.push("postalCode");
      }

      await new Promise((r) => setTimeout(r, 350));
      const declineCheck = await detectPaymentDeclineInPage(targetPage);
      if (declineCheck.declined && idx + 1 < maxAttempts) {
        rotatedDeclinedCards.push({
          alias: chosenResolved.alias,
          maskedCard: chosenResolved.maskedCard,
          reason: declineCheck.reason,
        });
        await recordLinkedCardAssociation({
          profileCode: opts.profileCode || chosenResolved.biometric.code,
          cardResolved: chosenResolved,
          pageUrl: targetPage.url(),
          status: "declined",
          declineReason: declineCheck.reason,
        }).catch(() => null);
        continue;
      }
      break;
    }

    const { card, maskedCard, alias, biometric } = chosenResolved;
    const totpCode = opts.totpSecret ? generateTotpCode(opts.totpSecret) : accountCreds?.totpCode || "";
    if (totpCode) {
      const totpRes = await tryFillInAllFrames(targetPage, FIELD_SELECTORS.totpCode, totpCode, { sequential: true });
      if (totpRes.filled) filledFields.push("totpCode");
    }

    let linkedCardRecorded = null;
    if (filledFields.includes("cardNumber")) {
      linkedCardRecorded = await recordLinkedCardAssociation({
        profileCode: opts.profileCode || biometric.code,
        cardResolved: chosenResolved,
        pageUrl: targetPage.url(),
        status: "linked",
      }).catch(() => null);
    }

    return {
      ok: filledFields.length > 0,
      alias,
      last4: chosenResolved.last4,
      maskedCard,
      bankName: chosenResolved.bankName || "",
      rotatedDeclinedCards,
      linkedCardRecorded,
      biometricAddress: {
        fullName: biometric.fullName,
        addressLine1: card.addressLine1,
        city: card.city,
        postalCode: card.postalCode,
        country: card.country,
      },
      totpReady: Boolean(totpCode),
      filledFields,
      pageUrl: targetPage.url(),
      frameCount: targetPage.frames().length,
      error: filledFields.length === 0 ? "no_matching_payment_or_totp_fields_found_on_page_or_iframes" : undefined,
    };
  } finally {
    // Disconnect CDP client without closing the browser/profile!
  }
}

module.exports = {
  getPrimaryVaultFilePath,
  resolveProfileBiometricBillingIdentity,
  generateTotpCode,
  syncP0020CardsToLocalCache,
  resolveBillingCardFromVault,
  resolveCandidateBillingCardsFromVault,
  recordCardStripeOutcome,
  recordLinkedCardAssociation,
  listMaskedBillingCards,
  upsertBillingCardInVault,
  autofillProfileBillingViaCdp,
};
