"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { resolveStealthUserDataRoot } = require("./user-data-root.cjs");
const { resolveVaultConfig, resolveScopedVaultUserId } = require("./twofa-vault-bridge.cjs");

const P0002_KNOWN_GOOD_DIR = "E:\\Dev\\Tool\\P0002-Social-Hub\\data\\s9plus-known-good";
const CLOUD_NOTE_SLUG = "s9plus-mobile-farm-slots";
const CLOUD_NOTE_TITLE = "S9+ Mobile Farm Slot Directory";

let _supabaseCreateClient = null;
function getSupabaseCreateClient() {
  if (_supabaseCreateClient) return _supabaseCreateClient;
  const candidates = [
    "@supabase/supabase-js",
    typeof process.resourcesPath === "string" && process.resourcesPath
      ? path.join(process.resourcesPath, "app.asar", "node_modules", "@supabase", "supabase-js")
      : "",
    "E:\\Dev\\Tool\\P0003-Stealth-Browser-Console\\node_modules\\@supabase\\supabase-js",
  ].filter(Boolean);
  for (const modPath of candidates) {
    try {
      const mod = require(modPath);
      if (typeof mod?.createClient === "function") {
        _supabaseCreateClient = mod.createClient;
        return _supabaseCreateClient;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Resolves canonical local JSON file path for S9+ slot account labels.
 * @param {string} [overridePath]
 * @returns {string}
 */
function resolveSlotLabelsFilePath(overridePath = "") {
  if (overridePath) return path.resolve(overridePath);
  if (fs.existsSync(path.dirname(P0002_KNOWN_GOOD_DIR))) {
    return path.join(P0002_KNOWN_GOOD_DIR, "slot-labels.json");
  }
  return path.join(resolveStealthUserDataRoot({ packaged: false }), "s9plus-slot-labels.json");
}

/**
 * Sanitizes and normalizes a single slot label record, rejecting forbidden `8xxx` customer browser codes.
 * @param {object} raw
 * @returns {{ tag: string; zalo: string; fb: string; browserCode: string; updatedAt: string }}
 */
function sanitizeSlotEntry(raw = {}) {
  const cleanStr = (val, maxLen = 64) => String(val ?? "").trim().slice(0, maxLen);
  let browserCode = cleanStr(raw.browserCode, 8);
  if (/^\d{1,4}$/.test(browserCode)) {
    browserCode = browserCode.padStart(4, "0");
  } else {
    browserCode = "";
  }
  // Hard invariant: never bind or touch 8000-8999 customer PWA slots
  if (/^8\d{3}$/.test(browserCode)) {
    throw new Error("Customer browser profile range 8000-8999 is forbidden on Mobile Farm slots");
  }
  return {
    tag: cleanStr(raw.tag, 28),
    zalo: cleanStr(raw.zalo, 64),
    fb: cleanStr(raw.fb, 64),
    browserCode,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

/**
 * Formats S9+ slot map into a clean English Markdown table for P0020 Data Box Cloud Notes.
 * @param {Record<string, { tag?: string; zalo?: string; fb?: string; browserCode?: string }>} slots
 * @returns {string}
 */
function formatSlotsMarkdownTable(slots = {}) {
  const keys = Object.keys(slots).sort((a, b) => Number(a) - Number(b));
  const lines = [
    "# Galaxy S9+ Multi-User & Dual U95 Account Map",
    "",
    "| Android User | Tag | Zalo / Phone | Facebook | P0020 Slot |",
    "|---|---|---|---|---|",
  ];
  for (const uid of keys) {
    const row = slots[uid] || {};
    if (!row.tag && !row.zalo && !row.fb && !row.browserCode) continue;
    const slotTitle = uid === "95" ? "U95 (Dual)" : uid === "0" ? "01 (U0)" : `U${uid}`;
    lines.push(
      `| ${slotTitle} | ${row.tag || "-"} | ${row.zalo || "-"} | ${row.fb || "-"} | ${row.browserCode ? `#${row.browserCode}` : "-"} |`,
    );
  }
  return lines.join("\n") + "\n";
}

function readLocalSlotLabels(filePath = resolveSlotLabelsFilePath()) {
  if (!fs.existsSync(filePath)) {
    return { schemaVersion: 1, updatedAt: null, slots: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const normalized = {};
    for (const [k, v] of Object.entries(parsed?.slots || {})) {
      if (!/^\d+$/.test(k)) continue;
      try {
        const clean = sanitizeSlotEntry(v);
        if (clean.tag || clean.zalo || clean.fb || clean.browserCode) {
          normalized[k] = clean;
        }
      } catch {
        /* ignore malformed entry */
      }
    }
    return {
      schemaVersion: 1,
      updatedAt: parsed?.updatedAt || null,
      slots: normalized,
    };
  } catch {
    return { schemaVersion: 1, updatedAt: null, slots: {} };
  }
}

function writeLocalSlotLabels(state, filePath = resolveSlotLabelsFilePath()) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    schemaVersion: 1,
    updatedAt: state.updatedAt || new Date().toISOString(),
    slots: state.slots || {},
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return payload;
}

async function createDataboxClient() {
  const createClient = getSupabaseCreateClient();
  if (!createClient) return null;
  const cfg = resolveVaultConfig();
  if (!cfg?.url || !cfg?.key) return null;
  const client = createClient(cfg.url, cfg.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = await resolveScopedVaultUserId(client).catch(() => null);
  return userId ? { client, userId } : null;
}

/**
 * Read-only lookup against P0020 `twofa_accounts` to enrich slot labels with live Vault status.
 * Strictly read-only (`SELECT` only) — never mutates `twofa_accounts`.
 */
async function enrichSlotsFromP0020Vault(slots = {}) {
  const vaultMatches = {};
  const ctx = await createDataboxClient().catch(() => null);
  if (!ctx) return vaultMatches;

  const browserCodes = new Set();
  for (const entry of Object.values(slots)) {
    if (entry?.browserCode && !/^8\d{3}$/.test(entry.browserCode)) {
      browserCodes.add(entry.browserCode);
    }
  }
  if (browserCodes.size === 0) return vaultMatches;

  try {
    const { data } = await ctx.client
      .from("twofa_accounts")
      .select("id, service, account, browser, phone, status")
      .eq("user_id", ctx.userId)
      .in("browser", [...browserCodes])
      .in("service", ["Zalo", "Facebook", "Messenger", "SIM", "Gmail"])
      .limit(60);

    const byBrowser = new Map();
    for (const row of data || []) {
      const b = String(row.browser || "").padStart(4, "0");
      if (!byBrowser.has(b)) byBrowser.set(b, []);
      byBrowser.get(b).push({
        service: row.service,
        account: row.account,
        phone: row.phone || null,
        status: row.status || "active",
      });
    }

    for (const [uid, entry] of Object.entries(slots)) {
      if (entry?.browserCode && byBrowser.has(entry.browserCode)) {
        vaultMatches[uid] = byBrowser.get(entry.browserCode);
      }
    }
  } catch {
    /* non-fatal vault offline fallback */
  }
  return vaultMatches;
}

/**
 * Mirrors S9+ slot directory into P0020 Cloud `notes` (`slug = s9plus-mobile-farm-slots`),
 * or hydrates local cache from P0020 Cloud if local file is empty.
 */
async function syncCloudNoteWithP0020(localState, { push = false, filePath = resolveSlotLabelsFilePath() } = {}) {
  const ctx = await createDataboxClient().catch(() => null);
  if (!ctx) return { synced: false, reason: "databox_unavailable" };

  try {
    const { data: existingRows } = await ctx.client
      .from("notes")
      .select("id, metadata, updated_at")
      .eq("user_id", ctx.userId)
      .eq("slug", CLOUD_NOTE_SLUG)
      .limit(1);

    const existing = existingRows?.[0] || null;
    if (!push) {
      if (Object.keys(localState.slots || {}).length === 0 && existing?.metadata?.s9plus_slots) {
        const hydratedSlots = {};
        for (const [k, v] of Object.entries(existing.metadata.s9plus_slots)) {
          try {
            const clean = sanitizeSlotEntry(v);
            if (clean.tag || clean.zalo || clean.fb || clean.browserCode) hydratedSlots[k] = clean;
          } catch {
            /* skip */
          }
        }
        if (Object.keys(hydratedSlots).length > 0) {
          const next = writeLocalSlotLabels(
            { updatedAt: existing.updated_at || new Date().toISOString(), slots: hydratedSlots },
            filePath,
          );
          return { synced: true, hydratedFromCloud: true, state: next };
        }
      }
      return { synced: Boolean(existing), hydratedFromCloud: false, state: localState };
    }

    const nowIso = new Date().toISOString();
    const bodyMd = formatSlotsMarkdownTable(localState.slots);
    const nextMeta = {
      ...(existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {}),
      s9plus_slots: localState.slots,
      s9plus_updated_at: nowIso,
    };

    if (existing?.id) {
      await ctx.client
        .from("notes")
        .update({
          title: CLOUD_NOTE_TITLE,
          domain: "mobile-farm.s9plus",
          body_md: bodyMd,
          metadata: nextMeta,
          sync_status: "synced",
          synced_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", existing.id)
        .eq("user_id", ctx.userId);
    } else {
      await ctx.client.from("notes").insert({
        user_id: ctx.userId,
        title: CLOUD_NOTE_TITLE,
        slug: CLOUD_NOTE_SLUG,
        domain: "mobile-farm.s9plus",
        body_md: bodyMd,
        pinned: false,
        share_enabled: false,
        share_can_edit: false,
        sync_status: "synced",
        synced_at: nowIso,
        metadata: nextMeta,
      });
    }
    return { synced: true, pushedToCloud: true, state: localState };
  } catch (err) {
    return { synced: false, reason: err instanceof Error ? err.message : String(err), state: localState };
  }
}

/**
 * Loads S9+ slot labels (hydrating from P0020 Cloud Note if empty + optional read-only `twofa_accounts` enrichment).
 */
async function getS9SlotLabels({ filePath = resolveSlotLabelsFilePath(), enrichVault = true } = {}) {
  let state = readLocalSlotLabels(filePath);
  if (Object.keys(state.slots).length === 0) {
    const cloudRes = await syncCloudNoteWithP0020(state, { push: false, filePath });
    if (cloudRes?.state) state = cloudRes.state;
  }
  const vaultMatches = enrichVault ? await enrichSlotsFromP0020Vault(state.slots) : {};
  return {
    ok: true,
    updatedAt: state.updatedAt,
    slots: state.slots,
    vaultMatches,
  };
}

/**
 * Updates or clears one S9+ Android user slot's account label and syncs to P0020 Data Box Cloud Note.
 */
async function updateS9SlotLabel(
  { userId, tag = "", zalo = "", fb = "", browserCode = "", clear = false } = {},
  { filePath = resolveSlotLabelsFilePath(), syncCloud = true, enrichVault = true } = {},
) {
  const uidNum = Number(userId);
  if (!Number.isInteger(uidNum) || uidNum < 0 || uidNum > 999) {
    throw new Error(`Invalid Android userId: ${userId}`);
  }
  const key = String(uidNum);
  const current = readLocalSlotLabels(filePath);
  const nextSlots = { ...current.slots };

  if (clear) {
    delete nextSlots[key];
  } else {
    const clean = sanitizeSlotEntry({ tag, zalo, fb, browserCode, updatedAt: new Date().toISOString() });
    if (!clean.tag && !clean.zalo && !clean.fb && !clean.browserCode) {
      delete nextSlots[key];
    } else {
      nextSlots[key] = clean;
    }
  }

  const saved = writeLocalSlotLabels({ updatedAt: new Date().toISOString(), slots: nextSlots }, filePath);
  const cloud = syncCloud ? await syncCloudNoteWithP0020(saved, { push: true, filePath }) : { synced: false };
  const vaultMatches = enrichVault ? await enrichSlotsFromP0020Vault(saved.slots) : {};

  return {
    ok: true,
    updatedAt: saved.updatedAt,
    slots: saved.slots,
    vaultMatches,
    cloudSynced: Boolean(cloud?.synced),
  };
}

module.exports = {
  resolveSlotLabelsFilePath,
  sanitizeSlotEntry,
  formatSlotsMarkdownTable,
  readLocalSlotLabels,
  writeLocalSlotLabels,
  getS9SlotLabels,
  updateS9SlotLabel,
};
