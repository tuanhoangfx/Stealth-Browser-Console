"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const {
  COOKIES_REL_PATH,
  COOKIES_BAK_REL_PATH,
} = require("../profile-cookie-guard.cjs");
const {
  resolveP0002VaultDir,
  isAnonymousOrTrackingCookieName,
  isSyntheticOrUnauthenticatedCookieValue,
  resolveServiceMatcher,
  matchServiceSpaStorage,
  normalizeComparableEmail,
  areComparableEmailsEqual,
  isJwtCookieValueExpired,
} = require("./service-cookie-matchers.cjs");
const { isGoogleFamilyService } = require("./live-cdp-targets.cjs");
const {
  _googleSidIdentityCache,
  getGoogleSidSignature,
} = require("./http-cookie-verifiers.cjs");

const DPAPI_MASTER_KEYS_CACHE_FILE = "D:\\StealthBrowser\\.dpapi-master-keys.json";
let _dpapiMasterKeyByEncKeyCache = null;
const _profileMasterKeyByDirCache = new Map();

function ensureDpapiMasterKeyMap() {
  if (_dpapiMasterKeyByEncKeyCache) return _dpapiMasterKeyByEncKeyCache;
  _dpapiMasterKeyByEncKeyCache = new Map();
  try {
    if (fs.existsSync(DPAPI_MASTER_KEYS_CACHE_FILE)) {
      const raw = fs.readFileSync(DPAPI_MASTER_KEYS_CACHE_FILE, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      for (const [ek, b64] of Object.entries(parsed || {})) {
        if (typeof b64 === "string" && b64.length >= 40) {
          _dpapiMasterKeyByEncKeyCache.set(ek, Buffer.from(b64, "base64"));
        }
      }
    }
  } catch {
    /* ignore cache read failure */
  }
  return _dpapiMasterKeyByEncKeyCache;
}

function resolveProfileDpapiMasterKey(userDataDir) {
  if (!userDataDir) return null;
  if (_profileMasterKeyByDirCache.has(userDataDir)) {
    return _profileMasterKeyByDirCache.get(userDataDir);
  }
  const lsPath = path.join(userDataDir, "Local State");
  if (!fs.existsSync(lsPath)) {
    _profileMasterKeyByDirCache.set(userDataDir, null);
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(lsPath, "utf8"));
    const ek = raw?.os_crypt?.encrypted_key;
    if (typeof ek !== "string" || ek.length < 16) {
      _profileMasterKeyByDirCache.set(userDataDir, null);
      return null;
    }
    const map = ensureDpapiMasterKeyMap();
    if (map.has(ek)) {
      const keyBuf = map.get(ek);
      _profileMasterKeyByDirCache.set(userDataDir, keyBuf);
      return keyBuf;
    }
    if (process.platform === "win32") {
      const psCmd = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String('${ek.replace(/'/g, "")}'); $d=[System.Security.Cryptography.ProtectedData]::Unprotect($b[5..($b.Length-1)],$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Convert]::ToBase64String($d)`;
      const outB64 = String(
        execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", psCmd], {
          windowsHide: true,
          encoding: "utf8",
          timeout: 4000,
        }) || "",
      ).trim();
      if (outB64.length >= 40) {
        const keyBuf = Buffer.from(outB64, "base64");
        map.set(ek, keyBuf);
        _profileMasterKeyByDirCache.set(userDataDir, keyBuf);
        try {
          const obj = {};
          for (const [k, v] of map.entries()) obj[k] = v.toString("base64");
          fs.writeFileSync(DPAPI_MASTER_KEYS_CACHE_FILE, JSON.stringify(obj), "utf8");
        } catch {
          /* ignore cache write failure */
        }
        return keyBuf;
      }
    }
  } catch {
    /* ignore Local State or DPAPI failure */
  }
  _profileMasterKeyByDirCache.set(userDataDir, null);
  return null;
}

function decryptChromiumCookieValue(encryptedValue, masterKey) {
  if (!encryptedValue || !masterKey) return "";
  try {
    const encBuf = Buffer.isBuffer(encryptedValue) ? encryptedValue : Buffer.from(encryptedValue);
    if (encBuf.length <= 31) return "";
    const prefix = encBuf.subarray(0, 3).toString("latin1");
    if (prefix !== "v10" && prefix !== "v11") return "";
    const nonce = encBuf.subarray(3, 15);
    const ciphertext = encBuf.subarray(15, encBuf.length - 16);
    const tag = encBuf.subarray(encBuf.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, nonce);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (dec.length > 32 && dec.subarray(0, 32).some((b) => b < 0x20 || b > 0x7e)) {
      return dec.subarray(32).toString("utf8");
    }
    return dec.toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Evaluates whether a profile's cookie pairs (`{ domain, name, value }`) or SPA storage (`LocalStorage`/`IndexedDB`)
 * satisfy auth for `serviceName`.
 */
function matchServiceCookiePairs(serviceName, pairs = [], spaSummary = null, opts = {}) {
  const matcher = resolveServiceMatcher(serviceName);
  if (!matcher) {
    return { supported: false, loggedIn: false, resultCode: "unsupported", matchedNames: [] };
  }
  const sLower = String(serviceName || "").trim().toLowerCase();
  const rawExpectedAccount = String(
    opts?.expectedAccount ||
      (spaSummary && typeof spaSummary === "object" && "expectedAccount" in spaSummary ? spaSummary.expectedAccount : "") ||
      "",
  ).trim();
  const expectedEmail = normalizeComparableEmail(rawExpectedAccount);
  const matchedNames = new Set();
  let hasFbCheckpointCookie = false;
  let hasChatgptAsliStepUpCookie = false;
  let hasChatgptSessionEpochCookie = false;
  let hasClerkLoggedOutUat = false;
  let hasValidClerkSessionJwt = false;
  let chatgptAuthInfoEmail = "";
  let outlookAuthEmail = "";
  const outlookAuthEmails = new Set();
  let fbCUserUid = "";
  for (const p of pairs) {
    const d = String(p.domain || p.host_key || "").toLowerCase();
    const n = String(p.name || "");
    if (sLower === "chatgpt" && d.includes("chatgpt.com")) {
      if (n === "oai-asli" && (p.value === undefined || String(p.value).trim() !== "")) {
        hasChatgptAsliStepUpCookie = true;
      } else if (n === "oai-client-session-epoch" && (p.value === undefined || String(p.value).trim() !== "")) {
        hasChatgptSessionEpochCookie = true;
      }
    }
    if (
      (sLower === "chatgpt" || sLower === "sora openai") &&
      (d.includes("chatgpt.com") || d.includes("openai.com")) &&
      n === "oai-client-auth-info" &&
      p.value
    ) {
      try {
        const rawVal = decodeURIComponent(String(p.value));
        const b64Part = rawVal.split(".")[0] || "";
        const parsed = JSON.parse(Buffer.from(b64Part, "base64").toString("utf8"));
        const idVal = normalizeComparableEmail(parsed?.last_login_identifier?.value);
        if (idVal) chatgptAuthInfoEmail = idVal;
      } catch {
        /* ignore malformed oai-client-auth-info */
      }
    }
    if (
      (sLower === "outlook" || sLower === "hotmail" || sLower === "microsoft" || sLower === "microsoft office") &&
      (d.includes("live.com") || d.includes("microsoft") || d.includes("office.com") || d.includes("outlook.com")) &&
      p.value
    ) {
      if (n === "MSPPre") {
        try {
          const decoded = decodeURIComponent(String(p.value));
          const candidate = normalizeComparableEmail(decoded.split("|")[0]);
          if (candidate) {
            outlookAuthEmail = candidate;
            outlookAuthEmails.add(candidate);
          }
        } catch {
          /* ignore */
        }
      } else if (n === "JSH" || n === "JSHP") {
        try {
          const decoded = decodeURIComponent(String(p.value));
          const parts = decoded.split("$");
          const candidate = normalizeComparableEmail(parts[1]);
          if (candidate) {
            if (!outlookAuthEmail) outlookAuthEmail = candidate;
            outlookAuthEmails.add(candidate);
          }
        } catch {
          /* ignore */
        }
      }
    }
    if (sLower === "facebook" && d.includes("facebook.com") && n === "c_user" && p.value) {
      const uidCandidate = String(p.value).trim();
      if (/^\d{6,20}$/.test(uidCandidate)) fbCUserUid = uidCandidate;
    }
    if (sLower === "claude" && d.includes("claude.ai") && n === "__Host-claude-ai-pending-login-email" && p.value) {
      try {
        const candidate = normalizeComparableEmail(decodeURIComponent(String(p.value)));
        if (candidate) chatgptAuthInfoEmail = candidate;
      } catch {
        /* ignore */
      }
    }
    const isServiceDomainForJwt =
      (sLower === "cursor" && (d.includes("cursor.com") || d.includes("cursor.sh"))) ||
      (sLower === "suno" && (d.includes("suno.com") || d.includes("suno.ai"))) ||
      (sLower === "higgsfield" && d.includes("higgsfield.ai")) ||
      (sLower === "sync.so" && d.includes("sync.so")) ||
      (sLower === "grok" && (d.includes("grok.com") || d.includes("x.ai")));
    if (isServiceDomainForJwt && p.value && !chatgptAuthInfoEmail) {
      try {
        const decoded = decodeURIComponent(String(p.value));
        const jwtMatch = decoded.match(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/);
        if (jwtMatch) {
          const payload = JSON.parse(Buffer.from(jwtMatch[1], "base64url").toString("utf8"));
          const jwtEmail = normalizeComparableEmail(payload?.email || payload?.upn || payload?.preferred_username);
          if (jwtEmail && !/@guest\.com$/i.test(jwtEmail)) chatgptAuthInfoEmail = jwtEmail;
        }
      } catch {
        /* ignore */
      }
    }
    if ((sLower === "suno" || sLower === "higgsfield" || sLower === "sync.so") && n.startsWith("__client_uat") && String(p.value ?? "").trim() === "0") {
      hasClerkLoggedOutUat = true;
    }
    if (!d || !n || isAnonymousOrTrackingCookieName(n)) continue;
    if (p.value !== undefined) {
      const valStr = String(p.value || "").trim();
      if (!valStr || isSyntheticOrUnauthenticatedCookieValue(valStr)) continue;
      if ((sLower === "chatgpt" || sLower === "sora openai") && (n.includes("__Secure-next-auth.session-token") || n === "next-auth.session-token") && valStr.length < 40) {
        continue;
      }
      if (sLower === "claude" && n === "sessionKey" && !valStr.startsWith("sk-ant-sid")) {
        continue;
      }
      if (sLower === "grok" && (n === "sso" || n === "sso-rw") && (!valStr.startsWith("eyJ") || isJwtCookieValueExpired(valStr))) {
        continue;
      }
      if (sLower === "cursor" && (n === "WorkosCursorSessionToken" || n === "WorkOSCursorSessionToken") && (valStr.length < 30 || isJwtCookieValueExpired(valStr))) {
        continue;
      }
      if (
        sLower === "perplexity" &&
        (n === "__Secure-next-auth.session-token" ||
          n === "next-auth.session-token" ||
          n === "pplx.session-token" ||
          n.startsWith("__Secure-pplx.session.")) &&
        valStr.length < 30
      ) {
        continue;
      }
      if ((sLower === "suno" || sLower === "higgsfield" || sLower === "sync.so") && (n === "__session" || n.startsWith("__session_"))) {
        if (!valStr.startsWith("eyJ") || isJwtCookieValueExpired(valStr)) continue;
        hasValidClerkSessionJwt = true;
      }
    }
    if (sLower === "facebook" && d.includes("facebook.com") && n === "checkpoint" && p.value !== "") {
      hasFbCheckpointCookie = true;
    }
    if (matcher.match(d, n, p.value ?? "")) {
      matchedNames.add(n);
    }
  }
  if ((sLower === "suno" || sLower === "higgsfield" || sLower === "sync.so") && hasClerkLoggedOutUat && !hasValidClerkSessionJwt) {
    matchedNames.delete("__client");
  }
  if (sLower === "facebook" && hasFbCheckpointCookie) {
    return {
      supported: true,
      loggedIn: false,
      resultCode: "fb_checkpoint",
      matchedNames: [],
    };
  }
  const allowedOutlookAliases =
    opts?.allowedOutlookAliasEmails instanceof Set
      ? opts.allowedOutlookAliasEmails
      : Array.isArray(opts?.allowedOutlookAliasEmails)
        ? new Set(opts.allowedOutlookAliasEmails.map((e) => normalizeComparableEmail(e)).filter(Boolean))
        : null;
  if (
    (sLower === "chatgpt" ||
      sLower === "sora openai" ||
      sLower === "claude" ||
      sLower === "cursor" ||
      sLower === "suno" ||
      sLower === "higgsfield" ||
      sLower === "sync.so" ||
      sLower === "grok") &&
    expectedEmail &&
    chatgptAuthInfoEmail &&
    !areComparableEmailsEqual(expectedEmail, chatgptAuthInfoEmail) &&
    !(allowedOutlookAliases && allowedOutlookAliases.has(expectedEmail) && allowedOutlookAliases.has(chatgptAuthInfoEmail))
  ) {
    return {
      supported: true,
      loggedIn: false,
      resultCode: "account_mismatch",
      matchedNames: [],
      actualAccount: chatgptAuthInfoEmail,
    };
  }
  const hasMatchingOutlookIdentity =
    expectedEmail &&
    (outlookAuthEmails.has(expectedEmail) ||
      Boolean(
        allowedOutlookAliases &&
          allowedOutlookAliases.has(expectedEmail) &&
          Array.from(outlookAuthEmails).some((em) => {
            if (allowedOutlookAliases.has(em)) return true;
            const m = String(em || "").match(/^[a-z]\d[a-z](\d{2})@outlook\.com$/i);
            if (!m) return false;
            const suf = m[1];
            for (const al of allowedOutlookAliases) {
              if (new RegExp(`${suf}@outlook\\.com$`, "i").test(String(al || ""))) return true;
            }
            return false;
          }),
      ) ||
      Boolean(opts?.allowSameProfileMicrosoftAliases));
  if (
    (sLower === "outlook" || sLower === "hotmail" || sLower === "microsoft" || sLower === "microsoft office") &&
    expectedEmail &&
    outlookAuthEmails.size > 0 &&
    !hasMatchingOutlookIdentity
  ) {
    return {
      supported: true,
      loggedIn: false,
      resultCode: "account_mismatch",
      matchedNames: [],
      actualAccount: outlookAuthEmail || Array.from(outlookAuthEmails)[0] || "",
    };
  }
  if (sLower === "facebook" && /^\d{6,20}$/.test(rawExpectedAccount) && fbCUserUid && rawExpectedAccount !== fbCUserUid) {
    return {
      supported: true,
      loggedIn: false,
      resultCode: "account_mismatch",
      matchedNames: [],
      actualAccount: fbCUserUid,
    };
  }
  if (isGoogleFamilyService(sLower) && expectedEmail && /@(?:gmail|googlemail)\.com$/i.test(expectedEmail)) {
    const googleAuthEmails = new Set();
    if (Array.isArray(opts?.verifiedGoogleEmails)) {
      for (const em of opts.verifiedGoogleEmails) {
        const norm = normalizeComparableEmail(em);
        if (norm) googleAuthEmails.add(norm);
      }
    } else if (opts?.verifiedGoogleEmails instanceof Set) {
      for (const em of opts.verifiedGoogleEmails) {
        const norm = normalizeComparableEmail(em);
        if (norm) googleAuthEmails.add(norm);
      }
    }
    if (googleAuthEmails.size === 0) {
      const sidSig = getGoogleSidSignature(pairs);
      const cached = sidSig ? _googleSidIdentityCache.get(sidSig) : null;
      if (Array.isArray(cached)) {
        for (const em of cached) {
          const norm = normalizeComparableEmail(em);
          if (norm) googleAuthEmails.add(norm);
        }
      }
    }
    if (
      googleAuthEmails.size > 0 &&
      !Array.from(googleAuthEmails).some((em) => areComparableEmailsEqual(em, expectedEmail))
    ) {
      return {
        supported: true,
        loggedIn: false,
        resultCode: "account_mismatch",
        matchedNames: [],
        actualAccount: Array.from(googleAuthEmails)[0] || "",
      };
    }
  }
  if (sLower === "chatgpt" && hasChatgptAsliStepUpCookie && !hasChatgptSessionEpochCookie && matchedNames.size === 0) {
    return {
      supported: true,
      loggedIn: false,
      resultCode: "chatgpt_reauth_required",
      matchedNames: [],
    };
  }
  if (isGoogleFamilyService(sLower)) {
    const hasDotGoogleSessionCookie = (Array.isArray(pairs) ? pairs : []).some((p) => {
      const d = String(p?.domain || p?.host_key || "").toLowerCase();
      const n = String(p?.name || "");
      if (d !== ".google.com" && d !== "google.com") return false;
      if (n !== "SID" && n !== "__Secure-1PSID" && n !== "__Secure-3PSID") return false;
      if (p?.value !== undefined && String(p.value || "").trim().length < 15) return false;
      return true;
    });
    const hasDotGoogleApiAuthCookie = (Array.isArray(pairs) ? pairs : []).some((p) => {
      const d = String(p?.domain || p?.host_key || "").toLowerCase();
      const n = String(p?.name || "");
      if (d !== ".google.com" && d !== "google.com") return false;
      if (n !== "SAPISID" && n !== "__Secure-1PAPISID" && n !== "__Secure-3PAPISID") return false;
      if (p?.value !== undefined && String(p.value || "").trim().length < 8) return false;
      return true;
    });
    const hasAll = hasDotGoogleSessionCookie && hasDotGoogleApiAuthCookie;
    return {
      supported: true,
      loggedIn: hasAll,
      resultCode: hasAll ? matcher.resultCode : "login_page",
      matchedNames: [...matchedNames],
    };
  }
  if (Array.isArray(matcher.requiresAll) && matcher.requiresAll.length > 0) {
    const hasAll = matcher.requiresAll.every((req) => matchedNames.has(req));
    return {
      supported: true,
      loggedIn: hasAll,
      resultCode: hasAll ? matcher.resultCode : "login_page",
      matchedNames: [...matchedNames],
    };
  }
  const spa = spaSummary && typeof spaSummary === "object" && ("localStorageText" in spaSummary || "indexedDbFolders" in spaSummary)
    ? matchServiceSpaStorage(serviceName, spaSummary)
    : null;
  const isSameProfileSpaMicrosoftAlias =
    (sLower === "outlook" || sLower === "hotmail" || sLower === "microsoft" || sLower === "microsoft office") &&
    (Boolean(
      allowedOutlookAliases &&
        expectedEmail &&
        spa?.accountEmail &&
        allowedOutlookAliases.has(expectedEmail) &&
        allowedOutlookAliases.has(spa.accountEmail),
    ) ||
      Boolean(opts?.allowSameProfileMicrosoftAliases));
  if (
    spa?.accountEmail &&
    expectedEmail &&
    !areComparableEmailsEqual(expectedEmail, spa.accountEmail) &&
    !isSameProfileSpaMicrosoftAlias
  ) {
    return {
      supported: true,
      loggedIn: false,
      resultCode: "account_mismatch",
      matchedNames: [],
      actualAccount: spa.accountEmail,
    };
  }
  if (matchedNames.size > 0) {
    return {
      supported: true,
      loggedIn: true,
      resultCode: matcher.resultCode,
      matchedNames: [...matchedNames],
      ...(spa?.firebaseRefreshToken ? { firebaseRefreshToken: spa.firebaseRefreshToken } : {}),
    };
  }
  if (spa?.matched) {
    return {
      supported: true,
      loggedIn: true,
      resultCode: matcher.resultCode,
      matchedNames: [spa.evidence],
      ...(spa?.firebaseRefreshToken ? { firebaseRefreshToken: spa.firebaseRefreshToken } : {}),
    };
  }
  return {
    supported: true,
    loggedIn: false,
    resultCode: "login_page",
    matchedNames: [],
  };
}

let _vaultCookiePairsCache = null;
let _vaultCookiePairsLoadedAt = 0;

/**
 * Proposal 2 (`ok 2`):
 * Loads and caches `(domain, name)` pairs from the shared ecosystem cookie vaults
 * (`fb-cookie-vault.json`, `mail-cookie-vault.json`, `tiktok-cookie-vault.json`, `service-cookie-vault.json`)
 * indexed by 4-digit `profileCode` (`0001`–`9999`), preventing false demotions when SQLite `Cookies` on disk
 * has not yet been flushed while valid backed-up cookies exist in the vault.
 */
function getVaultCookiePairsForProfileCode(profileCode) {
  const code = String(profileCode || "").trim().padStart(4, "0");
  if (!/^\d{4}$/.test(code)) return [];
  const nowMs = Date.now();
  if (!_vaultCookiePairsCache || nowMs - _vaultCookiePairsLoadedAt > 60_000) {
    const map = new Map();
    const nowSec = Math.floor(nowMs / 1000);
    const addCookies = (cCode, list) => {
      const k = String(cCode || "").trim().padStart(4, "0");
      if (!/^\d{4}$/.test(k) || !Array.isArray(list) || list.length === 0) return;
      let arr = map.get(k);
      if (!arr) {
        arr = [];
        map.set(k, arr);
      }
      for (const c of list) {
        if (c && c.domain && c.name) {
          if (Number.isFinite(c.expires) && c.expires > 0 && c.expires <= nowSec) continue;
          arr.push({
            domain: String(c.domain),
            name: String(c.name),
            ...(c.value !== undefined ? { value: String(c.value) } : {}),
          });
        }
      }
    };
    const vaultDir = resolveP0002VaultDir();
    if (vaultDir && fs.existsSync(vaultDir)) {
      // Do NOT merge fb-cookie-vault.json or tiktok-cookie-vault.json into on-disk SQLite cookie pairs:
      // Facebook retains c_user+xs on Checkpoint 282/956 and expired sessions, and TikTok/FB disk state must reflect actual SQLite Cookies.
      try {
        const mailFile = path.join(vaultDir, "mail-cookie-vault.json");
        if (fs.existsSync(mailFile)) {
          const raw = JSON.parse(fs.readFileSync(mailFile, "utf8"));
          const profiles = raw?.profiles || raw;
          for (const [k, v] of Object.entries(profiles || {})) {
            const cCode = k.split(":")[0];
            if (Array.isArray(v?.cookies)) addCookies(cCode, v.cookies);
            if (Array.isArray(v?.gmail?.cookies)) addCookies(cCode, v.gmail.cookies);
            if (Array.isArray(v?.outlook?.cookies)) addCookies(cCode, v.outlook.cookies);
          }
        }
      } catch {
        /* ignore */
      }
      try {
        const svcFile = path.join(vaultDir, "service-cookie-vault.json");
        if (fs.existsSync(svcFile)) {
          const raw = JSON.parse(fs.readFileSync(svcFile, "utf8"));
          const services = raw?.services || raw?.entries || raw;
          for (const [k, v] of Object.entries(services || {})) {
            const cCode = v?.code || k.split(":")[0];
            if (Array.isArray(v?.cookies)) {
              const nonCoreSvcCookies = v.cookies.filter((c) => {
                if (!c || !c.domain) return false;
                if (c.syntheticSpa) return true;
                const d = String(c.domain || "").toLowerCase();
                return !(
                  d.includes("google.") ||
                  d.includes("youtube.com") ||
                  d.includes("gstatic.com") ||
                  d.includes("googleapis.com") ||
                  d.includes("live.com") ||
                  d.includes("outlook.com") ||
                  d.includes("microsoft.com") ||
                  d.includes("office.com") ||
                  d.includes("microsoftonline.com") ||
                  d.includes("facebook.com") ||
                  d.includes("fb.com") ||
                  d.includes("tiktok.com")
                );
              });
              addCookies(cCode, nonCoreSvcCookies);
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
    _vaultCookiePairsCache = map;
    _vaultCookiePairsLoadedAt = nowMs;
  }
  return _vaultCookiePairsCache.get(code) || [];
}

/**
 * Reads `(domain, name, value)` pairs from a profile's SQLite `Default/Network/Cookies`
 * (automatically falling back to `Cookies.last-good.bak` if the live DB is locked by Chromium),
 * filtering out expired cookies (`expires_utc > 0 AND expires_utc <= nowWebkitMicros`) and
 * decrypting Chromium `v10`/`v11` `encrypted_value` via the profile's `Local State` DPAPI master key.
 * When `userDataDir` is present, strictly returns the profile's own SQLite cookies on disk (SSOT)
 * unless `includeVaultFallback === true`.
 */
function readProfileDiskCookiePairs(userDataDir, { profileCode = "", includeVaultFallback = false } = {}) {
  const vaultPairs = (!userDataDir || includeVaultFallback) && profileCode ? getVaultCookiePairsForProfileCode(profileCode) : [];
  if (!userDataDir) return { ok: vaultPairs.length > 0, pairs: [...vaultPairs] };
  const ckPath = path.join(userDataDir, COOKIES_REL_PATH);
  const bakPath = path.join(userDataDir, COOKIES_BAK_REL_PATH);
  const candidates = [ckPath, bakPath].filter((p) => fs.existsSync(p) && fs.statSync(p).size > 0);
  if (candidates.length === 0) return { ok: true, pairs: [...vaultPairs] };

  const masterKey = resolveProfileDpapiMasterKey(userDataDir);
  const nowWebkitMicros = (BigInt(Date.now()) + 11644473600000n) * 1000n;

  for (const targetPath of candidates) {
    let db = null;
    const tmpCopyPath = path.join(
      os.tmpdir(),
      `p0003-sync-pairs-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`,
    );
    try {
      try {
        fs.copyFileSync(targetPath, tmpCopyPath);
      } catch {
        fs.writeFileSync(tmpCopyPath, fs.readFileSync(targetPath));
      }
      db = new DatabaseSync(tmpCopyPath, { readOnly: true });
      const rows = db
        .prepare(
          `SELECT host_key AS domain, name, path, value, encrypted_value FROM cookies WHERE (length(encrypted_value) > 0 OR length(value) > 0) AND (expires_utc = 0 OR expires_utc > ${nowWebkitMicros.toString()}) ORDER BY last_update_utc ASC, creation_utc ASC, rowid ASC`,
        )
        .all();
      db.close();
      db = null;
      const byKey = new Map();
      for (const c of Array.isArray(rows) ? rows : []) {
        let val = c.value ? String(c.value) : "";
        if (!val && c.encrypted_value && masterKey && !isAnonymousOrTrackingCookieName(c.name)) {
          val = decryptChromiumCookieValue(c.encrypted_value, masterKey);
        }
        const k = `${String(c.domain || "").toLowerCase()}\t${String(c.path || "/")}\t${String(c.name || "")}`;
        byKey.set(k, {
          domain: c.domain,
          name: c.name,
          ...(val ? { value: val } : {}),
        });
      }
      const baseRows = [...byKey.values()];
      return { ok: true, pairs: vaultPairs.length > 0 ? [...baseRows, ...vaultPairs] : baseRows };
    } catch {
      try {
        if (db) db.close();
      } catch {
        /* ignore */
      }
    } finally {
      try {
        if (fs.existsSync(tmpCopyPath)) fs.unlinkSync(tmpCopyPath);
      } catch {
        /* ignore */
      }
    }
  }
  return { ok: vaultPairs.length > 0, locked: true, pairs: [...vaultPairs] };
}

function sanitizePlaywrightCookieForVault(c) {
  const name = String(c.name || "");
  const is3p = name.startsWith("__Secure-3P");
  return {
    name,
    value: String(c.value || ""),
    domain: String(c.domain || ""),
    path: String(c.path || "/"),
    secure: is3p || c.secure !== false,
    httpOnly: Boolean(c.httpOnly),
    ...(is3p ? { sameSite: "None" } : c.sameSite ? { sameSite: c.sameSite } : {}),
    ...(Number.isFinite(c.expires) && c.expires > 0 ? { expires: c.expires } : {}),
  };
}

function cookieFingerprint(cookies = [], keyNames = []) {
  const keySet = new Set(keyNames);
  return cookies
    .filter((c) => keySet.size === 0 || keySet.has(c.name))
    .map((c) => `${c.name}=${String(c.value || "").slice(0, 32)}`)
    .sort()
    .join("|");
}

module.exports = {
  resolveProfileDpapiMasterKey,
  decryptChromiumCookieValue,
  matchServiceCookiePairs,
  getVaultCookiePairsForProfileCode,
  readProfileDiskCookiePairs,
  sanitizePlaywrightCookieForVault,
  cookieFingerprint,
};
