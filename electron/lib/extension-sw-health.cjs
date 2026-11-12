"use strict";
/**
 * Bounded, 60s TTL-cached MV3 Service Worker fleet health inspector (`ok 3`) for
 * `E0001-cookie-bridge` and `E0002-browser-operator`.
 *
 * Inspects `Default/Secure Preferences` + `Default/Preferences` across up to 40 recently active
 * closed non-`8xxx` / non-`9xxx` profiles to verify that Chromium actually registered the MV3
 * background Service Worker (`service_worker_registration_info.version` / `serviceworkerevents`)
 * instead of silently failing under renderer/junction sandbox rules.
 *
 * Zero launch-path overhead: never called during profile launch; cached for 60s when System -> Extensions
 * queries status.
 */
const fs = require("node:fs");
const path = require("node:path");
const { resolveProfilesRoot } = require("./profiles-location.cjs");
const { COOKIE_BRIDGE_STORE_ID } = require("./stealth-extension-store-ids.cjs");

const SW_HEALTH_TTL_MS = 60_000;
const MAX_SAMPLED_PROFILES = 40;
let _swHealthCache = null;

function invalidateExtensionSwHealthCache() {
  _swHealthCache = null;
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isExcludedFleetSampleCode(code) {
  const digits = String(code || "").trim().replace(/^#/, "");
  if (!digits) return false;
  // Strictly skip protected customer 8xxx profiles and ephemeral 9xxx agent smoke pool
  return /^8\d{3}$/.test(digits) || /^9\d{3}$/.test(digits);
}

function classifyExtensionKey(extId, meta) {
  const idLower = String(extId || "").toLowerCase();
  const name = String(meta?.manifest?.name || "");
  const extPath = String(meta?.path || "").replace(/\\/g, "/").toLowerCase();

  if (
    idLower === COOKIE_BRIDGE_STORE_ID.toLowerCase() ||
    idLower === "ehlfggnaljhaehaaflmcojimgbolilcb" ||
    /e0001|cookie bridge/i.test(name) ||
    extPath.includes(`/${COOKIE_BRIDGE_STORE_ID.toLowerCase()}`) ||
    extPath.includes("/e0001-cookie-bridge")
  ) {
    return "e0001";
  }

  if (
    idLower === "ckalnmjdalpecadefcppeohmdgocgjlj" ||
    idLower === "kldoeipllnpkahkaceadgjpblglmdjck" ||
    /e0002|browser operator/i.test(name) ||
    extPath.includes("/ckalnmjdalpecadefcppeohmdgocgjlj") ||
    extPath.includes("/e0002-browser-operator")
  ) {
    return "e0002";
  }

  return null;
}

function resolveLiveInitDbModule() {
  for (const mod of Object.values(require.cache)) {
    if (
      mod?.filename &&
      /electron[\\/]db[\\/]init\.cjs$/i.test(mod.filename) &&
      typeof mod.exports?.isDatabaseReady === "function" &&
      mod.exports.isDatabaseReady()
    ) {
      return mod.exports;
    }
  }
  return require("../db/init.cjs");
}

function isProfileDirLocked(dir) {
  if (fs.existsSync(path.join(dir, "SingletonLock"))) return true;
  const winLock = path.join(dir, "lockfile");
  if (!fs.existsSync(winLock)) return false;
  try {
    const fd = fs.openSync(winLock, "r+");
    fs.closeSync(fd);
    return false;
  } catch (err) {
    return err?.code === "EBUSY" || err?.code === "EPERM" || err?.code === "EACCES";
  }
}

function collectCandidateClosedProfiles(profilesDir) {
  if (!profilesDir || !fs.existsSync(profilesDir)) return [];
  const out = [];

  try {
    const { isDatabaseReady, getDb } = resolveLiveInitDbModule();
    if (typeof isDatabaseReady === "function" && isDatabaseReady()) {
      const stmt = getDb().prepare(
        `SELECT id, name
           FROM profiles
          WHERE status NOT IN ('running', 'opening')
          ORDER BY
            CASE
              WHEN CAST(name AS INTEGER) BETWEEN 1 AND 250 THEN 0
              WHEN COALESCE(headless, 0) = 0 AND CAST(name AS INTEGER) BETWEEN 251 AND 7999 THEN 1
              ELSE 2
            END,
            COALESCE(last_opened_at, 0) DESC,
            updated_at DESC
          LIMIT 800`,
      );
      const rows = [];
      if (typeof stmt.all === "function") {
        rows.push(...stmt.all());
      } else {
        try {
          while (stmt.step()) rows.push(stmt.getAsObject());
        } finally {
          if (typeof stmt.free === "function") stmt.free();
        }
      }
      const maxCandidateDirs = MAX_SAMPLED_PROFILES * 4;
      for (const row of rows) {
        const code = String(row?.name || "").trim();
        if (isExcludedFleetSampleCode(code)) continue;
        const dir = path.join(profilesDir, String(row.id));
        if (!fs.existsSync(path.join(dir, "Default", "Secure Preferences"))) continue;
        if (isProfileDirLocked(dir)) continue;
        out.push({ dir, label: code ? `#${code.replace(/^#/, "")}` : String(row.id).slice(0, 8) });
        if (out.length >= maxCandidateDirs) return out;
      }
      return out;
    }
  } catch {
    /* fallback to filesystem walk (e.g. unit tests) */
  }

  try {
    const entries = fs.readdirSync(profilesDir, { withFileTypes: true });
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === "p0003-agent-shadow") continue;
      // Never inspect unmapped UUID folders without SQLite code mapping (protects 8xxx/9xxx)
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(entry.name)) continue;
      if (isExcludedFleetSampleCode(entry.name)) continue;
      const dir = path.join(profilesDir, entry.name);
      const secPrefsPath = path.join(dir, "Default", "Secure Preferences");
      if (!fs.existsSync(secPrefsPath)) continue;
      if (isProfileDirLocked(dir)) continue;
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(secPrefsPath).mtimeMs;
      } catch {
        continue;
      }
      candidates.push({ dir, label: `#${entry.name.replace(/^#/, "")}`, mtimeMs });
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates.slice(0, MAX_SAMPLED_PROFILES).map(({ dir, label }) => ({ dir, label }));
  } catch {
    return [];
  }
}

function createAccumulator(expectedVersion) {
  return {
    registeredCount: 0,
    currentVersionCount: 0,
    outdatedVersionCount: 0,
    missingSwCount: 0,
    sampledProfiles: 0,
    expectedVersion: expectedVersion || null,
    activeSwVersion: null,
    sampleMissingCodes: [],
  };
}

function finalizeSummary(acc) {
  let status = "idle";
  if (acc.sampledProfiles > 0) {
    if (acc.missingSwCount > 0) {
      status = "needs-heal";
    } else if (acc.outdatedVersionCount > 0 && acc.currentVersionCount === 0) {
      status = "outdated";
    } else {
      status = "healthy";
    }
  }
  return {
    status,
    registeredCount: acc.registeredCount,
    currentVersionCount: acc.currentVersionCount,
    outdatedVersionCount: acc.outdatedVersionCount,
    missingSwCount: acc.missingSwCount,
    sampledProfiles: acc.sampledProfiles,
    expectedVersion: acc.expectedVersion,
    activeSwVersion: acc.activeSwVersion,
    sampleMissingCodes: acc.sampleMissingCodes,
  };
}

function inspectMv3ServiceWorkerFleetHealth(
  userDataRoot,
  {
    expectedE0001Version = null,
    expectedE0002Version = null,
    forceRefresh = false,
  } = {},
) {
  const resolvedRoot =
    typeof userDataRoot === "function"
      ? String(userDataRoot() || "").trim()
      : String(userDataRoot || "").trim();
  const now = Date.now();
  const cacheKey = `${resolvedRoot}::${expectedE0001Version || ""}::${expectedE0002Version || ""}`;

  if (
    !forceRefresh &&
    _swHealthCache &&
    _swHealthCache.key === cacheKey &&
    now - _swHealthCache.at < SW_HEALTH_TTL_MS
  ) {
    return _swHealthCache.value;
  }

  const profilesDir = resolvedRoot ? resolveProfilesRoot(resolvedRoot) : "";
  const candidates = collectCandidateClosedProfiles(profilesDir);

  const accByExt = {
    e0001: createAccumulator(expectedE0001Version),
    e0002: createAccumulator(expectedE0002Version),
  };

  for (const item of candidates) {
    const prefs = readJsonSafe(path.join(item.dir, "Default", "Preferences"));
    const secPrefs = readJsonSafe(path.join(item.dir, "Default", "Secure Preferences"));
    const prefSettings = prefs?.extensions?.settings || {};
    const secSettings = secPrefs?.extensions?.settings || {};
    const allIds = new Set([...Object.keys(prefSettings), ...Object.keys(secSettings)]);

    const perProfileBest = new Map();
    for (const extId of allIds) {
      const pMeta = prefSettings[extId] || {};
      const sMeta = secSettings[extId] || {};
      const merged = {
        ...pMeta,
        ...sMeta,
        manifest: sMeta.manifest || pMeta.manifest || null,
        path: sMeta.path || pMeta.path || "",
        state: sMeta.state ?? pMeta.state ?? 1,
        swInfo: sMeta.service_worker_registration_info || pMeta.service_worker_registration_info || null,
        swEvents: Array.isArray(sMeta.serviceworkerevents)
          ? sMeta.serviceworkerevents
          : Array.isArray(pMeta.serviceworkerevents)
            ? pMeta.serviceworkerevents
            : [],
      };
      const kind = classifyExtensionKey(extId, merged);
      if (!kind) continue;
      // Only sample entries that Chromium's ExtensionPrefs C++ layer actually wrote into
      // `Default/Secure Preferences` (`sMeta` non-empty & enabled). Pre-launch `pinExtensionInProfilePreferences`
      // seeds `Default/Preferences` (`location: 4`) even on `chrome-headless.exe --disable-extensions` profiles
      // that never load extensions, so `Preferences`-only entries must not be counted as missing SW.
      const chromiumLoaded = Boolean(
        sMeta &&
          typeof sMeta === "object" &&
          Object.keys(sMeta).length > 0 &&
          Number(merged.state) === 1,
      );
      if (!chromiumLoaded) continue;

      const swVer = String(merged.swInfo?.version || "").trim();
      const hasSw = Boolean(swVer) || merged.swEvents.length > 0;
      const rawSecSwEvents = sMeta.serviceworkerevents;
      const isPoisoned =
        !hasSw &&
        ((Array.isArray(rawSecSwEvents) && rawSecSwEvents.length === 0) ||
          (Array.isArray(sMeta.disable_reasons) && sMeta.disable_reasons.length > 0));
      // Skip entries already pre-healed on disk (`serviceworkerevents` stripped) that haven't launched yet
      if (!hasSw && !isPoisoned) continue;

      const prev = perProfileBest.get(kind);
      // If a profile had an old shadow entry + active stage entry, prefer the one with active SW
      if (!prev || (hasSw && !prev.hasSw)) {
        perProfileBest.set(kind, {
          hasSw,
          swVer: swVer || (hasSw ? String(merged.manifest?.version || "").trim() : ""),
          manifestVer: String(merged.manifest?.version || "").trim(),
        });
      }
    }

    for (const [kind, record] of perProfileBest.entries()) {
      const acc = accByExt[kind];
      if (acc.sampledProfiles >= MAX_SAMPLED_PROFILES) continue;
      acc.sampledProfiles += 1;
      if (record.hasSw) {
        acc.registeredCount += 1;
        if (record.swVer && !acc.activeSwVersion) {
          acc.activeSwVersion = record.swVer;
        }
        if (!acc.expectedVersion || record.swVer === acc.expectedVersion || record.manifestVer === acc.expectedVersion) {
          acc.currentVersionCount += 1;
        } else {
          acc.outdatedVersionCount += 1;
        }
      } else {
        acc.missingSwCount += 1;
        if (acc.sampleMissingCodes.length < 5) {
          acc.sampleMissingCodes.push(item.label);
        }
      }
    }
    if (
      accByExt.e0001.sampledProfiles >= MAX_SAMPLED_PROFILES &&
      accByExt.e0002.sampledProfiles >= MAX_SAMPLED_PROFILES
    ) {
      break;
    }
  }

  const value = {
    e0001: finalizeSummary(accByExt.e0001),
    e0002: finalizeSummary(accByExt.e0002),
  };
  _swHealthCache = { key: cacheKey, at: now, value };
  return value;
}

function formatSwHealthShortBadge(swHealth) {
  if (!swHealth || swHealth.sampledProfiles === 0) return "";
  if (swHealth.status === "needs-heal") {
    return ` · SW ${swHealth.missingSwCount} heal (${swHealth.registeredCount}/${swHealth.sampledProfiles})`;
  }
  return ` · SW ${swHealth.registeredCount}/${swHealth.sampledProfiles} OK`;
}

module.exports = {
  inspectMv3ServiceWorkerFleetHealth,
  invalidateExtensionSwHealthCache,
  formatSwHealthShortBadge,
  isExcludedFleetSampleCode,
};
