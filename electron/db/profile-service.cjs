const { randomInt, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { getDb, isDatabaseReady } = require("./init.cjs");
const { scheduleLastOpenedCheckpoint } = require("./last-opened-durability.cjs");

const VALID_PLATFORMS = new Set(["windows", "macos", "linux"]);
const VALID_COLOR_SCHEMES = new Set(["", "light", "dark", "no-preference"]);
const VALID_WINDOW_MODES = new Set(["host-maximized", "preset-viewport", "engine-default"]);

const { normalizeStartupUrl, coerceStartupUrlInput, resolveProfileLaunchUrl, resolveStartupUrlSave } = require("../lib/startup-url.cjs");
const { extractProfileCode } = require("../lib/profile-code.cjs");
const { normalizeProfileExtensionOverrides } = require("../lib/extension-toggles.cjs");

function parseExtensionOverridesJson(raw) {
  if (!raw) return {};
  try {
    return normalizeProfileExtensionOverrides(JSON.parse(String(raw)));
  } catch {
    return {};
  }
}

function serializeExtensionOverrides(overrides) {
  const normalized = normalizeProfileExtensionOverrides(overrides);
  if (!Object.keys(normalized).length) return null;
  return JSON.stringify(normalized);
}

function normalizeDeviceFields(input, base = {}) {
  const platform = String(input.platform ?? base.platform ?? "windows").toLowerCase();
  const colorScheme = String(input.colorScheme ?? base.colorScheme ?? "").toLowerCase();
  const windowMode = String(input.windowMode ?? base.windowMode ?? "host-maximized").toLowerCase();
  return {
    platform: VALID_PLATFORMS.has(platform) ? platform : "windows",
    timezone: String(input.timezone ?? base.timezone ?? "").trim(),
    locale: String(input.locale ?? base.locale ?? "").trim(),
    userAgent: String(input.userAgent ?? base.userAgent ?? "").trim(),
    viewportW: Math.max(0, Math.floor(Number(input.viewportW ?? base.viewportW) || 0)),
    viewportH: Math.max(0, Math.floor(Number(input.viewportH ?? base.viewportH) || 0)),
    colorScheme: VALID_COLOR_SCHEMES.has(colorScheme) ? colorScheme : "",
    devicePreset: String(input.devicePreset ?? base.devicePreset ?? "custom").trim() || "custom",
    headless: (input.headless ?? base.headless ?? false) ? 1 : 0,
    humanize: (input.humanize ?? base.humanize ?? true) ? 1 : 0,
    windowMode: VALID_WINDOW_MODES.has(windowMode) ? windowMode : "host-maximized"
  };
}

// Fingerprint seed: không gian rộng + đảm bảo duy nhất để TRÁNH va chạm fingerprint
// ở quy mô lớn (range cũ 10000–99999 chỉ có 90k giá trị → 10k profile chắc chắn trùng).
const FINGERPRINT_SEED_MIN = 1;
const FINGERPRINT_SEED_MAX = 2147483646; // < 2^31-1, an toàn cho int seed

/** Per-Database prepared statement cache — zero re-compile overhead during batch transactions. */
const STMT_CACHE = new WeakMap();

function isSqliteIndexCorruptError(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  return (
    code === "SQLITE_CORRUPT" ||
    /database disk image is malformed|missing from index|wrong # of entries in index|row \d+ missing/i.test(msg)
  );
}

function rebuildProfileSecondaryIndexes(db = isDatabaseReady() ? getDb() : null) {
  if (!db || typeof db.exec !== "function") return false;
  const map = STMT_CACHE.get(db);
  if (map) map.clear();
  db.exec(`
    DROP INDEX IF EXISTS idx_profiles_updated_at;
    DROP INDEX IF EXISTS idx_profiles_name;
    DROP INDEX IF EXISTS idx_profiles_last_opened_at;
    DROP INDEX IF EXISTS idx_profiles_group_id;
    DROP INDEX IF EXISTS idx_profiles_fingerprint_seed;
    DROP INDEX IF EXISTS idx_profiles_status;
    CREATE INDEX IF NOT EXISTS idx_profiles_group_id ON profiles(group_id);
    CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);
    CREATE INDEX IF NOT EXISTS idx_profiles_last_opened_at ON profiles(last_opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_profiles_fingerprint_seed ON profiles(fingerprint_seed);
    CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
    REINDEX;
  `);
  if (map) map.clear();
  return true;
}

const ENSURED_PERF_INDEX_DBS = new WeakSet();

function ensureProfilePerformanceIndexes() {
  if (!isDatabaseReady()) return;
  const db = getDb();
  if (!db || ENSURED_PERF_INDEX_DBS.has(db)) return;
  ENSURED_PERF_INDEX_DBS.add(db);
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles(name);
      CREATE INDEX IF NOT EXISTS idx_profiles_last_opened_at ON profiles(last_opened_at DESC);
      CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);
      CREATE INDEX IF NOT EXISTS idx_profiles_group_id ON profiles(group_id);
    `);
  } catch {
    /* ignore */
  }
}

function withAutoReindexOnCorrupt(fn) {
  if (typeof fn !== "function" || fn._autoReindexWrapped) return fn;
  const wrapped = function autoReindexWrapped(...args) {
    try {
      return fn.apply(this, args);
    } catch (err) {
      if (isSqliteIndexCorruptError(err)) {
        try {
          rebuildProfileSecondaryIndexes();
        } catch {
          throw err;
        }
        return fn.apply(this, args);
      }
      throw err;
    }
  };
  wrapped._autoReindexWrapped = true;
  return wrapped;
}

function prepareCached(sql) {
  const db = getDb();
  let map = STMT_CACHE.get(db);
  if (!map) {
    map = new Map();
    STMT_CACHE.set(db, map);
  }
  let stmt = map.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    map.set(sql, stmt);
  }
  return stmt;
}

function fingerprintSeedExists(seed) {
  return Boolean(
    prepareCached("SELECT 1 FROM profiles WHERE fingerprint_seed = ? LIMIT 1").get(Number(seed))
  );
}

/** Sinh seed ngẫu nhiên không trùng seed đã có (retry vài lần; xác suất trùng ~0). */
function generateFingerprintSeed() {
  for (let i = 0; i < 8; i += 1) {
    const seed = randomInt(FINGERPRINT_SEED_MIN, FINGERPRINT_SEED_MAX);
    if (!fingerprintSeedExists(seed)) return seed;
  }
  return randomInt(FINGERPRINT_SEED_MIN, FINGERPRINT_SEED_MAX);
}

function rowToProfile(row) {
  if (!row) return null;
  const noteStr = row.note || "";
  return {
    id: row.id,
    name: row.name,
    groupId: row.group_id,
    groupName: row.group_name || null,
    proxy: row.proxy || "",
    staticIp: Number(row.static_ip) === 1 || /\[(?:pin-proxy|static-ip)\]/i.test(noteStr),
    fingerprintSeed: row.fingerprint_seed,
    note: noteStr,
    status: row.status || "closed",
    platform: row.platform || "windows",
    timezone: row.timezone || "",
    locale: row.locale || "",
    userAgent: row.user_agent || "",
    viewportW: row.viewport_w || 0,
    viewportH: row.viewport_h || 0,
    colorScheme: row.color_scheme || "",
    devicePreset: row.device_preset || "custom",
    headless: Number(row.headless) === 1,
    humanize: row.humanize == null ? true : Number(row.humanize) === 1,
    windowMode: row.window_mode || "host-maximized",
    startupUrl: row.startup_url || "",
    extensionOverrides: parseExtensionOverridesJson(row.extension_overrides),
    lastOpenedAt: Number.isFinite(Number(row.last_opened_at)) && Number(row.last_opened_at) > 0 ? Number(row.last_opened_at) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function listProfiles() {
  const rows = getDb()
    .prepare(
      `SELECT p.*, g.name AS group_name
       FROM profiles p
       LEFT JOIN profile_groups g ON g.id = p.group_id
       ORDER BY p.updated_at DESC`
    )
    .all();
  return rows.map(rowToProfile);
}

// Pagination + filter ở tầng SQL — KHÔNG load toàn bộ 10k–50k row vào JS.
const SORTABLE = new Set([
  "updated_at",
  "created_at",
  "name",
  "last_opened_at",
  "status",
  "startup_url",
  "proxy",
  "note",
  "group_name",
]);

function resolveOrderExpr(sort) {
  const key = String(sort || "updated_at");
  if (key === "group_name") return "g.name";
  const col = SORTABLE.has(key) ? key : "updated_at";
  return `p.${col}`;
}

const { buildProfileSearchWhere } = require("../lib/directory-id-search.cjs");

function buildProxyModeCondition(mode) {
  switch (String(mode || "").toLowerCase()) {
    case "local":
      return "TRIM(COALESCE(p.proxy, '')) = ''";
    case "vpn":
      return "LOWER(TRIM(COALESCE(p.proxy, ''))) LIKE 'vpn://%'";
    case "auto_vpn":
      return "(p.status IN ('running', 'opening') AND TRIM(COALESCE(p.proxy, '')) = '' AND COALESCE(p.static_ip, 0) = 0)";
    case "custom":
      return "(TRIM(COALESCE(p.proxy, '')) <> '' AND LOWER(TRIM(COALESCE(p.proxy, ''))) NOT LIKE 'vpn://%')";
    case "static":
      return "(COALESCE(p.static_ip, 0) = 1 OR COALESCE(p.note, '') LIKE '%[pin-proxy]%' OR COALESCE(p.note, '') LIKE '%[static-ip]%')";
    default:
      return "";
  }
}

function buildProfileFilter({ search, groupId, groupIds, status, statuses, proxyMode, proxyModes } = {}) {
  const where = [];
  const params = [];
  const searchWhere = buildProfileSearchWhere(search);
  if (searchWhere) {
    where.push(searchWhere.clause);
    params.push(...searchWhere.params);
  }
  const resolvedGroupIds =
    Array.isArray(groupIds) && groupIds.length
      ? groupIds.map(String)
      : groupId
        ? [String(groupId)]
        : [];
  if (resolvedGroupIds.length) {
    where.push(`p.group_id IN (${resolvedGroupIds.map(() => "?").join(", ")})`);
    params.push(...resolvedGroupIds);
  }
  const resolvedStatuses =
    Array.isArray(statuses) && statuses.length
      ? statuses.map(String)
      : status
        ? [String(status)]
        : [];
  if (resolvedStatuses.length) {
    const needsAgentRuntimeState = resolvedStatuses.some(
      (s) => s === "waiting" || s === "headless" || s === "running" || s === "opening",
    );
    let agentState = null;
    if (needsAgentRuntimeState) {
      try {
        agentState = require("../lib/waiting-agent-profiles.cjs").collectWaitingAgentHeadlessState();
      } catch {
        agentState = null;
      }
    }
    const statusConds = [];
    for (const st of resolvedStatuses) {
      if (st === "waiting") {
        const wIds = agentState?.waitingIds || [];
        if (wIds.length > 0) {
          statusConds.push(`p.id IN (${wIds.map(() => "?").join(", ")})`);
          params.push(...wIds);
        } else {
          statusConds.push("1 = 0");
        }
      } else if (st === "headless") {
        const hIds = agentState?.runningHeadlessIds || [];
        if (hIds.length > 0) {
          statusConds.push(`p.id IN (${hIds.map(() => "?").join(", ")})`);
          params.push(...hIds);
        } else {
          statusConds.push("1 = 0");
        }
      } else if (st === "running") {
        if (agentState && !resolvedStatuses.includes("headless")) {
          const headedIds = agentState.headedRunningIds || [];
          if (headedIds.length > 0) {
            statusConds.push(`p.id IN (${headedIds.map(() => "?").join(", ")})`);
            params.push(...headedIds);
          } else {
            statusConds.push("1 = 0");
          }
        } else {
          statusConds.push("p.status = ?");
          params.push(st);
        }
      } else if (st === "opening") {
        if (agentState && resolvedStatuses.includes("running") && !resolvedStatuses.includes("headless")) {
          // Clicking KPI Running sets ["running", "opening"] — restrict strictly to User Headed sessions
          statusConds.push("1 = 0");
        } else {
          statusConds.push("p.status = ?");
          params.push(st);
        }
      } else {
        statusConds.push("p.status = ?");
        params.push(st);
      }
    }
    if (statusConds.length) {
      where.push(`(${statusConds.join(" OR ")})`);
    }
  }
  const resolvedProxyModes =
    Array.isArray(proxyModes) && proxyModes.length
      ? proxyModes.map(String)
      : proxyMode
        ? [String(proxyMode)]
        : [];
  const proxyConds = resolvedProxyModes.map(buildProxyModeCondition).filter(Boolean);
  if (proxyConds.length) {
    where.push(`(${proxyConds.join(" OR ")})`);
  }
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

/** Chỉ các profile có status active (running/opening) — dùng để reconcile, indexed, set nhỏ. */
function listActiveProfileIds() {
  return getDb()
    .prepare("SELECT id, status, updated_at FROM profiles WHERE status IN ('running', 'opening')")
    .all()
    .map((r) => ({ id: r.id, status: r.status, updatedAt: r.updated_at }));
}

function countProfiles(filter = {}) {
  const { clause, params } = buildProfileFilter(filter);
  const searchWhere = buildProfileSearchWhere(filter.search);
  const needsGroupJoin = searchWhere?.needsGroupJoin ?? false;
  const from = needsGroupJoin
    ? "FROM profiles p LEFT JOIN profile_groups g ON g.id = p.group_id"
    : "FROM profiles p";
  const row = getDb().prepare(`SELECT COUNT(*) AS c ${from} ${clause}`).get(...params);
  return Number(row?.c) || 0;
}

function enrichProfilesWithActivityLog(profiles) {
  if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > 250) {
    return profiles;
  }
  ensureEventsIndexes();
  let waitingState = null;
  try {
    waitingState = require("../lib/waiting-agent-profiles.cjs").collectWaitingAgentHeadlessState();
  } catch {
    waitingState = null;
  }
  const activityLogs = waitingState?.activityLogs || {};
  const headlessReasons = waitingState?.headlessReasons || {};
  const waitingReasons = waitingState?.waitingReasons || {};
  const nowMs = Date.now();
  const eventsByProfileId = new Map();
  const profileIds = profiles.map((p) => (p && p.id ? String(p.id) : "")).filter(Boolean);
  if (profileIds.length > 0) {
    try {
      const placeholders = profileIds.map(() => "?").join(",");
      const batchRows = prepareCached(
        `SELECT profile_id, event_type, level, message, created_at
           FROM (
             SELECT profile_id, event_type, level, message, created_at,
                    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY created_at DESC) AS rn
               FROM profile_events
              WHERE profile_id IN (${placeholders})
           )
          WHERE rn <= 5
          ORDER BY profile_id, created_at DESC`,
      ).all(...profileIds);
      for (const r of batchRows) {
        const k = String(r.profile_id || "");
        let arr = eventsByProfileId.get(k);
        if (!arr) {
          arr = [];
          eventsByProfileId.set(k, arr);
        }
        arr.push(r);
      }
    } catch {
      try {
        const eventStmt = prepareCached(
          "SELECT event_type, level, message, created_at FROM profile_events WHERE profile_id = ? ORDER BY created_at DESC LIMIT 5",
        );
        for (const pid of profileIds) {
          eventsByProfileId.set(pid, eventStmt.all(pid) || []);
        }
      } catch {
        /* ignore */
      }
    }
  }

  for (const p of profiles) {
    if (!p || !p.id) continue;
    const pid = String(p.id);
    const code = String(p.name || "").trim();
    const customEntry = (code && activityLogs[code]) || activityLogs[pid] || null;
    const hReason = headlessReasons[pid] || (code && headlessReasons[code]) || "";
    const wReason = waitingReasons[pid] || (code && waitingReasons[code]) || "";
    const recentEvents = eventsByProfileId.get(pid) || [];

    const history = [];
    const pushHist = (text, at) => {
      const clean = String(text || "").trim();
      if (!clean) return;
      if (history.some((x) => x.text === clean)) return;
      history.push({ text: clean, at: String(at || "") });
    };

    const customUpdatedMs = customEntry?.updatedAt ? Date.parse(customEntry.updatedAt) : 0;
    const customFresh = Boolean(customEntry?.text && (!customUpdatedMs || nowMs - customUpdatedMs < 4 * 3600_000));
    if (customFresh && Array.isArray(customEntry.history)) {
      for (const h of customEntry.history) {
        if (h?.text) pushHist(h.text, h.at || customEntry.updatedAt);
      }
    } else if (customFresh && customEntry?.text) {
      pushHist(customEntry.text, customEntry.updatedAt);
    }

    if (hReason) {
      pushHist(`👻 ${hReason}`, new Date(nowMs).toISOString());
    } else if (wReason) {
      pushHist(`⏳ ${wReason}`, new Date(nowMs).toISOString());
    }

    for (const ev of recentEvents) {
      if (history.length >= 5) break;
      pushHist(ev.message, ev.created_at);
    }

    let primaryLog = "";
    if (customFresh && customEntry?.text && !customEntry.text.startsWith("👻 AI Agent Headless Session")) {
      primaryLog = customEntry.text;
    } else if (hReason) {
      primaryLog = `👻 ${hReason}`;
    } else if (wReason) {
      primaryLog = `⏳ ${wReason}`;
    } else if (p.status === "running") {
      primaryLog = history[0]?.text || "🟢 Browser session active";
    } else if (history.length > 0) {
      primaryLog = history[0].text;
    } else if (p.lastChangeSummary) {
      primaryLog = p.lastChangeSummary;
    }

    if (primaryLog) {
      p.activityLog = primaryLog;
      p.activityLogHistory = history.slice(0, 5);
    }
  }
  return profiles;
}

/**
 * Trả 1 trang profile. limit mặc định 100, tối đa 50000 (catalog scale).
 * @returns {{ profiles: object[], total: number, limit: number, offset: number }}
 */
function listProfilesPage({
  limit = 100,
  offset = 0,
  search,
  groupId,
  groupIds,
  status,
  statuses,
  proxyMode,
  proxyModes,
  sort = "updated_at",
  dir = "desc",
} = {}) {
  ensureProfilePerformanceIndexes();
  const lim = Math.min(50_000, Math.max(1, Math.floor(Number(limit) || 100)));
  const off = Math.max(0, Math.floor(Number(offset) || 0));
  const orderExpr = resolveOrderExpr(sort);
  const order = String(dir).toLowerCase() === "asc" ? "ASC" : "DESC";
  const filter = { search, groupId, groupIds, status, statuses, proxyMode, proxyModes };
  const { clause, params } = buildProfileFilter(filter);
  const rows = getDb()
    .prepare(
      `SELECT p.*, g.name AS group_name
       FROM profiles p
       LEFT JOIN profile_groups g ON g.id = p.group_id
       ${clause}
       ORDER BY ${orderExpr} ${order}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, lim, off);
  const mapped = rows.map(rowToProfile);
  return {
    profiles: enrichProfilesWithActivityLog(mapped),
    total: countProfiles(filter),
    limit: lim,
    offset: off,
  };
}

// Projection nhẹ — chỉ field tối thiểu, KHÔNG JOIN, KHÔNG rowToProfile đầy đủ.
// Dùng cho API /api/profiles (all-path) và nơi chỉ cần id/name/status → nhanh hơn nhiều ở 5k+ row.
function listProfilesLite() {
  const db = getDb();
  if (_profilesLiteCache.value && _profilesLiteCache.db === db) {
    return _profilesLiteCache.value;
  }
  const rows = prepareCached("SELECT id, name, status FROM profiles ORDER BY updated_at DESC").all();
  _profilesLiteCache = { db, value: rows };
  return rows;
}

function getProfile(id) {
  const row = prepareCached(
    `SELECT p.*, g.name AS group_name
       FROM profiles p
       LEFT JOIN profile_groups g ON g.id = p.group_id
       WHERE p.id = ?`
  ).get(String(id));
  return rowToProfile(row);
}

function findProfileByName(name) {
  const matches = findProfilesByName(name);
  return matches[0] || null;
}

function findProfilesByName(name) {
  const token = String(name || "").trim();
  if (!token) return [];
  const rows = prepareCached(
    `SELECT p.*, g.name AS group_name
       FROM profiles p
       LEFT JOIN profile_groups g ON g.id = p.group_id
       WHERE p.name = ?
       ORDER BY p.updated_at DESC`,
  ).all(token);
  return rows.map(rowToProfile).filter(Boolean);
}

/** Resolve profile for launch/close/automation — tolerates stale id or numeric code tokens. */
function resolveProfileForLaunch(payload = {}) {
  const rawId = payload.id;
  if (rawId === null || rawId === undefined || String(rawId).trim() === "") return null;

  const id = String(rawId).trim();
  let profile = getProfile(id);
  if (profile) return profile;

  const nameHint = String(payload.name || "").trim();
  if (nameHint) {
    profile = findProfileByName(nameHint);
    if (profile) return profile;
  }

  if (/^\d{1,6}$/.test(id)) {
    profile = findProfileByName(id);
    if (profile) return profile;
    const padded = id.padStart(4, "0");
    if (padded !== id) {
      profile = findProfileByName(padded);
      if (profile) return profile;
    }
    const page = listProfilesPage({ search: id, limit: 5 });
    const exact = page.profiles.find((row) => {
      const code = String(row.name || "").replace(/\D/g, "");
      return code === id || code === padded || row.name === id || row.name === padded;
    });
    if (exact) return exact;
  }

  return null;
}

function sanitizeAgentPinNoteInDb(note) {
  if (typeof note !== "string") return "";
  return note
    .replace(/\[(?:pin-proxy|static-ip)\]/gi, "")
    .replace(/\[vpn:[A-Za-z]{2}\]\s*Muse US Proxy/gi, "")
    .replace(/\bMuse US Proxy\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isAgentSmokeCall(input) {
  try {
    const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");
    if (isAgentSmokeLaunch()) return true;
  } catch {
    /* ignore */
  }
  return Boolean(input?.agent_smoke || input?.agentSmoke || input?.agent_task || input?.agentTask);
}

function createProfile(input) {
  invalidateCatalogStatsCache({ full: true });
  const id = randomUUID();
  const now = new Date().toISOString();
  const { normalizeProfileNameOrThrow } = require("../lib/profile-code.cjs");
  const name = normalizeProfileNameOrThrow(input.name);
  const fingerprintSeed = Number.isFinite(Number(input.fingerprintSeed))
    ? Math.floor(Number(input.fingerprintSeed))
    : generateFingerprintSeed();
  const groupId = String(input.groupId || "default").trim() || "default";
  const device = normalizeDeviceFields(input);
  const startupUrl = resolveStartupUrlSave(input.startupUrl, "");
  const extensionOverrides = serializeExtensionOverrides(input.extensionOverrides);
  const isAgent = isAgentSmokeCall(input) && input?.allowStaticIpPin !== true;
  const staticIp = !isAgent && input.staticIp ? 1 : 0;
  const cleanedNote = isAgent ? sanitizeAgentPinNoteInDb(String(input.note || "")) : String(input.note || "").trim();

  prepareCached(
    `INSERT INTO profiles
         (id, name, group_id, proxy, static_ip, fingerprint_seed, note, status,
          platform, timezone, locale, user_agent, viewport_w, viewport_h, color_scheme, device_preset,
          headless, humanize, window_mode, startup_url, extension_overrides,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'closed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
      id,
      name,
      groupId,
      String(input.proxy || "").trim() || null,
      staticIp,
      fingerprintSeed,
      cleanedNote || null,
      device.platform,
      device.timezone || null,
      device.locale || null,
      device.userAgent || null,
      device.viewportW,
      device.viewportH,
      device.colorScheme || null,
      device.devicePreset,
      device.headless,
      device.humanize,
      device.windowMode,
      startupUrl || null,
      extensionOverrides,
      now,
      now
    );

  const proxyLabel = formatProxyAuditVal(input.proxy);
  const noteTrimmed = String(input.note || "").trim();
  const summaryParts = [];
  if (input.clonedFromName) {
    summaryParts.push(`Clone: #${String(input.clonedFromName).trim()} → #${name}`);
  } else {
    summaryParts.push(`Profile: — → #${name}`);
  }
  summaryParts.push(`Proxy: — → ${proxyLabel}`);
  if (staticIp) summaryParts.push("Static IP: Off → On");
  if (startupUrl) summaryParts.push(`Startup URL: — → ${startupUrl}`);
  if (noteTrimmed) summaryParts.push(`Note: — → ${noteTrimmed}`);
  const createSummary = summaryParts.join(" · ");
  appendProfileEvent(id, {
    eventType: input.clonedFromName ? "clone" : "create",
    level: "success",
    message: createSummary,
  });

  const created = getProfile(id);
  if (created) {
    created.lastChangeSummary = createSummary;
  }
  return created;
}

function listProfileNames() {
  return getDb()
    .prepare("SELECT name FROM profiles ORDER BY updated_at DESC")
    .all()
    .map((row) => String(row.name || "").trim())
    .filter(Boolean);
}

function normalizeBulkPad(pad) {
  const value = Math.floor(Number(pad) || 4);
  return Math.min(8, Math.max(1, value));
}

function normalizeBulkRangeValue(value, label) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) throw new Error(`${label} must be a non-negative integer.`);
  return num;
}

function buildExistingProfileIndex() {
  const exactNames = new Set();
  const numericCodes = new Set();
  for (const name of listProfileNames()) {
    exactNames.add(name);
    numericCodes.add(extractProfileCode(name));
  }
  return { exactNames, numericCodes };
}

function normalizeBulkNames(names) {
  if (!Array.isArray(names)) throw new Error("Bulk names must be an array.");
  const unique = [];
  const duplicateNames = [];
  const seen = new Set();
  for (const raw of names) {
    const name = String(raw || "").trim();
    if (!name) continue;
    if (seen.has(name)) {
      duplicateNames.push(name);
      continue;
    }
    seen.add(name);
    unique.push(name);
  }
  return { unique, duplicateNames };
}

function shouldTreatAsNumericProfileName(name) {
  return /^\d{1,4}$/.test(String(name || "").trim());
}

function createProfilesBulkByNames({ names, defaults = {} } = {}) {
  const { unique, duplicateNames } = normalizeBulkNames(names);
  const { exactNames, numericCodes } = buildExistingProfileIndex();
  const createdNames = [];
  const skippedNames = [];
  const { normalizeProfileNameOrThrow } = require("../lib/profile-code.cjs");

  const db = getDb();
  const work = () => {
    for (const raw of unique) {
      let name;
      try {
        name = normalizeProfileNameOrThrow(raw);
      } catch {
        skippedNames.push(String(raw || "").trim() || "(empty)");
        continue;
      }
      if (exactNames.has(name) || numericCodes.has(name)) {
        skippedNames.push(name);
        continue;
      }
      createProfile({ ...defaults, name });
      createdNames.push(name);
      exactNames.add(name);
      numericCodes.add(name);
    }
  };
  const runTx = typeof db.transaction === "function" ? db.transaction(work) : work;
  runTx();

  return {
    requested: unique.length,
    created: createdNames.length,
    skippedExisting: skippedNames.length,
    duplicateInput: duplicateNames.length,
    createdNames,
    skippedNames,
    duplicateNames,
  };
}

function createProfilesBulkByRange({ start, end, pad = 4, defaults = {} } = {}) {
  const { PROFILE_CODE_MAX } = require("../lib/profile-code.cjs");
  const resolvedPad = 4; // Profile codes are always 0000–9999
  void pad;
  const resolvedStart = normalizeBulkRangeValue(start, "Range start");
  const resolvedEnd = normalizeBulkRangeValue(end, "Range end");
  if (resolvedStart > resolvedEnd) throw new Error("Range start must be less than or equal to range end.");
  if (resolvedEnd > PROFILE_CODE_MAX) {
    throw new Error(`Range end must be <= ${PROFILE_CODE_MAX}.`);
  }
  const requested = resolvedEnd - resolvedStart + 1;
  if (requested > 50_000) throw new Error("Range is too large. Maximum 50,000 profiles per bulk create.");

  const { exactNames, numericCodes } = buildExistingProfileIndex();
  const createdNames = [];
  const skippedNames = [];

  const db = getDb();
  const work = () => {
    for (let value = resolvedStart; value <= resolvedEnd; value += 1) {
      const name = String(value).padStart(resolvedPad, "0");
      const code = name;
      if (exactNames.has(name) && numericCodes.has(code)) {
        skippedNames.push(name);
        continue;
      }
      if (exactNames.has(name) || numericCodes.has(code)) {
        skippedNames.push(name);
        continue;
      }
      createProfile({ ...defaults, name });
      createdNames.push(name);
      exactNames.add(name);
      numericCodes.add(code);
    }
  };
  const runTx = typeof db.transaction === "function" ? db.transaction(work) : work;
  runTx();

  return {
    requested,
    created: createdNames.length,
    skippedExisting: skippedNames.length,
    duplicateInput: 0,
    createdNames,
    skippedNames,
    duplicateNames: [],
  };
}

// Đổi riêng status — tránh chi phí normalize + double-SELECT của updateProfile.
// Dùng cho session lifecycle (opening/running/closed/failed) chạy rất thường xuyên.
const PROFILE_STATUS_EVENT = {
  opening: { eventType: "opening", level: "info", message: "Profile is opening…" },
  running: { eventType: "launch", level: "success", message: "Profile launched" },
  closed: { eventType: "close", level: "info", message: "Profile closed" },
  failed: { eventType: "failed", level: "error", message: "Profile session failed" },
};

function appendProfileEvent(profileId, { eventType, level = "info", message = "" } = {}) {
  if (!isDatabaseReady()) return null;
  const id = randomUUID();
  const now = new Date().toISOString();
  prepareCached(
    `INSERT INTO profile_events (id, profile_id, event_type, level, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    String(profileId),
    String(eventType || "event"),
    String(level || "info"),
    String(message || ""),
    now,
  );
  return { id, profileId: String(profileId), eventType, level, message, createdAt: now };
}

function readFastProfileCookieAndProxyTelemetry(profileId, profileRow) {
  let cookieSummary = "🍪 Cookie Guard Ready";
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    const { resolveProfilesRoot } = require("../lib/profiles-location.cjs");
    const profilesRoot = resolveProfilesRoot("D:\\StealthBrowser");
    const pDir = path.join(profilesRoot, String(profileId || ""));
    const metaPath = path.join(pDir, "Default", "Network", "Cookies.guard-meta.json");
    const slotManifestPath = path.join(pDir, ".stealth-backup", "slot-latest", "manifest.json");
    const ckPath = path.join(pDir, "Default", "Network", "Cookies");
    let meta = null;
    if (fs.existsSync(metaPath)) {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    } else if (fs.existsSync(slotManifestPath)) {
      meta = JSON.parse(fs.readFileSync(slotManifestPath, "utf8"));
    }
    if (meta && Number(meta.totalRows) > 0) {
      const auths = [];
      if (meta.hasGoogleAuth) auths.push("Google");
      if (meta.hasOutlookAuth) auths.push("Outlook");
      if (meta.hasFacebookAuth) auths.push("FB");
      if (meta.hasTikTokAuth) auths.push("TikTok");
      const authTag = auths.length > 0 ? ` (${auths.join("+")})` : "";
      cookieSummary = `🍪 ${Number(meta.totalRows)} cookies${authTag}`;
    } else if (fs.existsSync(ckPath)) {
      const kb = Math.max(1, Math.round(fs.statSync(ckPath).size / 1024));
      cookieSummary = `🍪 SQLite (${kb} KB)`;
    }
  } catch {
    /* ignore */
  }
  const rawProxy = String(profileRow?.proxy || "").trim();
  const rawNote = String(profileRow?.note || "").trim();
  const vpnMatch = rawNote.match(/\[vpn:([A-Za-z]{2})\]/i) || rawProxy.match(/^country:\/\/([A-Za-z]{2})/i);
  let proxySummary = "🏠 Local IP";
  if (vpnMatch) {
    proxySummary = `🛡️ VPN ${vpnMatch[1].toUpperCase()}${rawProxy && !rawProxy.startsWith("country://") ? ` (${rawProxy})` : ""}`;
  } else if (rawProxy) {
    proxySummary = `🛡️ ${rawProxy}`;
  }
  return { cookieSummary, proxySummary };
}

function formatProfileStatusMessage(status, reason, telemetry) {
  const key = String(status || "");
  const preset = PROFILE_STATUS_EVENT[key];
  if (!preset) return "";
  const base = preset.message;
  const detail = String(reason || "").trim();
  const suffix = detail && detail !== key ? ` (${detail})` : "";
  if (telemetry && key === "running") {
    return `${base}${suffix} → ${telemetry.cookieSummary} · ${telemetry.proxySummary} · 🧩 E0001+E0002`;
  }
  if (telemetry && key === "closed") {
    return `${base}${suffix} → ${telemetry.cookieSummary} flushed · ${telemetry.proxySummary}`;
  }
  return `${base}${suffix}`;
}

function appendProfileStatusEvent(profileId, status, { reason, prevRow } = {}) {
  const key = String(status || "");
  // L1 lock: suppress pure "opening" transitional state-flip noise from profile_events
  if (key === "opening") return null;
  const preset = PROFILE_STATUS_EVENT[key];
  if (!preset) return null;
  const telemetry =
    key === "running" || key === "closed"
      ? readFastProfileCookieAndProxyTelemetry(profileId, prevRow)
      : null;
  return appendProfileEvent(profileId, {
    ...preset,
    message: formatProfileStatusMessage(key, reason, telemetry) || preset.message,
  });
}

function enrichAndDedupeProfileEventRows(rows, fallbackProfileName = "Profile") {
  const recentHeadlessMap = globalThis.__STEALTH_RECENT_HEADLESS_PROFILE_IDS__;
  const out = [];
  for (const row of rows) {
    const pid = String(row.profile_id || "");
    const pName = row.profile_name || fallbackProfileName || pid || "Profile";
    const evType = String(row.event_type || "");
    let msg = String(row.message || "");
    const createdAt = String(row.created_at || "");
    const createdMs = Date.parse(createdAt) || 0;

    // L1 lock: skip historical "opening" transitional events
    if (
      evType === "opening" ||
      /^(?:profile is opening|opening browser)/i.test(msg.trim()) ||
      /status:\s*[^\n]*→\s*opening/i.test(msg)
    ) {
      continue;
    }

    // Deduplicate consecutive identical lifecycle status events for the same profile within 5 seconds
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.profileId === pid &&
      prev.eventType === evType &&
      (evType === "close" || evType === "launch" || evType === "opening" || evType === "failed") &&
      Math.abs((Date.parse(prev.createdAt) || 0) - createdMs) <= 5000
    ) {
      continue;
    }

    // Enrich legacy launch/close messages that lacked L1 Cookie/Proxy telemetry
    if ((evType === "launch" || evType === "close") && !msg.includes("→")) {
      const telemetry = readFastProfileCookieAndProxyTelemetry(pid, null);
      if (evType === "launch") {
        msg = `${msg} → ${telemetry.cookieSummary} · ${telemetry.proxySummary} · 🧩 E0001+E0002`;
      } else {
        msg = `${msg} → ${telemetry.cookieSummary} flushed · ${telemetry.proxySummary}`;
      }
    }

    const alreadyTagged =
      /headless|👻|by agent|by system/i.test(msg);
    if (!alreadyTagged) {
      const isSystemReason = /\((?:reconcile|watchdog|opening-stale|startup-reconciled)\)/i.test(msg);
      const isRecentHeadless = Boolean(
        (recentHeadlessMap instanceof Map && recentHeadlessMap.has(pid)) ||
          row.latest_workflow === "headless-launch" ||
          /^9\d{3}$/.test(String(pName)),
      );
      if (isSystemReason) {
        msg = `${msg} · by System`;
      } else if (
        evType === "geo-sync" ||
        msg.includes("http://127.0.0.1:") ||
        (isRecentHeadless &&
          (evType === "opening" ||
            evType === "launch" ||
            evType === "close" ||
            evType === "failed" ||
            evType === "save")) ||
        (/\((?:profile_close|context-closed|disconnected)\)/i.test(msg) && isRecentHeadless)
      ) {
        msg = `${msg} (👻 Headless · by Agent)`;
      }
    }

    out.push({
      id: row.id,
      profileId: pid,
      profileName: pName,
      eventType: evType,
      level: row.level || "info",
      message: msg,
      createdAt,
    });
  }
  return out;
}

function listProfileEvents(profileId, limit = 100, offset = 0) {
  ensureEventsIndexes();
  const raw = String(profileId || "").trim();
  const resolved = raw ? getProfile(raw) || findProfileByName(raw) : null;
  const targetId = resolved?.id ? String(resolved.id) : raw;
  const profileName = resolved?.name || raw || "Profile";
  const lim = Math.min(500, Math.max(1, Number(limit) || 100));
  const off = Math.max(0, Math.floor(Number(offset) || 0));
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.profile_id, e.event_type, e.level, e.message, e.created_at,
              (SELECT r.workflow FROM runs r WHERE r.profile_id = e.profile_id ORDER BY COALESCE(r.finished_at, r.started_at) DESC LIMIT 1) AS latest_workflow
       FROM profile_events e
       WHERE e.profile_id = ? OR e.profile_id = ?
       ORDER BY e.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(targetId, profileName, lim, off);

  return enrichAndDedupeProfileEventRows(rows, profileName);
}

const PROFILE_EVENTS_RETENTION_DAYS = 365;
let prunedOldEventsThisSession = false;
let ensuredEventsIndexThisSession = false;

function ensureEventsIndexes() {
  if (ensuredEventsIndexThisSession || !isDatabaseReady()) return;
  ensuredEventsIndexThisSession = true;
  try {
    const { ensureProfileEventsNoForeignKey } = require("./init.cjs");
    if (typeof ensureProfileEventsNoForeignKey === "function") {
      ensureProfileEventsNoForeignKey(getDb());
    }
    getDb().exec(`
      CREATE INDEX IF NOT EXISTS idx_profile_events_created_at ON profile_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_profile_events_profile_created ON profile_events(profile_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_runs_profile_started ON runs(profile_id, started_at DESC);
    `);
  } catch {
    /* ignore */
  }
}

function pruneOldProfileEvents(retentionDays = PROFILE_EVENTS_RETENTION_DAYS) {
  if (!isDatabaseReady()) return { deletedEvents: 0, deletedRuns: 0 };
  ensureEventsIndexes();
  const days = Math.max(30, Math.floor(Number(retentionDays) || PROFILE_EVENTS_RETENTION_DAYS));
  const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString();
  const evRes = getDb()
    .prepare("DELETE FROM profile_events WHERE created_at < ?")
    .run(cutoffIso);
  const runRes = getDb()
    .prepare("DELETE FROM runs WHERE COALESCE(finished_at, started_at, '') != '' AND COALESCE(finished_at, started_at) < ?")
    .run(cutoffIso);
  return {
    deletedEvents: Number(evRes?.changes) || 0,
    deletedRuns: Number(runRes?.changes) || 0,
    retentionDays: days,
    cutoffIso,
  };
}

function listRecentProfileEvents(limit = 200, offset = 0) {
  try {
    ensureEventsIndexes();
    backfillProfileEvents();
    if (!prunedOldEventsThisSession) {
      prunedOldEventsThisSession = true;
      pruneOldProfileEvents(PROFILE_EVENTS_RETENTION_DAYS);
    }
  } catch {
    /* ignore backfill / prune error */
  }
  const lim = Math.min(500, Math.max(1, Number(limit) || 200));
  const off = Math.max(0, Math.floor(Number(offset) || 0));
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.profile_id, e.event_type, e.level, e.message, e.created_at, p.name AS profile_name,
              (SELECT r.workflow FROM runs r WHERE r.profile_id = e.profile_id ORDER BY COALESCE(r.finished_at, r.started_at) DESC LIMIT 1) AS latest_workflow
       FROM profile_events e
       LEFT JOIN profiles p ON p.id = e.profile_id
       ORDER BY e.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(lim, off);

  return enrichAndDedupeProfileEventRows(rows, "Profile");
}

/** One-time seed profile_events from last_opened_at + runs for legacy catalogs. */
function backfillProfileEvents() {
  if (!isDatabaseReady()) return;
  const flag = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get("profile_events_backfill_v1");
  if (flag?.value === "1") return;

  const insertEvent = getDb().prepare(
    `INSERT INTO profile_events (id, profile_id, event_type, level, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const listRunsForProfile = getDb().prepare(
    `SELECT workflow, target_url, status, started_at, finished_at, error
     FROM runs WHERE profile_id = ? ORDER BY started_at ASC`,
  );
  const profiles = getDb()
    .prepare(
      `SELECT id, last_opened_at FROM profiles p
       WHERE NOT EXISTS (SELECT 1 FROM profile_events e WHERE e.profile_id = p.id)`,
    )
    .all();

  let inserted = 0;
  for (const profile of profiles) {
    const profileId = String(profile.id || "").trim();
    if (!profileId) continue;

    const lastOpened = Number(profile.last_opened_at);
    if (Number.isFinite(lastOpened) && lastOpened > 0) {
      insertEvent.run(
        randomUUID(),
        profileId,
        "launch",
        "info",
        "Profile opened (backfilled from last opened)",
        new Date(lastOpened).toISOString(),
      );
      inserted += 1;
    }

    const runs = listRunsForProfile.all(profileId);
    for (const run of runs) {
      const parts = [run.workflow || "workflow"];
      if (run.target_url) parts.push(run.target_url);
      if (run.error) parts.push(run.error);
      const status = String(run.status || "");
      const level = status === "failed" ? "error" : status === "success" ? "success" : "info";
      const createdAt = run.finished_at || run.started_at || new Date(0).toISOString();
      insertEvent.run(randomUUID(), profileId, "workflow", level, parts.join(" · "), createdAt);
      inserted += 1;
    }
  }

  getDb()
    .prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`)
    .run("profile_events_backfill_v1", "1");
  if (inserted > 0) console.info(`[db] backfilled ${inserted} profile_events row(s)`);
}

let _catalogStatsCache = { at: 0, db: null, value: null };
let _catalogSlowAggCache = { at: 0, db: null, dayKey: "", value: null };
let _runsListCache = { at: 0, db: null, limit: 0, value: null };
let _profilesLiteCache = { db: null, value: null };
const CATALOG_STATS_TTL_MS = 1500;
const CATALOG_SLOW_AGG_TTL_MS = 15_000;
const RUNS_LIST_TTL_MS = 1500;

function invalidateCatalogStatsCache({ statusOnly = false } = {}) {
  _catalogStatsCache.at = 0;
  _catalogStatsCache.value = null;
  _runsListCache.at = 0;
  _runsListCache.value = null;
  _profilesLiteCache.value = null;
  if (!statusOnly) {
    _catalogSlowAggCache.at = 0;
    _catalogSlowAggCache.value = null;
  }
}

function setProfileStatus(id, status, { reason, headless } = {}) {
  if (!isDatabaseReady()) return null;
  const strId = String(id);
  const nextStatus = String(status);
  let prevRow = null;
  try {
    prevRow = prepareCached(
      "SELECT status, headless, name, static_ip, proxy, timezone, locale FROM profiles WHERE id = ?",
    ).get(strId);
  } catch {
    /* ignore */
  }
  if (prevRow && String(prevRow.status) === nextStatus) {
    const needsClosedReset =
      nextStatus === "closed" &&
      Number(prevRow.static_ip || 0) === 0 &&
      Boolean(prevRow.proxy || prevRow.timezone || prevRow.locale);
    if (!needsClosedReset) {
      return getProfile(id);
    }
  }
  invalidateCatalogStatsCache({ statusOnly: true });
  const now = new Date().toISOString();
  if (nextStatus === "closed") {
    prepareCached(
      `UPDATE profiles
          SET status = ?,
              proxy = CASE WHEN COALESCE(static_ip, 0) = 1 THEN proxy ELSE NULL END,
              timezone = CASE WHEN COALESCE(static_ip, 0) = 1 THEN timezone ELSE NULL END,
              locale = CASE WHEN COALESCE(static_ip, 0) = 1 THEN locale ELSE NULL END,
              updated_at = ?
        WHERE id = ?`,
    ).run("closed", now, strId);
  } else {
    prepareCached("UPDATE profiles SET status = ?, updated_at = ? WHERE id = ?").run(nextStatus, now, strId);
  }
  if (prevRow && String(prevRow.status) === nextStatus) {
    return getProfile(id);
  }
  let effectiveReason = String(reason || "").trim();
  if (!/headless|👻|by agent|by system/i.test(effectiveReason)) {
    const isSysReason = /^(?:reconcile|watchdog|opening-stale|startup-reconciled)$/i.test(effectiveReason);
    let isHeadlessOrAgent = Boolean(
      headless === true ||
        prevRow?.headless ||
        /^9\d{3}$/.test(String(prevRow?.name || "")),
    );
    if (!isHeadlessOrAgent) {
      try {
        const { isAgentSmokeLaunch } = require("../lib/agent-smoke-mode.cjs");
        const recentMap = globalThis.__STEALTH_RECENT_HEADLESS_PROFILE_IDS__;
        if (isAgentSmokeLaunch() || (recentMap instanceof Map && recentMap.has(strId))) {
          isHeadlessOrAgent = true;
        }
      } catch {
        /* ignore */
      }
    }
    if (isSysReason) {
      effectiveReason = `${effectiveReason} · by System`;
    } else if (isHeadlessOrAgent) {
      effectiveReason = effectiveReason ? `${effectiveReason} · 👻 Headless` : "👻 Headless";
    }
  }
  appendProfileStatusEvent(id, status, { reason: effectiveReason, prevRow });
  return getProfile(id);
}

/**
 * Reset any unpinned (`static_ip = 0`) closed profile back to Local IP (`proxy = NULL`, `timezone = NULL`, `locale = NULL`),
 * clear dead ephemeral loopback tunnel ports (`http://127.0.0.1:<port>`), and unpin legacy agent-pinned Muse US Proxy rows.
 */
function sweepUnpinnedClosedProfileProxies() {
  if (!isDatabaseReady()) return 0;
  const now = new Date().toISOString();
  const db = getDb();
  let changes = 0;
  try {
    const unpinMuse = db
      .prepare(
        `UPDATE profiles
            SET static_ip = 0,
                note = NULLIF(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(note, ''), '[pin-proxy] [vpn:US] Muse US Proxy', ''), '[pin-proxy]', ''), '[static-ip]', ''), 'Muse US Proxy', '')), ''),
                updated_at = ?
          WHERE note LIKE '%Muse US Proxy%'
             OR note LIKE '%[pin-proxy]%'
             OR note LIKE '%[static-ip]%'`,
      )
      .run(now);
    changes += Number(unpinMuse?.changes) || 0;
  } catch {
    /* ignore */
  }
  const res = db
    .prepare(
      `UPDATE profiles
          SET proxy = NULL,
              static_ip = CASE WHEN proxy LIKE 'http://127.0.0.1:%' THEN 0 ELSE COALESCE(static_ip, 0) END,
              timezone = NULL,
              locale = NULL,
              updated_at = ?
        WHERE status = 'closed'
          AND (
            (COALESCE(static_ip, 0) = 0 AND (
              (proxy IS NOT NULL AND TRIM(proxy) != '')
              OR (timezone IS NOT NULL AND TRIM(timezone) != '')
              OR (locale IS NOT NULL AND TRIM(locale) != '')
            ))
            OR proxy LIKE 'http://127.0.0.1:%'
          )`,
    )
    .run(now);
  changes += Number(res?.changes) || 0;
  if (changes > 0) invalidateCatalogStatsCache({ full: true });
  return changes;
}

function touchLastOpened(id) {
  if (!isDatabaseReady()) return null;
  const ts = Date.now();
  const now = new Date().toISOString();
  prepareCached("UPDATE profiles SET last_opened_at = ?, updated_at = ? WHERE id = ?").run(ts, now, String(id));
  scheduleLastOpenedCheckpoint(require("./init.cjs").checkpointDatabase);
  return getProfile(id);
}

function formatProxyAuditVal(val) {
  const s = String(val || "").trim();
  return s || "Local IP";
}

function formatTextAuditVal(val) {
  const s = String(val || "").trim();
  return s || "—";
}

const TIMEZONE_COUNTRY_HINTS = {
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Saigon": "VN",
  "Asia/Bangkok": "TH",
  "Asia/Singapore": "SG",
  "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR",
  "Asia/Taipei": "TW",
  "Asia/Hong_Kong": "HK",
  "Asia/Manila": "PH",
  "Asia/Jakarta": "ID",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Kolkata": "IN",
  "Europe/London": "GB",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Amsterdam": "NL",
  "Australia/Sydney": "AU",
  "America/Toronto": "CA",
  "America/Sao_Paulo": "BR",
};

const COUNTRY_DEFAULT_LOCALE = {
  VN: "vi-VN",
  US: "en-US",
  GB: "en-GB",
  SG: "en-SG",
  JP: "ja-JP",
  KR: "ko-KR",
  TW: "zh-TW",
  HK: "zh-HK",
  TH: "th-TH",
  DE: "de-DE",
  FR: "fr-FR",
  AU: "en-AU",
  CA: "en-CA",
};

function inferProfileGeoAuditVal(proxy, locale, timezone, note) {
  const rawProxy = String(proxy || "").trim();
  const vpnMatch = rawProxy.match(/^(?:vpn|country|surfshark|nordvpn):(?:\/\/)?([A-Za-z]{2})\b/i);
  if (vpnMatch) return vpnMatch[1].toUpperCase();
  const noteMatch = String(note || "").match(/\[(?:vpn|geo|country):([A-Za-z]{2})\]/i);
  if (noteMatch) return noteMatch[1].toUpperCase();
  const tz = String(timezone || "").trim();
  if (tz && TIMEZONE_COUNTRY_HINTS[tz]) return TIMEZONE_COUNTRY_HINTS[tz];
  if (/^America\/(?:New_York|Chicago|Denver|Los_Angeles|Phoenix)/i.test(tz)) return "US";
  const locMatch = String(locale || "").trim().match(/[-_]([A-Za-z]{2})\b/);
  if (locMatch) return locMatch[1].toUpperCase();
  return rawProxy ? "Proxy Auto" : "Auto (Local)";
}

function formatWebRtcAuditVal(proxy) {
  const rawProxy = String(proxy || "").trim();
  return rawProxy ? "Proxy Masked" : "Direct";
}

function buildProfileUpdateChangeSummary(existing, next, device) {
  const deltas = [];
  const pushDelta = (label, before, after) => {
    const b = String(before ?? "").trim() || "—";
    const a = String(after ?? "").trim() || "—";
    if (b !== a) deltas.push(`${label}: ${b} → ${a}`);
  };
  pushDelta("Name", existing.name, next.name);
  if ((existing.groupId || "default") !== (next.groupId || "default")) {
    let nextGroupName = next.groupId || "Default";
    try {
      const gRow = prepareCached("SELECT name FROM profile_groups WHERE id = ?").get(next.groupId || "default");
      if (gRow?.name) nextGroupName = gRow.name;
    } catch {
      /* ignore */
    }
    pushDelta("Group", existing.groupName || existing.groupId || "Default", nextGroupName);
  }
  pushDelta("Proxy", formatProxyAuditVal(existing.proxy), formatProxyAuditVal(next.proxy));
  pushDelta("Static IP", existing.staticIp ? "On" : "Off", next.staticIp ? "On" : "Off");
  const prevGeo = inferProfileGeoAuditVal(existing.proxy, existing.locale, existing.timezone, existing.note);
  const nextGeo = inferProfileGeoAuditVal(next.proxy, device.locale, device.timezone, next.note);
  pushDelta("Geo", prevGeo, nextGeo);
  pushDelta("Timezone", existing.timezone || "Auto", device.timezone || "Auto");
  pushDelta("Locale", existing.locale || "Auto", device.locale || "Auto");
  pushDelta("WebRTC", formatWebRtcAuditVal(existing.proxy), formatWebRtcAuditVal(next.proxy));
  pushDelta("Startup URL", formatTextAuditVal(existing.startupUrl), formatTextAuditVal(next.startupUrl));
  pushDelta("Note", formatTextAuditVal(existing.note), formatTextAuditVal(next.note));
  pushDelta("Device", existing.devicePreset || "custom", device.devicePreset || "custom");
  pushDelta("Platform", existing.platform || "windows", device.platform || "windows");
  if ((existing.colorScheme || "") !== (device.colorScheme || "")) {
    pushDelta("Color Scheme", existing.colorScheme || "Auto", device.colorScheme || "Auto");
  }
  if ((existing.windowMode || "host-maximized") !== (device.windowMode || "host-maximized")) {
    pushDelta("Window Mode", existing.windowMode || "host-maximized", device.windowMode || "host-maximized");
  }
  const prevVp = `${existing.viewportW || 0}×${existing.viewportH || 0}`;
  const nextVp = `${device.viewportW || 0}×${device.viewportH || 0}`;
  if (prevVp !== nextVp) {
    pushDelta("Viewport", prevVp === "0×0" ? "Auto" : prevVp, nextVp === "0×0" ? "Auto" : nextVp);
  }
  if ((existing.userAgent || "") !== (device.userAgent || "")) {
    pushDelta("User-Agent", existing.userAgent || "Auto", device.userAgent || "Auto");
  }
  pushDelta("Seed", String(existing.fingerprintSeed ?? ""), String(next.fingerprintSeed ?? ""));
  pushDelta("Headless", existing.headless ? "On" : "Off", Number(device.headless) === 1 ? "On" : "Off");
  const prevExt = serializeExtensionOverrides(existing.extensionOverrides);
  if (prevExt !== next.extensionOverrides) {
    pushDelta("Extensions", prevExt || "Default", next.extensionOverrides || "Default");
  }
  return deltas.join(" · ");
}

function recordProfileProxyGeoSync(idOrName, geoResult = {}) {
  if (!isDatabaseReady() || !idOrName) return null;
  const existing = getProfile(idOrName) || findProfileByName(idOrName);
  if (!existing) return null;

  const countryCode = String(geoResult.countryCode || "").trim().toUpperCase();
  const resolvedTz = String(geoResult.timezone || "").trim();
  const resolvedExitIp = String(geoResult.exitIp || "").trim();
  const resolvedLocale =
    String(geoResult.locale || "").trim() ||
    (countryCode && COUNTRY_DEFAULT_LOCALE[countryCode]) ||
    existing.locale ||
    "";

  const prevTz = String(existing.timezone || "").trim();
  const prevLocale = String(existing.locale || "").trim();
  const prevGeo = inferProfileGeoAuditVal(existing.proxy, prevLocale, prevTz, existing.note);
  const nextGeo = countryCode || inferProfileGeoAuditVal(existing.proxy, resolvedLocale, resolvedTz || prevTz, existing.note);

  const tzChanged = Boolean(resolvedTz && resolvedTz !== prevTz);
  const localeChanged = Boolean(resolvedLocale && resolvedLocale !== prevLocale);
  const geoChanged = Boolean(nextGeo && nextGeo !== prevGeo);
  const isPinnedStatic =
    existing.staticIp === true ||
    Number(existing.static_ip) === 1 ||
    /\[(?:pin-proxy|static-ip)\]/i.test(String(existing.note || ""));

  if ((tzChanged || localeChanged) && (isPinnedStatic || geoResult.manualCheck === true)) {
    const now = new Date().toISOString();
    prepareCached("UPDATE profiles SET timezone = ?, locale = ?, updated_at = ? WHERE id = ?").run(
      resolvedTz || prevTz || null,
      resolvedLocale || prevLocale || null,
      now,
      String(existing.id),
    );
  }

  const deltas = [];
  if (geoChanged || (geoResult.manualCheck && countryCode)) {
    deltas.push(`Geo: ${prevGeo} → ${nextGeo}`);
  }
  if (tzChanged || (geoResult.manualCheck && resolvedTz)) {
    deltas.push(`Timezone: ${prevTz || "Auto"} → ${resolvedTz || prevTz || "Auto"}`);
  }
  if (localeChanged) {
    deltas.push(`Locale: ${prevLocale || "Auto"} → ${resolvedLocale}`);
  }
  if (resolvedExitIp && (tzChanged || geoChanged || geoResult.manualCheck)) {
    deltas.push(`WebRTC: ${existing.proxy ? "Proxy Masked" : "Direct"} → Masked (${resolvedExitIp})`);
  }

  if (!deltas.length) {
    return { synced: false, summary: "", profile: existing };
  }

  const summary = deltas.join(" · ");
  appendProfileEvent(existing.id, {
    eventType: "geo-sync",
    level: "info",
    message: summary,
  });
  const updated = getProfile(existing.id) || existing;
  updated.lastChangeSummary = summary;
  return { synced: tzChanged || localeChanged, summary, profile: updated };
}

function buildProfileDeleteChangeSummary(existing) {
  const code = String(existing?.name || existing?.id || "Profile").replace(/^#/, "");
  const parts = [
    `Profile: #${code} → Deleted`,
    `Proxy: ${formatProxyAuditVal(existing?.proxy)} → —`,
  ];
  if (existing?.staticIp) {
    parts.push("Static IP: On → —");
  }
  const geo = inferProfileGeoAuditVal(existing?.proxy, existing?.locale, existing?.timezone, existing?.note);
  if (geo && geo !== "Auto (Local)") {
    parts.push(`Geo: ${geo} → —`);
  }
  if (existing?.timezone && String(existing.timezone).trim()) {
    parts.push(`Timezone: ${String(existing.timezone).trim()} → —`);
  }
  if (existing?.startupUrl && String(existing.startupUrl).trim()) {
    parts.push(`Startup URL: ${String(existing.startupUrl).trim()} → —`);
  }
  if (existing?.groupName && existing?.groupId && existing.groupId !== "default") {
    parts.push(`Group: ${existing.groupName} → —`);
  }
  if (existing?.note && String(existing.note).trim()) {
    parts.push(`Note: ${String(existing.note).trim()} → —`);
  }
  return parts.join(" · ");
}

function updateProfile(id, patch) {
  invalidateCatalogStatsCache({ full: true });
  const existing = getProfile(id);
  if (!existing) throw new Error("Profile not found.");
  const isAgent = isAgentSmokeCall(patch) && patch?.allowStaticIpPin !== true;
  const rawNote = patch.note !== undefined ? String(patch.note).trim() : existing.note;

  const next = {
    name:
      patch.name !== undefined
        ? require("../lib/profile-code.cjs").normalizeProfileNameOrThrow(patch.name)
        : existing.name,
    groupId: patch.groupId !== undefined ? String(patch.groupId).trim() : existing.groupId,
    proxy: patch.proxy !== undefined ? String(patch.proxy).trim() : existing.proxy,
    staticIp: isAgent
      ? patch.staticIp === false || patch.staticIp === 0 || patch.proxy !== undefined || patch.staticIp === true || patch.staticIp === 1
        ? 0
        : existing.staticIp
          ? 1
          : 0
      : patch.staticIp !== undefined
        ? patch.staticIp
          ? 1
          : 0
        : existing.staticIp
          ? 1
          : 0,
    note: isAgent ? sanitizeAgentPinNoteInDb(rawNote) : rawNote,
    startupUrl: patch.startupUrl !== undefined
      ? resolveStartupUrlSave(patch.startupUrl, existing.startupUrl)
      : existing.startupUrl,
    status: patch.status !== undefined ? String(patch.status) : existing.status,
    fingerprintSeed:
      patch.fingerprintSeed !== undefined && Number.isFinite(Number(patch.fingerprintSeed))
        ? Math.floor(Number(patch.fingerprintSeed))
        : existing.fingerprintSeed,
    extensionOverrides:
      patch.extensionOverrides !== undefined
        ? serializeExtensionOverrides(patch.extensionOverrides)
        : serializeExtensionOverrides(existing.extensionOverrides),
  };

  if (!next.name) throw new Error("Profile name is required.");
  // name already normalized when patched; existing legacy names kept until rename

  const device = normalizeDeviceFields(patch, existing);
  if (patch.proxy !== undefined && next.proxy !== String(existing.proxy || "").trim()) {
    if (patch.timezone === undefined) device.timezone = "";
    if (patch.locale === undefined) device.locale = "";
  }
  const now = new Date().toISOString();
  prepareCached(
    `UPDATE profiles
       SET name = ?, group_id = ?, proxy = ?, static_ip = ?, fingerprint_seed = ?, note = ?, status = ?,
           platform = ?, timezone = ?, locale = ?, user_agent = ?,
           viewport_w = ?, viewport_h = ?, color_scheme = ?, device_preset = ?,
           headless = ?, humanize = ?, window_mode = ?, startup_url = ?,
           extension_overrides = ?,
           updated_at = ?
       WHERE id = ?`
  ).run(
      next.name,
      next.groupId || "default",
      next.proxy || null,
      next.staticIp,
      next.fingerprintSeed,
      next.note || null,
      next.status,
      device.platform,
      device.timezone || null,
      device.locale || null,
      device.userAgent || null,
      device.viewportW,
      device.viewportH,
      device.colorScheme || null,
      device.devicePreset,
      device.headless,
      device.humanize,
      device.windowMode,
      next.startupUrl || null,
      next.extensionOverrides,
      now,
      String(id)
    );

  const patchKeys = Object.keys(patch).filter((key) => key !== "id" && key !== "lastChangeSummary");
  const statusOnly = patchKeys.length === 1 && patchKeys[0] === "status";
  let changeSummary = "";
  if (patchKeys.length > 0 && !statusOnly) {
    changeSummary =
      String(patch.lastChangeSummary || "").trim() ||
      buildProfileUpdateChangeSummary(existing, next, device) ||
      "Profile settings saved";
    appendProfileEvent(id, {
      eventType: "save",
      level: "success",
      message: changeSummary,
    });
  }

  const updated = getProfile(id);
  if (updated && changeSummary) {
    updated.lastChangeSummary = changeSummary;
  }
  return updated;
}

function deleteProfile(id) {
  invalidateCatalogStatsCache({ full: true });
  ensureEventsIndexes();
  const existing = getProfile(id);
  const code = existing ? String(existing.name || existing.id || "Profile") : "";
  if (existing && code) {
    try {
      prepareCached("UPDATE profile_events SET profile_id = ? WHERE profile_id = ?").run(code, String(existing.id));
      prepareCached("UPDATE runs SET profile_id = ? WHERE profile_id = ?").run(code, String(existing.id));
    } catch {
      /* ignore re-key errors */
    }
  }
  const result = prepareCached("DELETE FROM profiles WHERE id = ?").run(String(id));
  if (!result.changes) throw new Error("Profile not found or already deleted.");
  let deletedProfile = null;
  if (existing) {
    const deleteSummary = buildProfileDeleteChangeSummary(existing);
    appendProfileEvent(code, {
      eventType: "delete",
      level: "warn",
      message: deleteSummary,
    });
    deletedProfile = {
      id: existing.id,
      name: code,
      lastChangeSummary: deleteSummary,
    };
  }
  return {
    ok: true,
    count: 1,
    deletedProfiles: deletedProfile ? [deletedProfile] : [],
  };
}

function deleteProfiles(ids) {
  invalidateCatalogStatsCache({ full: true });
  ensureEventsIndexes();
  const db = getDb();
  const stmt = prepareCached("DELETE FROM profiles WHERE id = ?");
  const rekeyEventsStmt = prepareCached("UPDATE profile_events SET profile_id = ? WHERE profile_id = ?");
  const rekeyRunsStmt = prepareCached("UPDATE runs SET profile_id = ? WHERE profile_id = ?");
  let count = 0;
  const deletedProfiles = [];
  const runTx = db.transaction(() => {
    for (const id of ids) {
      const existing = getProfile(id);
      const code = existing ? String(existing.name || existing.id || "Profile") : "";
      if (existing && code) {
        try {
          rekeyEventsStmt.run(code, String(existing.id));
          rekeyRunsStmt.run(code, String(existing.id));
        } catch {
          /* ignore re-key errors */
        }
      }
      const result = stmt.run(String(id));
      const changed = result.changes ?? 0;
      count += changed;
      if (changed > 0 && existing) {
        const deleteSummary = buildProfileDeleteChangeSummary(existing);
        appendProfileEvent(code, {
          eventType: "delete",
          level: "warn",
          message: deleteSummary,
        });
        deletedProfiles.push({
          id: existing.id,
          name: code,
          lastChangeSummary: deleteSummary,
        });
      }
    }
  });
  runTx();
  if (ids.length > 0 && count === 0) throw new Error("No profiles were deleted.");
  return { ok: true, count, deletedProfiles };
}

function listGroups() {
  return getDb()
    .prepare("SELECT id, name, sort_order AS sortOrder FROM profile_groups ORDER BY sort_order, name")
    .all();
}

function createGroup(name) {
  const id = randomUUID();
  const label = String(name || "").trim();
  if (!label) throw new Error("Group name is required.");
  getDb().prepare("INSERT INTO profile_groups (id, name, sort_order) VALUES (?, ?, 0)").run(id, label);
  return { id, name: label, sortOrder: 0 };
}

function updateGroup(id, name) {
  const label = String(name || "").trim();
  if (!label) throw new Error("Group name is required.");
  if (String(id) === "default") throw new Error("Cannot rename the default group.");
  const result = getDb().prepare("UPDATE profile_groups SET name = ? WHERE id = ?").run(label, String(id));
  if (result.changes === 0) throw new Error("Group not found.");
  return { id: String(id), name: label };
}

function deleteGroup(id) {
  const groupId = String(id);
  if (groupId === "default") throw new Error("Cannot delete the default group.");
  const count = getDb().prepare("SELECT COUNT(*) AS c FROM profiles WHERE group_id = ?").get(groupId)?.c ?? 0;
  if (count > 0) throw new Error("Move or delete profiles in this group first.");
  const result = getDb().prepare("DELETE FROM profile_groups WHERE id = ?").run(groupId);
  if (result.changes === 0) throw new Error("Group not found.");
  return { ok: true };
}

function exportProfilesBundle() {
  return {
    version: 2,
    matchBy: "name",
    exportedAt: new Date().toISOString(),
    groups: listGroups(),
    profiles: listProfiles().map(({ status: _status, ...profile }) => profile)
  };
}

function profileRowToImportInput(row) {
  const name = String(row.name || "").trim();
  if (!name) return null;
  const input = {
    name,
    groupId: String(row.groupId || "default"),
    proxy: String(row.proxy || ""),
    note: String(row.note || ""),
    platform: row.platform,
    timezone: row.timezone,
    locale: row.locale,
    userAgent: row.userAgent,
    viewportW: row.viewportW,
    viewportH: row.viewportH,
    colorScheme: row.colorScheme,
    devicePreset: row.devicePreset,
    headless: row.headless,
    humanize: row.humanize,
    windowMode: row.windowMode,
    startupUrl: row.startupUrl,
  };
  if (Number.isFinite(Number(row.fingerprintSeed))) {
    input.fingerprintSeed = Math.floor(Number(row.fingerprintSeed));
  }
  return input;
}

function importProfilesBundle(bundle, options = {}) {
  const payload = typeof bundle === "string" ? JSON.parse(bundle) : bundle;
  if (!payload || typeof payload !== "object") throw new Error("Invalid import payload.");
  const merge = options.merge !== false;
  const matchBy = options.matchBy === "id" ? "id" : "name";
  const groups = Array.isArray(payload.groups) ? payload.groups : [];
  const profiles = Array.isArray(payload.profiles) ? payload.profiles : [];

  for (const group of groups) {
    const id = String(group.id || "").trim();
    const name = String(group.name || "").trim();
    if (!id || !name || id === "default") continue;
    const existing = getDb().prepare("SELECT id FROM profile_groups WHERE id = ?").get(id);
    if (existing) {
      getDb().prepare("UPDATE profile_groups SET name = ? WHERE id = ?").run(name, id);
    } else {
      getDb().prepare("INSERT INTO profile_groups (id, name, sort_order) VALUES (?, ?, ?)").run(
        id,
        name,
        Number(group.sortOrder) || 0
      );
    }
  }

  let imported = 0;
  let updated = 0;
  let created = 0;
  let skipped = 0;
  const skippedNames = [];

  for (const row of profiles) {
    const name = String(row.name || "").trim();
    if (!name) continue;

    let existing = null;
    if (matchBy === "name") {
      const matches = findProfilesByName(name);
      if (matches.length > 1) {
        skipped += 1;
        skippedNames.push(name);
        continue;
      }
      existing = matches[0] || null;
    } else {
      const id = String(row.id || "").trim();
      if (id) existing = getProfile(id);
    }

    if (existing && !merge) {
      skipped += 1;
      continue;
    }

    const input = profileRowToImportInput(row);
    if (!input) continue;

    if (existing) {
      updateProfile(existing.id, input);
      updated += 1;
    } else {
      createProfile(input);
      created += 1;
    }
    imported += 1;
  }

  return {
    ok: true,
    imported,
    updated,
    created,
    skipped,
    skippedNames,
    matchBy,
    groups: listGroups().length,
    profiles: listProfiles().length,
  };
}

function insertRun(run) {
  _runsListCache.at = 0;
  _runsListCache.value = null;
  const db = getDb();
  const workflow = run.workflow || "open-url";
  const isSessionLaunch = workflow === "headless-launch" || workflow === "profile-launch";
  if (isSessionLaunch && run.profileId) {
    try {
      const existing = db
        .prepare(
          `SELECT id, logs_json
           FROM runs
           WHERE profile_id = ? AND workflow = ?
           ORDER BY started_at DESC
           LIMIT 1`,
        )
        .get(run.profileId, workflow);
      if (existing?.id) {
        let prevLogs = [];
        try {
          prevLogs = JSON.parse(existing.logs_json || "[]");
          if (!Array.isArray(prevLogs)) prevLogs = [];
        } catch {
          prevLogs = [];
        }
        let nextLogs = [];
        try {
          nextLogs = JSON.parse(run.logsJson || "[]");
          if (!Array.isArray(nextLogs)) nextLogs = [];
        } catch {
          nextLogs = [];
        }
        const mergedLogs = [...prevLogs, ...nextLogs].slice(-25);
        db.prepare(
          `UPDATE runs
              SET target_url = COALESCE(@targetUrl, target_url),
                  status = @status,
                  started_at = @startedAt,
                  finished_at = @finishedAt,
                  duration_ms = @durationMs,
                  screenshot_path = COALESCE(@screenshotPath, screenshot_path),
                  error = @error,
                  logs_json = @logsJson
            WHERE id = @id`,
        ).run({
          id: existing.id,
          targetUrl: run.targetUrl || null,
          status: run.status,
          startedAt: run.startedAt || null,
          finishedAt: run.finishedAt || null,
          durationMs: run.durationMs ?? null,
          screenshotPath: run.screenshotPath || null,
          error: run.error || null,
          logsJson: JSON.stringify(mergedLogs),
        });
        return;
      }
    } catch {
      /* fall through to insert */
    }
  }
  db.prepare(
    `INSERT INTO runs (id, profile_id, workflow, target_url, status, started_at, finished_at, duration_ms, screenshot_path, error, logs_json)
     VALUES (@id, @profileId, @workflow, @targetUrl, @status, @startedAt, @finishedAt, @durationMs, @screenshotPath, @error, @logsJson)`,
  ).run({
    id: run.id,
    profileId: run.profileId,
    workflow,
    targetUrl: run.targetUrl || null,
    status: run.status,
    startedAt: run.startedAt || null,
    finishedAt: run.finishedAt || null,
    durationMs: run.durationMs ?? null,
    screenshotPath: run.screenshotPath || null,
    error: run.error || null,
    logsJson: run.logsJson || "[]",
  });
}

function listRuns(limit = 100) {
  const db = getDb();
  const nowMs = Date.now();
  const limNum = Math.max(1, Number(limit) || 100);
  if (
    _runsListCache.value &&
    _runsListCache.db === db &&
    _runsListCache.limit === limNum &&
    nowMs - _runsListCache.at < RUNS_LIST_TTL_MS
  ) {
    return _runsListCache.value;
  }
  let rows = db
    .prepare(
      `SELECT r.*, p.name AS profile_name, p.status AS profile_status
       FROM runs r
       LEFT JOIN profiles p ON p.id = r.profile_id
       ORDER BY r.started_at DESC
       LIMIT ?`,
    )
    .all(Math.min(500, Math.max(1, limNum * 3)));

  if (rows.length === 0) {
    try {
      const recentProfiles = db
        .prepare(
          `SELECT id, name, startup_url, status, headless, last_opened_at, updated_at
           FROM profiles
           WHERE (last_opened_at IS NOT NULL AND last_opened_at > 0) OR status IN ('running', 'opening')
           ORDER BY COALESCE(last_opened_at, 0) DESC, updated_at DESC
           LIMIT 25`,
        )
        .all();
      for (const p of recentProfiles) {
        const openedMs =
          Number(p.last_opened_at) > 0 ? Number(p.last_opened_at) : Date.parse(p.updated_at || "") || Date.now();
        const startedIso = new Date(openedMs).toISOString();
        const isHeadless = Boolean(Number(p.headless) === 1 || /^9\d{3}$/.test(String(p.name || "")));
        insertRun({
          id: `seed-launch-${String(p.id).slice(0, 8)}-${openedMs}`,
          profileId: p.id,
          workflow: isHeadless ? "headless-launch" : "profile-launch",
          targetUrl: p.startup_url || "about:blank",
          status: p.status === "failed" ? "failed" : "success",
          startedAt: startedIso,
          finishedAt: startedIso,
          durationMs: 420,
          screenshotPath: null,
          error: null,
          logsJson: JSON.stringify([{ level: "info", message: `Profile #${p.name} launched`, time: startedIso }]),
        });
      }
      if (recentProfiles.length > 0) {
        rows = db
          .prepare(
            `SELECT r.*, p.name AS profile_name, p.status AS profile_status
             FROM runs r
             LEFT JOIN profiles p ON p.id = r.profile_id
             ORDER BY r.started_at DESC
             LIMIT ?`,
          )
          .all(Math.min(500, Math.max(1, limit * 3)));
      }
    } catch {
      /* ignore backfill error */
    }
  }

  const consolidated = [];
  const bySessionKey = new Map();
  for (const row of rows) {
    const wf = String(row.workflow || "open-url");
    const sessionKey = `${row.profile_id || row.profile_name || "unknown"}::${wf}`;
    const rawLogsStr = String(row.logs_json || "[]");
    const existing = bySessionKey.get(sessionKey);
    if (existing) {
      const m = rawLogsStr.match(/launched/gi);
      existing.sessionCount += Math.max(1, m ? m.length : 0);
      continue;
    }
    if (consolidated.length >= limNum) continue;
    const parsedLogs = (() => {
      try {
        const arr = JSON.parse(rawLogsStr);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    })();
    const launchLogCount = parsedLogs.filter((l) => /launched/i.test(String(l?.message || ""))).length;
    const liveProfileStatus = String(row.profile_status || "closed");
    const item = {
      id: row.id,
      profileId: row.profile_id,
      profileName: row.profile_name || "Profile",
      workflow: wf,
      targetUrl: row.target_url,
      status:
        liveProfileStatus === "running" || liveProfileStatus === "opening"
          ? "running"
          : row.status,
      liveProfileStatus,
      sessionCount: Math.max(1, launchLogCount),
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: row.duration_ms,
      screenshotPath: row.screenshot_path,
      error: row.error,
      logs: parsedLogs.slice(-15),
    };
    bySessionKey.set(sessionKey, item);
    consolidated.push(item);
  }

  _runsListCache = { at: nowMs, db, limit: limNum, value: consolidated };
  return consolidated;
}

const DEMO_PROFILE_SEED = 424242;

// Proxy test profile is opt-in via env so credentials never ship in source / asar.
// Set STEALTH_SEED_PROXY_URL (e.g. http://user:pass@host:port) to auto-seed it.
// Read lazily so tests/runtime can set the env before seeding.
function seedProxyUrl() {
  return String(process.env.STEALTH_SEED_PROXY_URL || "").trim();
}

function ensureSeedProfiles() {
  if (listProfiles().length > 0) return listProfiles();

  try {
    const { listBackupCandidates } = require("../lib/catalog-backup-recovery.cjs");
    const { getDbFilePath } = require("./init.cjs");
    const dbFile = typeof getDbFilePath === "function" ? getDbFilePath() : "";
    const dataDir = dbFile ? path.dirname(dbFile) : "";
    const hasLargeBackup =
      dataDir &&
      listBackupCandidates(dataDir).some((candidate) => {
        try {
          return fs.statSync(candidate).size >= 512 * 1024;
        } catch {
          return false;
        }
      });
    if (hasLargeBackup) {
      console.error(
        "[profile-service] catalog empty but large backup exists — skip Stealth Demo seed; restart Stealth Browser Console",
      );
      return listProfiles();
    }
  } catch (error) {
    console.warn("[profile-service] backup probe before seed:", error instanceof Error ? error.message : error);
  }

  createProfile({
    name: "0000",
    note: "Auto-seeded MVP profile (code 0000) — edit or delete anytime.",
    fingerprintSeed: DEMO_PROFILE_SEED
  });
  const proxyUrl = seedProxyUrl();
  if (proxyUrl) {
    createProfile({
      name: "0001",
      note: "Auto-seeded connectivity profile from STEALTH_SEED_PROXY_URL.",
      proxy: proxyUrl,
      fingerprintSeed: 517351
    });
  }
  return listProfiles();
}

function bulkUpdateStartupUrl(ids, startupUrl) {
  invalidateCatalogStatsCache({ full: true });
  const list = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  if (!list.length) return { count: 0, profiles: [] };
  const normalized = resolveStartupUrlSave(startupUrl, "");
  const now = new Date().toISOString();
  const db = getDb();
  const stmt = prepareCached("UPDATE profiles SET startup_url = ?, updated_at = ? WHERE id = ?");
  const updatedProfiles = [];
  const runTx = db.transaction(() => {
    for (const id of list) {
      const existing = getProfile(id);
      stmt.run(normalized, now, id);
      if (existing) {
        const beforeUrl = formatTextAuditVal(existing.startupUrl);
        const afterUrl = formatTextAuditVal(normalized);
        if (beforeUrl !== afterUrl) {
          const summary = `Startup URL: ${beforeUrl} → ${afterUrl}`;
          appendProfileEvent(id, {
            eventType: "save",
            level: "success",
            message: summary,
          });
          const refreshed = getProfile(id);
          if (refreshed) {
            refreshed.lastChangeSummary = summary;
            updatedProfiles.push(refreshed);
          }
        }
      }
    }
  });
  runTx();
  return { count: list.length, startupUrl: normalized, profiles: updatedProfiles };
}

function bulkUpdateProfiles(ids, patch = {}) {
  invalidateCatalogStatsCache({ full: true });
  const list = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  const db = getDb();
  if (patch && patch.resetToDefaults === true) {
    const now = new Date().toISOString();
    const sqlBase = `
      UPDATE profiles
         SET proxy = NULL,
             static_ip = 0,
             timezone = NULL,
             locale = NULL,
             device_preset = 'custom',
             platform = 'windows',
             viewport_w = 0,
             viewport_h = 0,
             window_mode = 'host-maximized',
             color_scheme = NULL,
             user_agent = NULL,
             note = NULLIF(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(note, ''), '[pin-proxy]', ''), '[static-ip]', ''), '[vpn:US]', ''), 'Muse US Proxy', ''), 'Local IP', '')), ''),
             updated_at = ?
    `;
    if (!list.length) {
      const res = db.prepare(sqlBase).run(now);
      return { count: Number(res?.changes) || countProfiles(), profiles: [] };
    }
    const stmt = db.prepare(`${sqlBase} WHERE id = ?`);
    const updatedOnReset = [];
    const runResetTx = db.transaction(() => {
      for (const id of list) {
        const beforeRow = list.length <= 500 ? getProfile(id) : null;
        stmt.run(now, id);
        const afterRow = list.length <= 500 ? getProfile(id) : null;
        if (beforeRow && afterRow) {
          const resetSummary =
            buildProfileUpdateChangeSummary(
              beforeRow,
              {
                name: afterRow.name,
                groupId: afterRow.groupId,
                proxy: afterRow.proxy || "",
                staticIp: afterRow.staticIp ? 1 : 0,
                startupUrl: afterRow.startupUrl || "",
                note: afterRow.note || "",
                fingerprintSeed: afterRow.fingerprintSeed,
                extensionOverrides: serializeExtensionOverrides(afterRow.extensionOverrides),
              },
              {
                devicePreset: afterRow.devicePreset || "custom",
                platform: afterRow.platform || "windows",
                timezone: afterRow.timezone || "",
                locale: afterRow.locale || "",
                colorScheme: afterRow.colorScheme || "",
                windowMode: afterRow.windowMode || "host-maximized",
                viewportW: afterRow.viewportW || 0,
                viewportH: afterRow.viewportH || 0,
                userAgent: afterRow.userAgent || "",
                headless: afterRow.headless ? 1 : 0,
              },
            ) || "Reset: Custom → Defaults";
          appendProfileEvent(id, {
            eventType: "save",
            level: "success",
            message: resetSummary,
          });
          afterRow.lastChangeSummary = resetSummary;
          updatedOnReset.push(afterRow);
        }
      }
    });
    runResetTx();
    return {
      count: list.length,
      profiles: updatedOnReset.length ? updatedOnReset : list.map((id) => getProfile(id)).filter(Boolean),
    };
  }
  if (!list.length) return { count: 0, profiles: [] };
  const updated = [];
  const runTx = db.transaction(() => {
    for (const id of list) {
      const existing = getProfile(id);
      if (!existing) continue;
      let rowPatch = patch;
      if (patch && typeof patch.extensionOverrideDelta === "object" && patch.extensionOverrideDelta !== null) {
        const { key, enabled, globalDefault } = patch.extensionOverrideDelta;
        const nextOverrides = { ...(existing.extensionOverrides || {}) };
        if (Boolean(enabled) === Boolean(globalDefault)) {
          delete nextOverrides[key];
        } else {
          nextOverrides[key] = Boolean(enabled);
        }
        const { extensionOverrideDelta: _delta, ...restPatch } = patch;
        rowPatch = { ...restPatch, extensionOverrides: nextOverrides };
      }
      updated.push(updateProfile(id, rowPatch));
    }
  });
  runTx();
  return { count: updated.length, profiles: updated };
}

function cloneProfilesBatch(sourceIds, copiesPerProfile = 1, overrides = {}) {
  const list = Array.isArray(sourceIds) ? sourceIds.map(String).filter(Boolean) : [];
  const copies = Math.min(50, Math.max(1, Math.floor(Number(copiesPerProfile) || 1)));
  if (!list.length) return { created: 0, createdCodes: [], profiles: [] };

  const { exactNames, numericCodes } = buildExistingProfileIndex();
  const totalNeeded = list.length * copies;
  const freeCodes = [];
  for (let n = 1; n <= 9999 && freeCodes.length < totalNeeded; n += 1) {
    const code = String(n).padStart(4, "0");
    if (!exactNames.has(code) && !numericCodes.has(code)) {
      exactNames.add(code);
      numericCodes.add(code);
      freeCodes.push(code);
    }
  }
  if (!freeCodes.length) {
    throw new Error("No free 4-digit profile codes available (0001–9999).");
  }

  const db = getDb();
  const createdProfiles = [];
  const createdCodes = [];
  let codeIdx = 0;

  const runTx = db.transaction(() => {
    for (const sourceId of list) {
      const source = getProfile(sourceId);
      if (!source) continue;
      for (let c = 0; c < copies && codeIdx < freeCodes.length; c += 1) {
        const code = freeCodes[codeIdx++];
        const created = createProfile({
          name: code,
          clonedFromName: source.name,
          groupId: overrides.groupId !== undefined ? overrides.groupId : source.groupId || "default",
          proxy: overrides.proxy !== undefined ? overrides.proxy : source.proxy || "",
          staticIp: overrides.staticIp !== undefined ? overrides.staticIp : Boolean(source.staticIp),
          note: overrides.note !== undefined ? overrides.note : source.note || "",
          startupUrl: overrides.startupUrl !== undefined ? overrides.startupUrl : source.startupUrl || "",
          platform: overrides.platform !== undefined ? overrides.platform : source.platform,
          timezone: overrides.timezone !== undefined ? overrides.timezone : source.timezone,
          locale: overrides.locale !== undefined ? overrides.locale : source.locale,
          userAgent: overrides.userAgent !== undefined ? overrides.userAgent : source.userAgent,
          viewportW: overrides.viewportW !== undefined ? overrides.viewportW : source.viewportW,
          viewportH: overrides.viewportH !== undefined ? overrides.viewportH : source.viewportH,
          colorScheme: overrides.colorScheme !== undefined ? overrides.colorScheme : source.colorScheme,
          devicePreset: overrides.devicePreset !== undefined ? overrides.devicePreset : source.devicePreset,
          headless: overrides.headless !== undefined ? overrides.headless : source.headless,
          humanize: overrides.humanize !== undefined ? overrides.humanize : source.humanize,
          windowMode: overrides.windowMode !== undefined ? overrides.windowMode : source.windowMode,
          extensionOverrides:
            overrides.extensionOverrides !== undefined ? overrides.extensionOverrides : source.extensionOverrides,
          fingerprintSeed: generateFingerprintSeed(),
        });
        createdCodes.push(code);
        createdProfiles.push(created);
      }
    }
  });
  runTx();

  return {
    created: createdProfiles.length,
    createdCodes,
    profiles: createdProfiles,
  };
}

function getCatalogStats() {
  ensureProfilePerformanceIndexes();
  const db = getDb();
  const nowMs = Date.now();
  if (_catalogStatsCache.value && _catalogStatsCache.db === db && nowMs - _catalogStatsCache.at < CATALOG_STATS_TTL_MS) {
    return _catalogStatsCache.value;
  }
  let deferredCount = 0;
  let waitingCodes = [];
  let waitingReasons = {};
  let headlessReasons = {};
  let activityLogs = {};
  let headedRunning = undefined;
  let headlessRunning = undefined;
  try {
    const { collectWaitingAgentHeadlessState } = require("../lib/waiting-agent-profiles.cjs");
    const waitingState = collectWaitingAgentHeadlessState();
    deferredCount = waitingState.waitingCount;
    waitingCodes = waitingState.waitingCodes;
    waitingReasons = waitingState.waitingReasons || {};
    headlessReasons = waitingState.headlessReasons || {};
    activityLogs = waitingState.activityLogs || {};
    headedRunning = waitingState.headedRunningIds.length;
    headlessRunning = waitingState.runningHeadlessIds.length;
  } catch {
    /* ignore */
  }
  const now = new Date();
  const startOfDayIso = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  let slowAgg = _catalogSlowAggCache.value;
  if (
    !slowAgg ||
    _catalogSlowAggCache.db !== db ||
    _catalogSlowAggCache.dayKey !== startOfDayIso ||
    nowMs - _catalogSlowAggCache.at >= CATALOG_SLOW_AGG_TTL_MS
  ) {
    const totalRow = prepareCached("SELECT COUNT(*) AS c FROM profiles").get();
    const total = Number(totalRow?.c) || 0;
    const groupRows = prepareCached("SELECT group_id, COUNT(*) AS c FROM profiles GROUP BY group_id").all();
    const startOfWeekDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = startOfWeekDate.getDay();
    startOfWeekDate.setDate(startOfWeekDate.getDate() - ((dayOfWeek + 6) % 7));
    const startOfWeekIso = startOfWeekDate.toISOString();
    const proxyRow = prepareCached(
      `SELECT
         SUM(CASE WHEN TRIM(COALESCE(proxy, '')) = '' THEN 1 ELSE 0 END) AS local_count,
         SUM(CASE WHEN LOWER(TRIM(COALESCE(proxy, ''))) LIKE 'vpn://%' THEN 1 ELSE 0 END) AS vpn_count,
         SUM(CASE WHEN TRIM(COALESCE(proxy, '')) <> '' AND LOWER(TRIM(COALESCE(proxy, ''))) NOT LIKE 'vpn://%' THEN 1 ELSE 0 END) AS custom_count,
         SUM(CASE WHEN COALESCE(static_ip, 0) = 1 OR COALESCE(note, '') LIKE '%[pin-proxy]%' OR COALESCE(note, '') LIKE '%[static-ip]%' THEN 1 ELSE 0 END) AS static_count,
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS created_today_count,
         SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS created_week_count,
         SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) AS updated_today_count
       FROM profiles`,
    ).get(startOfDayIso, startOfWeekIso, startOfDayIso);
    const groupCounts = {};
    for (const row of groupRows) {
      const gid = String(row.group_id || "");
      if (gid) groupCounts[gid] = Number(row.c) || 0;
    }
    slowAgg = {
      total,
      groupCounts,
      createdToday: Number(proxyRow?.created_today_count) || 0,
      createdWeek: Number(proxyRow?.created_week_count) || 0,
      updatedToday: Number(proxyRow?.updated_today_count) || 0,
      local: Number(proxyRow?.local_count) || 0,
      vpn: Number(proxyRow?.vpn_count) || 0,
      custom: Number(proxyRow?.custom_count) || 0,
      static: Number(proxyRow?.static_count) || 0,
    };
    _catalogSlowAggCache = { at: nowMs, db, dayKey: startOfDayIso, value: slowAgg };
  }
  const statusRows = prepareCached("SELECT status, COUNT(*) AS c FROM profiles GROUP BY status").all();
  const autoVpnRow = prepareCached(
    `SELECT COUNT(*) AS c FROM profiles WHERE status IN ('running', 'opening') AND TRIM(COALESCE(proxy, '')) = '' AND COALESCE(static_ip, 0) = 0`,
  ).get();
  const total = slowAgg.total;
  const stats = {
    total,
    closed: 0,
    opening: 0,
    running: 0,
    failed: 0,
    headedRunning,
    headlessRunning,
    deferred: deferredCount,
    waitingCodes,
    waitingReasons,
    headlessReasons,
    activityLogs,
    createdToday: slowAgg.createdToday,
    createdWeek: slowAgg.createdWeek,
    updatedToday: slowAgg.updatedToday,
    groupCounts: { ...slowAgg.groupCounts },
    proxyCounts: {
      local: slowAgg.local,
      vpn: slowAgg.vpn,
      auto_vpn: Number(autoVpnRow?.c) || 0,
      custom: slowAgg.custom,
      static: slowAgg.static,
    },
  };
  for (const row of statusRows) {
    const key = String(row.status || "");
    const count = Number(row.c) || 0;
    if (key === "closed") stats.closed = count;
    else if (key === "opening") stats.opening = count;
    else if (key === "running") stats.running = count;
    else if (key === "failed") stats.failed = count;
  }
  const accounted = stats.closed + stats.opening + stats.running + stats.failed;
  if (accounted < total) stats.closed += total - accounted;
  else if (accounted > total) stats.closed = Math.max(0, total - stats.opening - stats.running - stats.failed);
  _catalogStatsCache = { at: nowMs, db, value: stats };
  return stats;
}

function listRecentlyOpenedProfiles(limit = 16) {
  const lim = Math.min(48, Math.max(1, Math.floor(Number(limit) || 16)));
  const rows = getDb()
    .prepare(
      `SELECT p.*, g.name AS group_name
       FROM profiles p
       LEFT JOIN profile_groups g ON g.id = p.group_id
       WHERE p.last_opened_at IS NOT NULL
         AND p.last_opened_at > 0
         AND (p.name < '9990' OR p.name > '9999')
       ORDER BY p.last_opened_at DESC
       LIMIT ?`,
    )
    .all(lim);
  return rows.map(rowToProfile);
}

module.exports = {
  listProfiles: withAutoReindexOnCorrupt(listProfiles),
  listRecentlyOpenedProfiles: withAutoReindexOnCorrupt(listRecentlyOpenedProfiles),
  listProfilesLite: withAutoReindexOnCorrupt(listProfilesLite),
  listProfilesPage: withAutoReindexOnCorrupt(listProfilesPage),
  listActiveProfileIds: withAutoReindexOnCorrupt(listActiveProfileIds),
  countProfiles: withAutoReindexOnCorrupt(countProfiles),
  getProfile: withAutoReindexOnCorrupt(getProfile),
  resolveProfileForLaunch: withAutoReindexOnCorrupt(resolveProfileForLaunch),
  findProfileByName: withAutoReindexOnCorrupt(findProfileByName),
  findProfilesByName: withAutoReindexOnCorrupt(findProfilesByName),
  createProfile: withAutoReindexOnCorrupt(createProfile),
  createProfilesBulkByNames: withAutoReindexOnCorrupt(createProfilesBulkByNames),
  createProfilesBulkByRange: withAutoReindexOnCorrupt(createProfilesBulkByRange),
  updateProfile: withAutoReindexOnCorrupt(updateProfile),
  formatProfileStatusMessage,
  setProfileStatus: withAutoReindexOnCorrupt(setProfileStatus),
  sweepUnpinnedClosedProfileProxies: withAutoReindexOnCorrupt(sweepUnpinnedClosedProfileProxies),
  generateFingerprintSeed: withAutoReindexOnCorrupt(generateFingerprintSeed),
  bulkUpdateStartupUrl: withAutoReindexOnCorrupt(bulkUpdateStartupUrl),
  bulkUpdateProfiles: withAutoReindexOnCorrupt(bulkUpdateProfiles),
  cloneProfilesBatch: withAutoReindexOnCorrupt(cloneProfilesBatch),
  touchLastOpened: withAutoReindexOnCorrupt(touchLastOpened),
  deleteProfile: withAutoReindexOnCorrupt(deleteProfile),
  deleteProfiles: withAutoReindexOnCorrupt(deleteProfiles),
  listGroups: withAutoReindexOnCorrupt(listGroups),
  createGroup: withAutoReindexOnCorrupt(createGroup),
  updateGroup: withAutoReindexOnCorrupt(updateGroup),
  deleteGroup: withAutoReindexOnCorrupt(deleteGroup),
  exportProfilesBundle: withAutoReindexOnCorrupt(exportProfilesBundle),
  importProfilesBundle: withAutoReindexOnCorrupt(importProfilesBundle),
  insertRun: withAutoReindexOnCorrupt(insertRun),
  listRuns: withAutoReindexOnCorrupt(listRuns),
  listProfileEvents: withAutoReindexOnCorrupt(listProfileEvents),
  listRecentProfileEvents: withAutoReindexOnCorrupt(listRecentProfileEvents),
  appendProfileEvent: withAutoReindexOnCorrupt(appendProfileEvent),
  recordProfileProxyGeoSync: withAutoReindexOnCorrupt(recordProfileProxyGeoSync),
  inferProfileGeoAuditVal,
  formatWebRtcAuditVal,
  buildProfileDeleteChangeSummary,
  backfillProfileEvents: withAutoReindexOnCorrupt(backfillProfileEvents),
  ensureSeedProfiles: withAutoReindexOnCorrupt(ensureSeedProfiles),
  getCatalogStats: withAutoReindexOnCorrupt(getCatalogStats),
  rebuildProfileSecondaryIndexes,
  withAutoReindexOnCorrupt,
  isSqliteIndexCorruptError,
  normalizeStartupUrl,
  resolveProfileLaunchUrl,
  DEMO_PROFILE_SEED
};
