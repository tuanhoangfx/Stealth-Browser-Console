const { createClient } = require("@supabase/supabase-js");
const fs = require("node:fs");
const path = require("node:path");

const VAULT_REF = "zurfouqanjcubgneuctp";
const VAULT_URL = `https://${VAULT_REF}.supabase.co`;

let _client = null;
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function readServiceRoleKey() {
  const envPath = path.resolve(__dirname, "../../../../.env.shared");
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, "utf8");
  const match = content.match(
    new RegExp(`SUPABASE_REF_${VAULT_REF}_SERVICE_ROLE=(.+)`)
  );
  return match?.[1]?.trim() || null;
}

function getClient() {
  if (_client) return _client;
  const key = readServiceRoleKey();
  if (!key) throw new Error("2FA vault service role key not found in .env.shared");
  _client = createClient(VAULT_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

function cacheKey(browserCode, service) {
  return `${browserCode}::${service}`.toLowerCase();
}

/**
 * Fetch mail credentials from P0020 2FA vault by browser profile code.
 * @param {string} browserCode — 4-digit profile code (e.g. "0011")
 * @param {string} [service="Gmail"] — service filter (case-insensitive)
 * @returns {Promise<{email:string, password:string, secret:string, mailRecover:string}|null>}
 */
async function fetchMailCredentials(browserCode, service = "Gmail") {
  const code = String(browserCode || "").trim();
  if (!code) return null;

  const key = cacheKey(code, service);
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  try {
    const client = getClient();
    const { data, error } = await client
      .from("twofa_accounts")
      .select("account, password, secret, mail_recover")
      .ilike("service", service)
      .eq("browser", code)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      _cache.set(key, { ts: Date.now(), data: null });
      return null;
    }

    const result = {
      email: data.account || "",
      password: data.password || "",
      secret: data.secret || "",
      mailRecover: data.mail_recover || "",
    };
    _cache.set(key, { ts: Date.now(), data: result });
    return result;
  } catch {
    return null;
  }
}

function clearCredentialsCache() {
  _cache.clear();
}

module.exports = { fetchMailCredentials, clearCredentialsCache };
