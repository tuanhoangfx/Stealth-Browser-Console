"use strict";

/**
 * P0003 → P0020 vault tenant scope.
 * - Dev (unpackaged / scripts): always czpgo@outlook.com (DEV_AUTO_LOGIN_EMAIL).
 * - Packaged: Hub login email → Data Box auth.users id → filter twofa_accounts.user_id.
 */

const fs = require("node:fs");
const path = require("node:path");
const { resolveStealthUserDataRoot } = require("./user-data-root.cjs");

const DEFAULT_DEV_VAULT_EMAIL = "czpgo@outlook.com";

/** @type {string | null} Hub login email from renderer (packaged). */
let _hubLoginEmail = null;
/** @type {Map<string, { userId: string, at: number }>} */
const _userIdCache = new Map();
const USER_ID_CACHE_MS = 30 * 60 * 1000;

function envSharedCandidates() {
  const roots = new Set();
  if (process.env.DEV_WORKSPACE_ROOT) roots.add(path.resolve(process.env.DEV_WORKSPACE_ROOT));
  roots.add(path.resolve(__dirname, "../../../../"));
  roots.add("E:\\Dev");
  try {
    roots.add(resolveStealthUserDataRoot({ packaged: false }));
  } catch {
    /* optional */
  }
  const files = [];
  for (const root of roots) {
    files.push(path.join(root, ".env.shared"));
  }
  return files;
}

function readEnvValue(name) {
  const fromEnv = String(process.env[name] || "").trim();
  if (fromEnv) return fromEnv;
  const pattern = new RegExp(`^${name}=(.+)$`, "m");
  for (const envPath of envSharedCandidates()) {
    if (!envPath || !fs.existsSync(envPath)) continue;
    try {
      const content = fs.readFileSync(envPath, "utf8");
      const match = content.match(pattern);
      if (match?.[1]?.trim()) return match[1].trim().replace(/^["']|["']$/g, "");
    } catch {
      /* try next */
    }
  }
  return "";
}

function isElectronPackaged() {
  try {
    const { app } = require("electron");
    return Boolean(app?.isPackaged);
  } catch {
    return process.env.STEALTH_PACKAGED === "1";
  }
}

/** Dev vault scope — always czpgo unless explicitly disabled. */
function isVaultDevScope() {
  if (process.env.STEALTH_VAULT_DEV_SCOPE === "0") return false;
  if (process.env.STEALTH_VAULT_DEV_SCOPE === "1") return true;
  return !isElectronPackaged();
}

function resolveDevVaultEmail() {
  return (
    readEnvValue("STEALTH_VAULT_DEV_EMAIL") ||
    readEnvValue("DEV_AUTO_LOGIN_EMAIL") ||
    DEFAULT_DEV_VAULT_EMAIL
  )
    .trim()
    .toLowerCase();
}

/**
 * Set Hub login email from renderer (packaged builds).
 * @param {string | null | undefined} email
 */
function setVaultHubLoginEmail(email) {
  const next = String(email || "")
    .trim()
    .toLowerCase();
  _hubLoginEmail = next || null;
}

function getVaultHubLoginEmail() {
  return _hubLoginEmail;
}

/**
 * Email used for Data Box vault tenant (dev override or Hub login).
 * @returns {string}
 */
function resolveVaultScopeEmail() {
  const forced = String(process.env.STEALTH_VAULT_SCOPE_EMAIL || "")
    .trim()
    .toLowerCase();
  if (forced) return forced;
  if (isVaultDevScope()) return resolveDevVaultEmail();
  if (_hubLoginEmail) return _hubLoginEmail;
  throw new Error(
    "Vault user scope missing — sign in to P0003 Hub (or set STEALTH_VAULT_SCOPE_EMAIL). Dev uses czpgo@outlook.com automatically.",
  );
}

/**
 * Resolve Data Box auth.users id for vault email via Admin API.
 * @param {{ url: string, key: string }} config
 * @param {string} email
 */
async function lookupVaultUserIdByEmail(config, email) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalized) throw new Error("Vault scope email is empty");

  const cached = _userIdCache.get(normalized);
  if (cached && Date.now() - cached.at < USER_ID_CACHE_MS) return cached.userId;

  const base = String(config.url || "").replace(/\/$/, "");
  const key = config.key;
  if (!base || !key) throw new Error("Vault config missing url/key for user lookup");

  let page = 1;
  const perPage = 200;
  for (;;) {
    const endpoint = `${base}/auth/v1/admin/users?page=${page}&per_page=${perPage}`;
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Vault auth admin lookup failed HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    const users = Array.isArray(json?.users) ? json.users : [];
    const hit = users.find((u) => String(u.email || "").trim().toLowerCase() === normalized);
    if (hit?.id) {
      const userId = String(hit.id);
      _userIdCache.set(normalized, { userId, at: Date.now() });
      return userId;
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }

  throw new Error(`No Data Box auth user for vault email ${normalized}`);
}

function clearVaultUserIdCache() {
  _userIdCache.clear();
}

module.exports = {
  DEFAULT_DEV_VAULT_EMAIL,
  isVaultDevScope,
  resolveDevVaultEmail,
  setVaultHubLoginEmail,
  getVaultHubLoginEmail,
  resolveVaultScopeEmail,
  lookupVaultUserIdByEmail,
  clearVaultUserIdCache,
  readEnvValue,
};
