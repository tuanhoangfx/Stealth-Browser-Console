"use strict";

const fs = require("node:fs");
const path = require("node:path");
const _cookieGuardMod = require("../profile-cookie-guard.cjs");
const {
  P0002_VAULT_DIR_CANDIDATES,
  resolveP0002VaultDir,
} = require("./service-cookie-matchers.cjs");
const {
  matchServiceCookiePairs,
  sanitizePlaywrightCookieForVault,
  cookieFingerprint,
} = require("./disk-sqlite-cookies.cjs");
const {
  fetchLiveCdpPageTargetsByPort,
  classifyFacebookLiveCdpTargets,
  REVOKED_GOOGLE_AUTH_COOKIE_NAMES,
  classifyClaudeLiveCdpTargets,
} = require("./live-cdp-targets.cjs");
const {
  verifyFacebookCookiesLiveViaHttp,
  verifyTikTokCookiesLiveViaHttp,
  verifyGoogleCookiesLiveViaHttp,
  verifyClaudeCookiesLiveViaHttp,
} = require("./http-cookie-verifiers.cjs");

const _liveVaultJsonMemoryCache =
  globalThis.__STEALTH_LIVE_VAULT_JSON_CACHE__ ||
  (globalThis.__STEALTH_LIVE_VAULT_JSON_CACHE__ = new Map());
const _liveVaultFlushTimers =
  globalThis.__STEALTH_LIVE_VAULT_FLUSH_TIMERS__ ||
  (globalThis.__STEALTH_LIVE_VAULT_FLUSH_TIMERS__ = new Map());

function readVaultJsonCached(filePath, fallbackFactory) {
  const key = path.resolve(String(filePath));
  const baseName = path.basename(key);
  const cached = _liveVaultJsonMemoryCache.get(key);
  if (cached && cached.dirty) {
    return cached.data;
  }
  try {
    if (!fs.existsSync(key)) {
      const fresh = fallbackFactory();
      _liveVaultJsonMemoryCache.set(key, { mtimeMs: 0, dirty: false, data: fresh });
      return fresh;
    }
    const st = fs.statSync(key);
    if (cached && cached.mtimeMs === st.mtimeMs && cached.data) {
      return cached.data;
    }
    const parsed = JSON.parse(fs.readFileSync(key, "utf8"));
    _liveVaultJsonMemoryCache.set(key, { mtimeMs: st.mtimeMs, dirty: false, data: parsed });
    return parsed;
  } catch {
    if (cached && cached.data) {
      return cached.data;
    }
    for (const altDir of P0002_VAULT_DIR_CANDIDATES) {
      try {
        const altPath = path.resolve(altDir, baseName);
        if (altPath !== key && fs.existsSync(altPath)) {
          const parsedAlt = JSON.parse(fs.readFileSync(altPath, "utf8"));
          _liveVaultJsonMemoryCache.set(key, { mtimeMs: Date.now(), dirty: false, data: parsedAlt });
          return parsedAlt;
        }
      } catch {
        /* try next candidate */
      }
    }
    const fresh = fallbackFactory();
    return fresh;
  }
}

let _cookieVaultSqliteDb = null;
let _cookieVaultSqliteUpsertStmt = null;

function upsertCookieVaultSqliteEntry(vaultDir, vaultName, entryKey, profileCode, provider, entryObj) {
  try {
    if (!_cookieVaultSqliteDb) {
      const { openGuardSqlite } = require("../profile-cookie-guard.cjs");
      const dbPath = path.join(vaultDir, "cookie-vault.db");
      _cookieVaultSqliteDb = openGuardSqlite(dbPath, { readOnly: false, busyTimeoutMs: 5000 });
      _cookieVaultSqliteDb.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA temp_store = MEMORY;
        PRAGMA mmap_size = 67108864;
        PRAGMA wal_autocheckpoint = 2000;
        PRAGMA journal_size_limit = 67108864;
        CREATE TABLE IF NOT EXISTS cookie_vault_entries (
          vault_name TEXT NOT NULL,
          entry_key TEXT NOT NULL,
          profile_code TEXT NOT NULL,
          provider TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          PRIMARY KEY (vault_name, entry_key)
        );
        CREATE INDEX IF NOT EXISTS idx_cookie_vault_profile ON cookie_vault_entries(profile_code);
      `);
      _cookieVaultSqliteUpsertStmt = _cookieVaultSqliteDb.prepare(`
        INSERT OR REPLACE INTO cookie_vault_entries (vault_name, entry_key, profile_code, provider, updated_at, payload_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
    }
    _cookieVaultSqliteUpsertStmt.run(
      String(vaultName),
      String(entryKey),
      String(profileCode),
      String(provider || ""),
      String(entryObj?.updatedAt || new Date().toISOString()),
      JSON.stringify(entryObj),
    );
  } catch {
    /* optional SQLite WAL fast-path */
  }
}

function scheduleDebouncedVaultJsonWrite(filePath, payload) {
  const key = path.resolve(String(filePath));
  const baseName = path.basename(key);
  _liveVaultJsonMemoryCache.set(key, { mtimeMs: Date.now(), dirty: true, data: payload });

  const mirrorVaultFileSync = (jsonText) => {
    for (const altDir of P0002_VAULT_DIR_CANDIDATES) {
      try {
        if (!fs.existsSync(altDir)) continue;
        const altPath = path.resolve(altDir, baseName);
        if (altPath !== key) {
          const altTmp = `${altPath}.tmp.${process.pid}.${Date.now()}`;
          fs.writeFileSync(altTmp, jsonText, "utf8");
          try {
            fs.renameSync(altTmp, altPath);
          } catch {
            fs.writeFileSync(altPath, jsonText, "utf8");
            try { fs.unlinkSync(altTmp); } catch { /* ignore */ }
          }
        }
      } catch {
        /* ignore mirror write error */
      }
    }
  };

  // In test runners or explicit sync mode, flush immediately so assertions see the file on disk.
  if (
    process.env.JEST_WORKER_ID ||
    process.env.VITEST ||
    process.env.NODE_ENV === "test" ||
    !process.versions?.electron
  ) {
    try {
      const jsonText = JSON.stringify(payload);
      const syncTmp = `${key}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(syncTmp, jsonText, "utf8");
      try {
        fs.renameSync(syncTmp, key);
      } catch {
        fs.writeFileSync(key, jsonText, "utf8");
        try { fs.unlinkSync(syncTmp); } catch { /* ignore */ }
      }
      mirrorVaultFileSync(jsonText);
      const st = fs.statSync(key);
      _liveVaultJsonMemoryCache.set(key, { mtimeMs: st.mtimeMs, dirty: false, data: payload });
    } catch {
      /* ignore */
    }
    return;
  }

  if (_liveVaultFlushTimers.has(key)) return;
  const timer = setTimeout(async () => {
    _liveVaultFlushTimers.delete(key);
    const entry = _liveVaultJsonMemoryCache.get(key);
    if (!entry || !entry.dirty) return;
    const tmpPath = `${key}.tmp.${process.pid}.${Date.now()}`;
    try {
      const jsonText = JSON.stringify(entry.data);
      await fs.promises.writeFile(tmpPath, jsonText, "utf8");
      try {
        await fs.promises.rename(tmpPath, key);
      } catch {
        await fs.promises.writeFile(key, jsonText, "utf8");
        await fs.promises.unlink(tmpPath).catch(() => undefined);
      }
      for (const altDir of P0002_VAULT_DIR_CANDIDATES) {
        try {
          if (!fs.existsSync(altDir)) continue;
          const altPath = path.resolve(altDir, baseName);
          if (altPath !== key) {
            const altTmp = `${altPath}.tmp.${process.pid}.${Date.now()}`;
            await fs.promises.writeFile(altTmp, jsonText, "utf8");
            try {
              await fs.promises.rename(altTmp, altPath);
            } catch {
              await fs.promises.writeFile(altPath, jsonText, "utf8");
              await fs.promises.unlink(altTmp).catch(() => undefined);
            }
          }
        } catch {
          /* ignore mirror write error */
        }
      }
      const st = await fs.promises.stat(key).catch(() => ({ mtimeMs: Date.now() }));
      _liveVaultJsonMemoryCache.set(key, { mtimeMs: st.mtimeMs, dirty: false, data: entry.data });
    } catch {
      await fs.promises.unlink(tmpPath).catch(() => undefined);
    }
  }, 25000);
  if (typeof timer.unref === "function") timer.unref();
  _liveVaultFlushTimers.set(key, timer);
}

/**
 * Proposal 3 (`ok 3` — Change-Only Vault Sync) + `ok 1` (Debounced Async Non-Blocking Flush):
 * Inspects live `context.cookies()` or raw CDP `Storage.getCookies` (plaintext in RAM) and updates
 * `*-cookie-vault.json` ONLY when a newly logged-in platform or changed session token is detected,
 * coalescing multi-megabyte JSON writes asynchronously in the background without blocking Electron's main thread.
 */
async function syncLiveCdpCookiesToVaultIfChanged(
  allCookies = [],
  { profileCode = "", debugPort = 0, userDataDir = "", fromStaticDisk = false } = {},
) {
  const code = String(profileCode || "").trim().padStart(4, "0");
  // Ephemeral Agent Pool (`9000`–`9999` / `9xxx`): Never persist temporary agent cookies into ecosystem vaults
  if (!/^\d{4}$/.test(code) || /^9\d{3}$/.test(code) || !Array.isArray(allCookies)) {
    return { ok: false, updatedVaults: [] };
  }
  if (allCookies.length === 0) {
    return { ok: true, updatedVaults: [] };
  }

  const vaultDir = resolveP0002VaultDir();
  if (!fs.existsSync(vaultDir)) {
    return { ok: false, updatedVaults: [] };
  }

  const updatedVaults = [];
  const nowIso = new Date().toISOString();

  // 1. Facebook (`c_user` + `xs`) — never save to vault if live window or HTTP check shows Checkpoint 282/956 or /login
  const fbCookies = allCookies.filter((c) => String(c.domain || "").toLowerCase().includes("facebook.com"));
  const hasCUser = fbCookies.some((c) => c.name === "c_user" && c.value);
  const hasXs = fbCookies.some((c) => c.name === "xs" && c.value);
  const hasCheckpointCookie = fbCookies.some((c) => c.name === "checkpoint" && c.value);
  if (hasCUser && hasXs && !hasCheckpointCookie) {
    const fbFile = path.join(vaultDir, "fb-cookie-vault.json");
    try {
      const raw = readVaultJsonCached(fbFile, () => ({ profiles: {} }));
      const profiles = raw.profiles && typeof raw.profiles === "object" ? raw.profiles : raw;
      const existing = profiles[code]?.cookies || [];
      const prevSig = cookieFingerprint(existing, ["c_user", "xs"]);
      const nextSig = cookieFingerprint(fbCookies, ["c_user", "xs"]);
      if (nextSig && nextSig !== prevSig) {
        const liveTargets = debugPort > 0 ? await fetchLiveCdpPageTargetsByPort(debugPort) : [];
        const targetRestricted = classifyFacebookLiveCdpTargets(liveTargets);
        const hasCleanFbLiveTab =
          !targetRestricted &&
          liveTargets.some((t) => {
            const u = String(t?.url || "");
            return /facebook\.com/i.test(u) && !/\/(login|recover|checkpoint)|two_step_verification|auth_platform/i.test(u);
          });
        const httpCheck = hasCleanFbLiveTab ? await verifyFacebookCookiesLiveViaHttp(fbCookies) : null;
        if (hasCleanFbLiveTab && httpCheck?.loggedIn === true) {
          const essentialNames = new Set(["c_user", "xs", "datr", "sb", "fr", "wd", "presence"]);
          profiles[code] = {
            code,
            updatedAt: nowIso,
            cookies: fbCookies.filter((c) => essentialNames.has(c.name)).map(sanitizePlaywrightCookieForVault),
          };
          upsertCookieVaultSqliteEntry(vaultDir, "fb-cookie-vault", code, code, "facebook", profiles[code]);
          const payload = raw.profiles ? { updatedAt: nowIso, profiles } : profiles;
          scheduleDebouncedVaultJsonWrite(fbFile, payload);
          updatedVaults.push("facebook");
        } else if (targetRestricted && profiles[code]) {
          delete profiles[code];
          const payload = raw.profiles ? { updatedAt: nowIso, profiles } : profiles;
          scheduleDebouncedVaultJsonWrite(fbFile, payload);
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 2. Mail (`Gmail` & `Outlook`)
  const googleCookies = allCookies.filter((c) => {
    const d = String(c.domain || "").toLowerCase();
    return d.includes("google.com") || d.includes("youtube.com");
  });
  const hasGoogleAuth = googleCookies.some(
    (c) => (c.name === "SID" || c.name === "__Secure-1PSID" || c.name === "__Secure-3PSID") && c.value,
  );

  const msCookies = allCookies.filter((c) => {
    const d = String(c.domain || "").toLowerCase();
    return (
      d.includes("live.com") ||
      d.includes("outlook.com") ||
      d.includes("office.com") ||
      d.includes("microsoft.com") ||
      d.includes("microsoftonline.com")
    );
  });
  const hasMsAuth = msCookies.some(
    (c) =>
      (c.name === "RPSSecAuth" ||
        c.name === "MSPAuth" ||
        c.name === "__Host-MSAAUTH" ||
        c.name === "ESTSAUTH" ||
        c.name === "ESTSAUTHPERSISTENT" ||
        c.name === "WLSSC") &&
      c.value,
  );

  if (hasGoogleAuth || hasMsAuth) {
    const mailFile = path.join(vaultDir, "mail-cookie-vault.json");
    try {
      const raw = readVaultJsonCached(mailFile, () => ({ profiles: {} }));
      const profiles = raw.profiles && typeof raw.profiles === "object" ? raw.profiles : raw;
      let mailChanged = false;

      if (hasGoogleAuth) {
        const gKey = `${code}:gmail`;
        const prevFlatCookies = profiles[gKey]?.cookies || [];
        const prevNestedCookies = profiles[code]?.gmail?.cookies || [];
        const googleFpKeys = [
          "SID",
          "__Secure-1PSID",
          "__Secure-1PSIDTS",
          "__Secure-3PSIDTS",
          "SIDCC",
          "__Secure-1PSIDCC",
          "LSID",
          "__Host-1PLSID",
          "OSID",
          "__Secure-OSID",
        ];
        const prevSig = cookieFingerprint(
          prevFlatCookies.length > 0 && prevNestedCookies.length > 0 ? prevFlatCookies : [],
          googleFpKeys,
        );
        const nextSig = cookieFingerprint(googleCookies, googleFpKeys);
        const existingGoogleList = prevFlatCookies.length > 0 ? prevFlatCookies : prevNestedCookies;
        const getSidtsExp = (arr) =>
          Number((Array.isArray(arr) ? arr : []).find((c) => c && c.name === "__Secure-1PSIDTS")?.expires || 0);
        const prevSidtsExp = getSidtsExp(existingGoogleList);
        const nextSidtsExp = getSidtsExp(googleCookies);
        const isStaleDiskRollback =
          existingGoogleList.length > 0 &&
          ((fromStaticDisk && nextSidtsExp <= prevSidtsExp) ||
            (prevSidtsExp > 0 && nextSidtsExp > 0 && nextSidtsExp < prevSidtsExp - 5));
        if (nextSig && nextSig !== prevSig && !isStaleDiskRollback) {
          const gCheck = await verifyGoogleCookiesLiveViaHttp(googleCookies, 4500, fetch, {
            resolveIdentity: true,
            userDataDir,
          });
          if (!gCheck.ok || gCheck.loggedIn) {
            const essentialGoogleNames = new Set(REVOKED_GOOGLE_AUTH_COOKIE_NAMES);
            const coherentGoogle = _cookieGuardMod.reconcileSplitGoogleAuthCookies(
              googleCookies.filter((c) => essentialGoogleNames.has(c.name)),
              [],
            );
            const sanitizedGoogle = coherentGoogle.map(sanitizePlaywrightCookieForVault);
            const verifiedEmails = Array.isArray(gCheck?.verifiedEmails) ? gCheck.verifiedEmails : undefined;
            profiles[gKey] = {
              code,
              provider: "gmail",
              updatedAt: nowIso,
              ...(verifiedEmails?.length ? { verifiedEmails, accountEmail: verifiedEmails[0] } : {}),
              cookies: sanitizedGoogle,
            };
            const baseEntry =
              profiles[code] && typeof profiles[code] === "object" && !Array.isArray(profiles[code].cookies)
                ? profiles[code]
                : {};
            profiles[code] = {
              ...baseEntry,
              gmail: {
                updatedAt: nowIso,
                ...(verifiedEmails?.length ? { verifiedEmails, accountEmail: verifiedEmails[0] } : {}),
                cookies: sanitizedGoogle,
              },
            };
            upsertCookieVaultSqliteEntry(vaultDir, "mail-cookie-vault", gKey, code, "gmail", profiles[gKey]);
            mailChanged = true;
            updatedVaults.push("gmail");
          }
        }
      }

      if (hasMsAuth) {
        const oKey = `${code}:outlook`;
        const msAuthNames = ["RPSSecAuth", "MSPAuth", "__Host-MSAAUTH", "ESTSAUTH", "ESTSAUTHPERSISTENT", "WLSSC"];
        const essentialMsNames = new Set([
          ...msAuthNames,
          "MSPOK",
          "DefaultAnchorMailbox",
          "OwaUserState",
          "ANON",
          "NAP",
          "PPLState",
          "__Host-MSAAUTHP",
          "OParams",
          "MSPProf",
          "SDIDC",
          "MSNRPSAuth",
          "AMRPSSecAuth",
          "AMCSecAuth",
          "JSH",
          "JSHP",
        ]);
        const prevFlatCookies = profiles[oKey]?.cookies || [];
        const prevNestedCookies = profiles[code]?.outlook?.cookies || [];
        const prevSig = cookieFingerprint(
          prevFlatCookies.length > 0 && prevNestedCookies.length > 0 ? prevFlatCookies : [],
          msAuthNames,
        );
        const nextSig = cookieFingerprint(msCookies, msAuthNames);
        if (nextSig && nextSig !== prevSig) {
          const sanitizedMs = msCookies
            .filter((c) => essentialMsNames.has(c.name))
            .map(sanitizePlaywrightCookieForVault);
          profiles[oKey] = {
            code,
            provider: "outlook",
            updatedAt: nowIso,
            cookies: sanitizedMs,
          };
          const baseEntry =
            profiles[code] && typeof profiles[code] === "object" && !Array.isArray(profiles[code].cookies)
              ? profiles[code]
              : {};
          profiles[code] = {
            ...baseEntry,
            outlook: {
              updatedAt: nowIso,
              cookies: sanitizedMs,
            },
          };
          upsertCookieVaultSqliteEntry(vaultDir, "mail-cookie-vault", oKey, code, "outlook", profiles[oKey]);
          mailChanged = true;
          updatedVaults.push("outlook");
        }
      }

      if (mailChanged) {
        const payload = raw.profiles ? { updatedAt: nowIso, profiles } : profiles;
        scheduleDebouncedVaultJsonWrite(mailFile, payload);
      }
    } catch {
      /* ignore */
    }
  }

  // 3. TikTok (`sessionid` / `sessionid_ss` / `sid_tt` — must be real 24-64 char hex token)
  const ttCookies = allCookies.filter(
    (c) => String(c.domain || "").toLowerCase().includes("tiktok.com") && !String(c.value || "").startsWith("dGlrdG9rX"),
  );
  const hasTtAuth = ttCookies.some(
    (c) =>
      (c.name === "sessionid" || c.name === "sessionid_ss" || c.name === "sid_tt") &&
      /^[0-9a-f]{24,64}$/i.test(String(c.value || "").trim()),
  );
  if (hasTtAuth) {
    const ttFile = path.join(vaultDir, "tiktok-cookie-vault.json");
    try {
      const raw = readVaultJsonCached(ttFile, () => ({ profiles: {} }));
      const profiles = raw.profiles && typeof raw.profiles === "object" ? raw.profiles : raw;
      const prevSig = cookieFingerprint(profiles[code]?.cookies || [], ["sessionid", "sessionid_ss", "sid_tt"]);
      const nextSig = cookieFingerprint(ttCookies, ["sessionid", "sessionid_ss", "sid_tt"]);
      if (nextSig && nextSig !== prevSig) {
        const ttCheck = await verifyTikTokCookiesLiveViaHttp(ttCookies);
        if (ttCheck.ok && !ttCheck.loggedIn) {
          if (profiles[code]) {
            delete profiles[code];
            const payload = raw.profiles ? { updatedAt: nowIso, profiles } : profiles;
            scheduleDebouncedVaultJsonWrite(ttFile, payload);
          }
        } else {
          profiles[code] = {
            code,
            ...(ttCheck.tiktokUserId ? { tiktokUserId: ttCheck.tiktokUserId } : {}),
            ...(ttCheck.tiktokUsername ? { tiktokUsername: ttCheck.tiktokUsername } : {}),
            updatedAt: nowIso,
            cookies: ttCookies.map(sanitizePlaywrightCookieForVault),
          };
          upsertCookieVaultSqliteEntry(vaultDir, "tiktok-cookie-vault", code, code, "tiktok", profiles[code]);
          const payload = raw.profiles ? { updatedAt: nowIso, profiles } : profiles;
          scheduleDebouncedVaultJsonWrite(ttFile, payload);
          updatedVaults.push("tiktok");
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 4. Web Services (`service-cookie-vault.json`)
  const SERVICE_VAULT_DOMAINS = [
    { key: "chatgpt", domains: ["chatgpt.com", "openai.com"] },
    { key: "sora openai", domains: ["sora.com", "chatgpt.com", "openai.com"] },
    { key: "claude", domains: ["claude.ai", "anthropic.com"] },
    { key: "cursor", domains: ["cursor.com", "cursor.sh"] },
    { key: "capcut", domains: ["capcut.com"] },
    { key: "elevenlabs", domains: ["elevenlabs.io"] },
    { key: "grok", domains: ["grok.com", "x.ai", "x.com"] },
    { key: "perplexity", domains: ["perplexity.ai"] },
    { key: "heygen", domains: ["heygen.com"] },
    { key: "adobe", domains: ["adobe.com", "adobelogin.com"] },
    { key: "canva", domains: ["canva.com", "canva.cn"] },
    { key: "github", domains: ["github.com"] },
    { key: "netflix", domains: ["netflix.com"] },
    { key: "sync.so", domains: ["sync.so"] },
    { key: "midjourney", domains: ["midjourney.com"] },
    { key: "discord", domains: ["discord.com"] },
    { key: "leonardo ai", domains: ["leonardo.ai"] },
    { key: "runway", domains: ["runwayml.com"] },
    { key: "freepik", domains: ["freepik.com"] },
    { key: "topview", domains: ["topview.ai"] },
    { key: "vidiq", domains: ["vidiq.com"] },
    { key: "kalodata", domains: ["kalodata.com"] },
    { key: "vercel", domains: ["vercel.com"] },
    { key: "suno", domains: ["suno.com", "suno.ai"] },
    { key: "kling", domains: ["klingai.com", "kling.ai"] },
    { key: "higgsfield", domains: ["higgsfield.ai"] },
  ];

  const svcFile = path.join(vaultDir, "service-cookie-vault.json");
  try {
    let raw = null;
    let servicesObj = null;
    let svcChanged = false;

    for (const item of SERVICE_VAULT_DOMAINS) {
      const match = matchServiceCookiePairs(item.key, allCookies);
      if (!match.loggedIn) continue;
      const domainCookies = allCookies.filter((c) => {
        const d = String(c.domain || "").toLowerCase();
        return item.domains.some((dom) => d.includes(dom));
      });
      if (!domainCookies.length) continue;

      if (!raw) {
        raw = readVaultJsonCached(svcFile, () => ({ services: {} }));
        servicesObj =
          raw.services && typeof raw.services === "object"
            ? raw.services
            : raw.entries && typeof raw.entries === "object"
              ? raw.entries
              : raw;
      }
      const vaultKey = `${code}:${item.key}`;
      const prevSig = cookieFingerprint(servicesObj[vaultKey]?.cookies || [], match.matchedNames);
      const nextSig = cookieFingerprint(domainCookies, match.matchedNames);
      if (nextSig && nextSig !== prevSig) {
        if (item.key === "claude") {
          const liveTargets = debugPort > 0 ? await fetchLiveCdpPageTargetsByPort(debugPort) : [];
          const claudeTargetState = classifyClaudeLiveCdpTargets(liveTargets);
          const claudeHttpCheck = !claudeTargetState?.restricted
            ? await verifyClaudeCookiesLiveViaHttp(domainCookies)
            : null;
          if (claudeTargetState?.restricted || (claudeHttpCheck?.ok && !claudeHttpCheck.loggedIn)) {
            if (servicesObj[vaultKey]) {
              delete servicesObj[vaultKey];
              svcChanged = true;
            }
            continue;
          }
        }
        const serviceNoiseCookieRe =
          /^(_ga|_gid|_gat|_gcl_|_fbp|_fbc|_uetsid|_uetvid|_clck|_clsk|_dd_s|mp_|ajs_|amplitude|intercom-|optimizely|hubspot|__cf_bm|_cfuvid|cf_chl_|statsig)/i;
        servicesObj[vaultKey] = {
          code,
          service: item.key,
          updatedAt: nowIso,
          cookies: domainCookies
            .filter((c) => c && c.name && !serviceNoiseCookieRe.test(c.name))
            .map(sanitizePlaywrightCookieForVault),
        };
        upsertCookieVaultSqliteEntry(vaultDir, "service-cookie-vault", vaultKey, code, item.key, servicesObj[vaultKey]);
        svcChanged = true;
        updatedVaults.push(`service:${item.key}`);
      }
    }

    if (svcChanged && raw && servicesObj) {
      const payload = raw.services
        ? { ...raw, updatedAt: nowIso, services: servicesObj }
        : raw.entries
          ? { ...raw, updated_at: nowIso, entries: servicesObj }
          : servicesObj;
      scheduleDebouncedVaultJsonWrite(svcFile, payload);
    }
  } catch {
    /* ignore */
  }

  // Native-First SSOT (`ok 1`): Do NOT write `Cookies.vault-hydrated.json` back into the profile directory
  // unless legacy JSON hydration is explicitly requested (`STEALTH_LEGACY_JSON_VAULT_WRITE=1`),
  // because Chromium's native `Default/Network/Cookies` inside `userDataDir` is the single source of truth.
  if (
    updatedVaults.length > 0 &&
    userDataDir &&
    process.env.STEALTH_LEGACY_JSON_VAULT_WRITE === "1"
  ) {
    try {
      const { writeBackVaultCookiesToProfileDisk } = require("../profile-cookie-guard.cjs");
      writeBackVaultCookiesToProfileDisk(userDataDir, { profileCode: code });
    } catch {
      /* ignore */
    }
  }

  return { ok: true, updatedVaults };
}

async function syncLiveContextCookiesToVaultIfChanged(context, { profileCode = "", userDataDir = "" } = {}) {
  const code = String(profileCode || "").trim().padStart(4, "0");
  if (!/^\d{4}$/.test(code) || !context || typeof context.cookies !== "function") {
    return { ok: false, updatedVaults: [] };
  }
  let allCookies = [];
  try {
    allCookies = await context.cookies();
  } catch {
    return { ok: false, updatedVaults: [] };
  }
  return syncLiveCdpCookiesToVaultIfChanged(allCookies, { profileCode: code, userDataDir });
}

module.exports = {
  readVaultJsonCached,
  upsertCookieVaultSqliteEntry,
  scheduleDebouncedVaultJsonWrite,
  syncLiveCdpCookiesToVaultIfChanged,
  syncLiveContextCookiesToVaultIfChanged,
};
