const { createClient } = require("@supabase/supabase-js");
const fs = require("node:fs");
const path = require("node:path");
const { resolveStealthUserDataRoot } = require("./user-data-root.cjs");
const vaultUserScope = require("./vault-user-scope.cjs");

/** Legacy cloud 2FA vault — opt-in via STEALTH_TWOFA_VAULT_REF only. */
const LEGACY_VAULT_REF = "zurfouqanjcubgneuctp";
const DEFAULT_LENOVO_VAULT_URL = "https://sb-api.infi.io.vn";

let _client = null;
let _clientConfigKey = "";
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

const VAULT_URL_ENV_KEYS = ["DATABOX_SUPABASE_URL", "STAGING_LENOVO_SUPABASE_URL"];
const VAULT_KEY_ENV_KEYS = [
  "DATABOX_SUPABASE_SERVICE_ROLE",
  "STAGING_LENOVO_SUPABASE_SERVICE_ROLE",
];

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
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

/**
 * SSOT: Lenovo Data Box plane (sb-api.infi.io.vn) — same as P0020 twofa-cloud-sync.
 * Legacy cloud ref only when STEALTH_TWOFA_VAULT_REF is set explicitly.
 */
function resolveVaultConfig() {
  const legacyRef = String(process.env.STEALTH_TWOFA_VAULT_REF || "").trim().toLowerCase();
  if (legacyRef) {
    const key =
      readEnvValue(`SUPABASE_REF_${legacyRef}_SERVICE_ROLE`) ||
      readEnvValue(`SUPABASE_REF_${legacyRef}_SECRET_KEY`);
    return {
      url: `https://${legacyRef}.supabase.co`,
      key,
      source: `legacy:${legacyRef}`,
    };
  }

  let url = "";
  for (const keyName of VAULT_URL_ENV_KEYS) {
    url = readEnvValue(keyName);
    if (url) break;
  }
  url = (url || DEFAULT_LENOVO_VAULT_URL).replace(/\/$/, "");

  let key = "";
  for (const keyName of VAULT_KEY_ENV_KEYS) {
    key = readEnvValue(keyName);
    if (key) break;
  }

  return { url, key, source: "lenovo-databox" };
}

function getClient() {
  const config = resolveVaultConfig();
  const configKey = `${config.source}|${config.url}|${config.key ? "set" : "missing"}`;
  if (_client && _clientConfigKey === configKey) return _client;
  if (!config.url) throw new Error("Vault URL missing — set DATABOX_SUPABASE_URL in E:\\Dev\\.env.shared");
  if (!config.key) {
    throw new Error(
      "Vault service role missing — set DATABOX_SUPABASE_SERVICE_ROLE (Lenovo) in E:\\Dev\\.env.shared",
    );
  }
  _client = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  _clientConfigKey = configKey;
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

function cacheKey(browserCode, service, userId = "") {
  return `${userId || "noscope"}::${browserCode}::${service}`.toLowerCase();
}

function formatVaultScopeBlockReason(message) {
  const raw = String(message || "").trim();
  if (/Vault user scope missing/i.test(raw)) {
    return "Vault scope blocked Script fill: sign in to P0003 Hub first (Data Box tenant follows your Hub login). Dev uses czpgo@outlook.com automatically.";
  }
  if (/No Data Box auth user/i.test(raw)) {
    return `Vault scope blocked Script fill: ${raw}. Create/sign that user in Data Box, then retry.`;
  }
  return `Vault scope blocked Script fill: ${raw}`;
}

function isVaultScopeErrorMessage(message) {
  return /Vault user scope missing|No Data Box auth user|Vault query missing user_id|Vault scope blocked/i.test(
    String(message || ""),
  );
}

function rowToCredentials(data) {
  return {
    email: data.account || "",
    password: data.password || "",
    secret: data.secret || "",
    mailRecover: data.mail_recover || "",
  };
}

function normalizeServiceName(service) {
  return String(service || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const GMAIL_VAULT_SERVICES = new Set(["gmail", "google mail", "googlemail"]);
const OUTLOOK_VAULT_SERVICES = new Set(["outlook", "hotmail", "microsoft", "live", "mail"]);

function isGmailVaultService(service) {
  return GMAIL_VAULT_SERVICES.has(normalizeServiceName(service));
}

function isOutlookVaultService(service) {
  return OUTLOOK_VAULT_SERVICES.has(normalizeServiceName(service));
}

function vaultServiceAliases(service) {
  const normalized = normalizeServiceName(service);
  if (normalized === "gmail" || GMAIL_VAULT_SERVICES.has(normalized)) {
    return ["Gmail", "Google Mail", "Googlemail"];
  }
  if (OUTLOOK_VAULT_SERVICES.has(normalized) || normalized === "outlook") {
    return ["Outlook", "Hotmail", "Microsoft", "Live", "Mail"];
  }
  return [String(service || "").trim()].filter(Boolean);
}

function browserCodeFromRow(row) {
  const direct = normalizeBrowserCode(row?.browser);
  if (direct) return direct;
  const snapshot = row?.stealth_snapshot;
  if (!snapshot || typeof snapshot !== "object") return "";
  const assigned = normalizeBrowserCode(snapshot.assigned_browser);
  if (assigned) return assigned;
  return normalizeBrowserCode(snapshot.actual_browser);
}

function rowMatchesBrowserCode(row, variants) {
  const code = browserCodeFromRow(row);
  return code ? variants.includes(code) : false;
}

/**
 * Resolve Data Box auth.users id for the current vault tenant (Hub user / dev czpgo).
 * Fail-closed: never query vault without a user_id scope.
 */
async function resolveScopedVaultUserId() {
  const email = vaultUserScope.resolveVaultScopeEmail();
  const config = resolveVaultConfig();
  const userId = await vaultUserScope.lookupVaultUserIdByEmail(config, email);
  return { userId, email };
}

async function queryVaultRow(client, { service, code, userId, preferredEmail = "", useSnapshotFallback = false }) {
  if (!userId) throw new Error("Vault query missing user_id scope");
  const baseSelect = "account, password, secret, mail_recover, browser, stealth_snapshot, service";
  const filters = (query) =>
    query
      .eq("user_id", userId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1);

  const aliases = vaultServiceAliases(service);
  const preferred = String(preferredEmail || "")
    .trim()
    .toLowerCase();

  if (preferred) {
    for (const serviceName of aliases) {
      const { data, error } = await filters(
        client
          .from("twofa_accounts")
          .select(baseSelect)
          .ilike("service", serviceName)
          .eq("browser", code)
          .ilike("account", preferred),
      ).maybeSingle();
      if (!error && data?.account) return data;
    }
  }

  for (const serviceName of aliases) {
    const { data, error } = await filters(
      client
        .from("twofa_accounts")
        .select(baseSelect)
        .ilike("service", serviceName)
        .eq("browser", code),
    ).maybeSingle();
    if (!error && data?.account) return data;
  }

  if (!useSnapshotFallback) return null;

  // Credentials must follow vault browser assignment — never actual_browser (who logged in).
  let snapshotQuery = client
    .from("twofa_accounts")
    .select(baseSelect)
    .filter("stealth_snapshot->>assigned_browser", "eq", code);
  if (preferred) snapshotQuery = snapshotQuery.ilike("account", preferred);
  const { data, error } = await filters(snapshotQuery).maybeSingle();
  if (!error && data?.account) {
    const rowService = data.service;
    if (isGmailVaultService(service) && isGmailVaultService(rowService)) return data;
    if (isOutlookVaultService(service) && isOutlookVaultService(rowService)) return data;
    if (!isGmailVaultService(service) && !isOutlookVaultService(service) && data.account) return data;
  }

  return null;
}

/**
 * Count active vault rows for browser + service family (multi-Outlook guard).
 */
async function listMailVaultAccountsForBrowser(browserCode, service = "Gmail") {
  const variants = browserCodeVariants(browserCode);
  if (!variants.length) return [];
  const { userId } = await resolveScopedVaultUserId();
  const client = getClient();
  const aliases = vaultServiceAliases(service);
  const { data, error } = await client
    .from("twofa_accounts")
    .select("id, account, browser, service, updated_at")
    .eq("user_id", userId)
    .in("browser", variants)
    .is("deleted_at", null)
    .eq("status", "active");
  if (error) throw error;
  const aliasSet = new Set(aliases.map((a) => normalizeServiceName(a)));
  return (data || []).filter((row) => aliasSet.has(normalizeServiceName(row.service)));
}

/**
 * Diagnose mail credential lookup — used for fail-fast Gmail/Outlook workflow errors.
 * @param {string} browserCode
 * @param {string} [service="Gmail"]
 * @param {{ preferredEmail?: string }} [opts]
 */
async function diagnoseMailCredentials(browserCode, service = "Gmail", opts = {}) {
  const preferredEmail = String(opts?.preferredEmail || "")
    .trim()
    .toLowerCase();
  const variants = browserCodeVariants(browserCode);
  const browserCodeLabel = variants[variants.length - 1] || String(browserCode || "").trim();
  if (!browserCodeLabel) {
    return {
      ok: false,
      browserCode: "",
      credentials: null,
      reason: "Profile browser code is empty.",
      otherServices: [],
      scopeEmail: null,
      scopeError: null,
      preferredEmail: preferredEmail || null,
      matchMode: null,
    };
  }

  let scopeEmail = null;
  try {
    scopeEmail = vaultUserScope.resolveVaultScopeEmail();
  } catch {
    scopeEmail = null;
  }

  try {
    const { userId, email } = await resolveScopedVaultUserId();
    scopeEmail = email;
    const cacheSuffix = preferredEmail ? `::email:${preferredEmail}` : "";
    const key = cacheKey(browserCodeLabel, service, userId) + cacheSuffix;
    const cached = _cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS && cached.diagnosis) {
      return cached.diagnosis;
    }

    const siblings = await listMailVaultAccountsForBrowser(browserCodeLabel, service);
    if (!preferredEmail && siblings.length > 1) {
      const accounts = siblings.map((row) => String(row.account || "").trim()).filter(Boolean);
      const diagnosis = {
        ok: false,
        browserCode: browserCodeLabel,
        credentials: null,
        reason: `Multiple ${service} rows on browser ${browserCodeLabel}: ${accounts.join(", ")}. Open that mailbox once so email detect can pick the row, or keep one ${service} account per Profile.`,
        otherServices: [],
        scopeEmail,
        scopeError: null,
        preferredEmail: null,
        matchMode: "ambiguous",
        candidates: accounts,
      };
      _cache.set(key, { ts: Date.now(), data: null, diagnosis });
      return diagnosis;
    }

    const client = getClient();
    let credentials = null;
    let matchedCode = browserCodeLabel;
    let matchMode = "browser_service";

    for (const code of variants) {
      const data = await queryVaultRow(client, {
        service,
        code,
        userId,
        preferredEmail,
        useSnapshotFallback: true,
      });
      if (data?.account) {
        credentials = rowToCredentials(data);
        matchedCode = browserCodeFromRow(data) || code;
        const account = String(data.account || "").trim().toLowerCase();
        if (preferredEmail && account === preferredEmail) {
          matchMode = "email_detect";
        } else if (preferredEmail) {
          matchMode = "browser_service_fallback";
        } else {
          matchMode = "browser_service";
        }
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
        scopeEmail,
        scopeError: null,
        preferredEmail: preferredEmail || null,
        matchMode,
      };
      _cache.set(key, { ts: Date.now(), data: credentials, diagnosis });
      return diagnosis;
    }

    const { data: byBrowser } = await client
      .from("twofa_accounts")
      .select("service, browser, status, account, stealth_snapshot")
      .eq("user_id", userId)
      .in("browser", variants)
      .is("deleted_at", null);

    let siblingRows = byBrowser || [];
    if (!siblingRows.length) {
      for (const code of variants) {
        for (const field of ["assigned_browser", "actual_browser"]) {
          const { data } = await client
            .from("twofa_accounts")
            .select("service, browser, status, account, stealth_snapshot")
            .eq("user_id", userId)
            .filter(`stealth_snapshot->>${field}`, "eq", code)
            .is("deleted_at", null)
            .limit(10);
          if (data?.length) siblingRows = siblingRows.concat(data);
        }
      }
    }

    const serviceRe = new RegExp(`^${String(service).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    const inactiveMail = siblingRows.filter((row) => {
      if (!rowMatchesBrowserCode(row, variants)) return false;
      const svc = String(row.service || "").trim();
      const isMail =
        serviceRe.test(svc) ||
        (isGmailVaultService(service) && isGmailVaultService(svc)) ||
        (isOutlookVaultService(service) && isOutlookVaultService(svc));
      const status = String(row.status || "").trim().toLowerCase();
      return isMail && status && status !== "active";
    });
    const otherServices = [
      ...new Set(
        siblingRows
          .filter((row) => rowMatchesBrowserCode(row, variants))
          .map((row) => String(row.service || "").trim())
          .filter((name) => name && !serviceRe.test(name) && !isGmailVaultService(name) && !isOutlookVaultService(name)),
      ),
    ];

    let reason = preferredEmail
      ? `No ${service} row for browser ${browserCodeLabel} matching email ${preferredEmail} (tenant ${scopeEmail}).`
      : `No ${service} row in P0020 vault for browser ${browserCodeLabel} (tenant ${scopeEmail}).`;
    if (inactiveMail.length) {
      const detail = inactiveMail
        .slice(0, 3)
        .map((row) => {
          const acct = String(row.account || "").trim() || "(no email)";
          const st = String(row.status || "").trim() || "unknown";
          return `${acct} [status=${st}]`;
        })
        .join("; ");
      reason = `${service} row exists for browser ${browserCodeLabel} but is not active (${detail}). Set status=active in Data Box (Incorrect Pass / incorrect_info blocks WF login), then sync vault.`;
    } else if (otherServices.length) {
      reason += ` Found on this browser: ${otherServices.join(", ")}.`;
      reason += " Open Data Box → Account → Mail, assign browser code, then sync vault.";
    } else {
      reason += " Open Data Box → Account → Mail, assign browser code, then sync vault.";
    }

    const diagnosis = {
      ok: false,
      browserCode: browserCodeLabel,
      credentials: null,
      reason,
      otherServices,
      scopeEmail,
      scopeError: null,
      preferredEmail: preferredEmail || null,
      matchMode: preferredEmail ? "email_miss" : "browser_miss",
    };
    _cache.set(key, { ts: Date.now(), data: null, diagnosis });
    return diagnosis;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const scopeBlocked = isVaultScopeErrorMessage(message);
    return {
      ok: false,
      browserCode: browserCodeLabel,
      credentials: null,
      reason: scopeBlocked ? formatVaultScopeBlockReason(message) : `Vault lookup failed: ${message}`,
      otherServices: [],
      scopeEmail,
      scopeError: scopeBlocked ? message : null,
      preferredEmail: preferredEmail || null,
      matchMode: null,
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

function isGmailLikeService(service) {
  return /^(gmail|google|google\s*mail|googlemail|outlook|hotmail|live|mail)$/i.test(
    String(service || "").trim(),
  );
}

/**
 * Mail vault rows by account email — Gmail/Google/Outlook/Hotmail (Stealth identity sync).
 * @returns {Promise<Array<{ id: string, account: string, browser: string | null, service: string }>>}
 */
async function findGmailAccountsByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return [];
  const { userId } = await resolveScopedVaultUserId();
  const client = getClient();
  const { data, error } = await client
    .from("twofa_accounts")
    .select("id, account, browser, service")
    .eq("user_id", userId)
    .ilike("account", normalized)
    .is("deleted_at", null);
  if (error) throw error;
  return (data || []).filter((row) => isGmailLikeService(row.service));
}

/**
 * @returns {Promise<Array<{ id: string, account: string, browser: string | null, service: string }>>}
 */
async function findGmailAccountsByBrowser(browserCode) {
  const variants = browserCodeVariants(browserCode);
  if (!variants.length) return [];
  const { userId } = await resolveScopedVaultUserId();
  const client = getClient();
  const { data, error } = await client
    .from("twofa_accounts")
    .select("id, account, browser, service")
    .eq("user_id", userId)
    .in("browser", variants)
    .is("deleted_at", null);
  if (error) throw error;
  return data || [];
}

/**
 * Patch stealth_snapshot for a vault row (service role).
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function patchStealthSnapshotByAccountId(accountId, snapshot) {
  const id = String(accountId || "").trim();
  if (!id) return { ok: false, reason: "missing account id" };
  const checkedAt = snapshot?.checked_at || new Date().toISOString();
  try {
    const { userId } = await resolveScopedVaultUserId();
    const client = getClient();
    const { error, count } = await client
      .from("twofa_accounts")
      .update(
        {
          stealth_snapshot: snapshot,
          stealth_checked_at: checkedAt,
          // Bump updated_at so P0020 watermark delta pulls stealth telemetry.
          updated_at: checkedAt,
        },
        { count: "exact" },
      )
      .eq("id", id)
      .eq("user_id", userId);
    if (error) return { ok: false, reason: error.message };
    if (count === 0) return { ok: false, reason: "vault row not found for current user scope" };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Mark a mail vault row after a workflow outcome (e.g. Google reCAPTCHA stop).
 * Updates account `status` + stealth_snapshot so Data Box refreshes immediately.
 * @returns {Promise<{ ok: boolean, patched: number, reason?: string }>}
 */
async function patchMailAccountOutcome({
  browserCode,
  email = "",
  service = "Gmail",
  status = "error",
  snapshot = null,
  logMessage = "",
} = {}) {
  const variants = browserCodeVariants(browserCode);
  if (!variants.length) return { ok: false, patched: 0, reason: "missing browser code" };
  try {
    const { userId } = await resolveScopedVaultUserId();
    const client = getClient();
    const preferred = String(email || "")
      .trim()
      .toLowerCase();
    const aliases = vaultServiceAliases(service);

    let query = client
      .from("twofa_accounts")
      .select("id, account, service, browser, status, log")
      .eq("user_id", userId)
      .in("browser", variants)
      .is("deleted_at", null)
      .limit(20);
    const { data, error } = await query;
    if (error) return { ok: false, patched: 0, reason: error.message };

    const rows = (data || []).filter((row) => {
      const svc = String(row.service || "").trim();
      const isMail =
        aliases.some((a) => new RegExp(`^${a}$`, "i").test(svc)) ||
        (isGmailVaultService(service) && isGmailVaultService(svc)) ||
        (isOutlookVaultService(service) && isOutlookVaultService(svc));
      if (!isMail) return false;
      if (!preferred) return true;
      return String(row.account || "").trim().toLowerCase() === preferred;
    });
    if (!rows.length) return { ok: false, patched: 0, reason: "no matching mail vault row" };

    const checkedAt = snapshot?.checked_at || new Date().toISOString();
    const tip = String(logMessage || "").trim().slice(0, 240);
    let patched = 0;
    for (const row of rows) {
      const patch = {
        status: String(status || "error").trim() || "error",
        updated_at: checkedAt,
        stealth_checked_at: checkedAt,
      };
      if (snapshot) patch.stealth_snapshot = snapshot;
      if (tip) {
        patch.log = tip;
        patch.log_tip_at = checkedAt;
        patch.log_tip_message = tip;
      }
      const { error: upErr } = await client
        .from("twofa_accounts")
        .update(patch)
        .eq("id", row.id)
        .eq("user_id", userId);
      if (!upErr) patched += 1;
    }
    clearCredentialsCache();
    return { ok: patched > 0, patched };
  } catch (error) {
    return { ok: false, patched: 0, reason: error instanceof Error ? error.message : String(error) };
  }
}

function logVaultBridgeStartup() {
  try {
    const config = resolveVaultConfig();
    const scopeHint = vaultUserScope.isVaultDevScope()
      ? `dev:${vaultUserScope.resolveDevVaultEmail()}`
      : vaultUserScope.getVaultHubLoginEmail()
        ? `hub:${vaultUserScope.getVaultHubLoginEmail()}`
        : "hub:pending-sign-in";
    console.info(
      `[vault-bridge] source=${config.source} url=${config.url} key=${config.key ? "set" : "missing"} scope=${scopeHint}`,
    );
  } catch (error) {
    console.warn("[vault-bridge] config:", error instanceof Error ? error.message : String(error));
  }
}

module.exports = {
  fetchMailCredentials,
  diagnoseMailCredentials,
  listMailVaultAccountsForBrowser,
  clearCredentialsCache,
  normalizeBrowserCode,
  resolveVaultConfig,
  resolveScopedVaultUserId,
  logVaultBridgeStartup,
  findGmailAccountsByEmail,
  findGmailAccountsByBrowser,
  patchStealthSnapshotByAccountId,
  patchMailAccountOutcome,
};
