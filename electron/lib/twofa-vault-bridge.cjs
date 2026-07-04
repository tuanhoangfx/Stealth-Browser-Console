const { createClient } = require("@supabase/supabase-js");
const fs = require("node:fs");
const path = require("node:path");
const { resolveStealthUserDataRoot } = require("./user-data-root.cjs");

const VAULT_REF = "zurfouqanjcubgneuctp";
const VAULT_URL = `https://${VAULT_REF}.supabase.co`;
const SERVICE_ROLE_ENV = `SUPABASE_REF_${VAULT_REF}_SERVICE_ROLE`;

let _client = null;
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

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

function readServiceRoleKey() {
  const fromEnv = String(process.env[SERVICE_ROLE_ENV] || "").trim();
  if (fromEnv) return fromEnv;

  const pattern = new RegExp(`${SERVICE_ROLE_ENV}=(.+)`);
  for (const envPath of envSharedCandidates()) {
    if (!envPath || !fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function getClient() {
  if (_client) return _client;
  const key = readServiceRoleKey();
  if (!key) throw new Error(`${SERVICE_ROLE_ENV} not found — set env var or add to E:\\Dev\\.env.shared`);
  _client = createClient(VAULT_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

function normalizeBrowserCode(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/^\d{1,4}$/.test(trimmed)) return trimmed.padStart(4, "0");
  return trimmed;
}

function browserCodeVariants(browserCode) {
  const raw = String(browserCode || "").trim();
  const padded = normalizeBrowserCode(raw);
  return [...new Set([raw, padded].filter(Boolean))];
}

function cacheKey(browserCode, service) {
  return `${browserCode}::${service}`.toLowerCase();
}

function rowToCredentials(data) {
  return {
    email: data.account || "",
    password: data.password || "",
    secret: data.secret || "",
    mailRecover: data.mail_recover || "",
  };
}

/**
 * Diagnose mail credential lookup — used for fail-fast Gmail workflow errors.
 * @returns {Promise<{ok:boolean, browserCode:string, credentials:object|null, reason:string|null, otherServices:string[]}>}
 */
async function diagnoseMailCredentials(browserCode, service = "Gmail") {
  const variants = browserCodeVariants(browserCode);
  const browserCodeLabel = variants[variants.length - 1] || String(browserCode || "").trim();
  if (!browserCodeLabel) {
    return { ok: false, browserCode: "", credentials: null, reason: "Profile browser code is empty.", otherServices: [] };
  }

  const key = cacheKey(browserCodeLabel, service);
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS && cached.diagnosis) {
    return cached.diagnosis;
  }

  try {
    const client = getClient();
    let credentials = null;
    let matchedCode = browserCodeLabel;

    for (const code of variants) {
      const { data, error } = await client
        .from("twofa_accounts")
        .select("account, password, secret, mail_recover")
        .ilike("service", service)
        .eq("browser", code)
        .is("deleted_at", null)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data?.account) {
        credentials = rowToCredentials(data);
        matchedCode = code;
        break;
      }
    }

    if (credentials?.email) {
      const diagnosis = {
        ok: true,
        browserCode: matchedCode,
        credentials,
        reason: null,
        otherServices: [],
      };
      _cache.set(key, { ts: Date.now(), data: credentials, diagnosis });
      return diagnosis;
    }

    const { data: siblings } = await client
      .from("twofa_accounts")
      .select("service")
      .in("browser", variants)
      .is("deleted_at", null);

    const serviceRe = new RegExp(`^${String(service).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const otherServices = [
      ...new Set(
        (siblings || [])
          .map((row) => String(row.service || "").trim())
          .filter((name) => name && !serviceRe.test(name)),
      ),
    ];

    let reason = `No ${service} row in P0020 vault for browser ${browserCodeLabel}.`;
    if (otherServices.length) {
      reason += ` Found on this browser: ${otherServices.join(", ")}.`;
    }
    reason += " Open Data Box → Account → Mail, assign browser code, then sync vault.";

    const diagnosis = {
      ok: false,
      browserCode: browserCodeLabel,
      credentials: null,
      reason,
      otherServices,
    };
    _cache.set(key, { ts: Date.now(), data: null, diagnosis });
    return diagnosis;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      browserCode: browserCodeLabel,
      credentials: null,
      reason: `Vault lookup failed: ${message}`,
      otherServices: [],
    };
  }
}

/**
 * Fetch mail credentials from P0020 2FA vault by browser profile code.
 * @param {string} browserCode — profile code (e.g. "0098", "1001")
 * @param {string} [service="Gmail"] — service filter (case-insensitive)
 * @returns {Promise<{email:string, password:string, secret:string, mailRecover:string}|null>}
 */
async function fetchMailCredentials(browserCode, service = "Gmail") {
  const diagnosis = await diagnoseMailCredentials(browserCode, service);
  return diagnosis.ok ? diagnosis.credentials : null;
}

function clearCredentialsCache() {
  _cache.clear();
}

module.exports = { fetchMailCredentials, diagnoseMailCredentials, clearCredentialsCache, normalizeBrowserCode };
