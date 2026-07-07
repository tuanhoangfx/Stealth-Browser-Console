const { randomInt, randomUUID } = require("node:crypto");
const { getDb, isDatabaseReady, checkpointDatabase } = require("./init.cjs");

const VALID_PLATFORMS = new Set(["windows", "macos", "linux"]);
const VALID_COLOR_SCHEMES = new Set(["", "light", "dark", "no-preference"]);
const VALID_WINDOW_MODES = new Set(["host-maximized", "preset-viewport", "engine-default"]);

const { normalizeStartupUrl, coerceStartupUrlInput, resolveProfileLaunchUrl, resolveStartupUrlSave } = require("../lib/startup-url.cjs");
const { extractProfileCode } = require("../lib/profile-identity.cjs");
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

function fingerprintSeedExists(seed) {
  return Boolean(
    getDb().prepare("SELECT 1 FROM profiles WHERE fingerprint_seed = ? LIMIT 1").get(Number(seed))
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
  return {
    id: row.id,
    name: row.name,
    groupId: row.group_id,
    groupName: row.group_name || null,
    proxy: row.proxy || "",
    fingerprintSeed: row.fingerprint_seed,
    note: row.note || "",
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

function buildProfileFilter({ search, groupId, groupIds, status, statuses } = {}) {
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
    where.push(`p.status IN (${resolvedStatuses.map(() => "?").join(", ")})`);
    params.push(...resolvedStatuses);
  }
  return { clause: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

/** Chỉ các profile có status active (running/opening) — dùng để reconcile, indexed, set nhỏ. */
function listActiveProfileIds() {
  return getDb()
    .prepare("SELECT id, status FROM profiles WHERE status IN ('running', 'opening')")
    .all()
    .map((r) => ({ id: r.id, status: r.status }));
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
  sort = "updated_at",
  dir = "desc",
} = {}) {
  const lim = Math.min(50_000, Math.max(1, Math.floor(Number(limit) || 100)));
  const off = Math.max(0, Math.floor(Number(offset) || 0));
  const orderExpr = resolveOrderExpr(sort);
  const order = String(dir).toLowerCase() === "asc" ? "ASC" : "DESC";
  const filter = { search, groupId, groupIds, status, statuses };
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
  return {
    profiles: rows.map(rowToProfile),
    total: countProfiles(filter),
    limit: lim,
    offset: off,
  };
}

// Projection nhẹ — chỉ field tối thiểu, KHÔNG JOIN, KHÔNG rowToProfile đầy đủ.
// Dùng cho API /api/profiles (all-path) và nơi chỉ cần id/name/status → nhanh hơn nhiều ở 5k+ row.
function listProfilesLite() {
  return getDb()
    .prepare("SELECT id, name, status FROM profiles ORDER BY updated_at DESC")
    .all();
}

function getProfile(id) {
  const row = getDb()
    .prepare(
      `SELECT p.*, g.name AS group_name
       FROM profiles p
       LEFT JOIN profile_groups g ON g.id = p.group_id
       WHERE p.id = ?`
    )
    .get(String(id));
  return rowToProfile(row);
}

function findProfileByName(name) {
  const matches = findProfilesByName(name);
  return matches[0] || null;
}

function findProfilesByName(name) {
  const token = String(name || "").trim();
  if (!token) return [];
  const rows = getDb()
    .prepare(
      `SELECT p.*, g.name AS group_name
       FROM profiles p
       LEFT JOIN profile_groups g ON g.id = p.group_id
       WHERE p.name = ?
       ORDER BY p.updated_at DESC`,
    )
    .all(token);
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

function createProfile(input) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Profile name is required.");
  const fingerprintSeed = Number.isFinite(Number(input.fingerprintSeed))
    ? Math.floor(Number(input.fingerprintSeed))
    : generateFingerprintSeed();
  const groupId = String(input.groupId || "default").trim() || "default";
  const device = normalizeDeviceFields(input);
  const startupUrl = resolveStartupUrlSave(input.startupUrl, "");
  const extensionOverrides = serializeExtensionOverrides(input.extensionOverrides);

  getDb()
    .prepare(
      `INSERT INTO profiles
         (id, name, group_id, proxy, fingerprint_seed, note, status,
          platform, timezone, locale, user_agent, viewport_w, viewport_h, color_scheme, device_preset,
          headless, humanize, window_mode, startup_url, extension_overrides,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'closed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      name,
      groupId,
      String(input.proxy || "").trim() || null,
      fingerprintSeed,
      String(input.note || "").trim() || null,
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

  return getProfile(id);
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
  return /^\d{1,8}$/.test(String(name || "").trim());
}

function createProfilesBulkByNames({ names, defaults = {} } = {}) {
  const { unique, duplicateNames } = normalizeBulkNames(names);
  const { exactNames, numericCodes } = buildExistingProfileIndex();
  const createdNames = [];
  const skippedNames = [];

  for (const name of unique) {
    const numericCode = shouldTreatAsNumericProfileName(name) ? String(name).padStart(4, "0") : null;
    if (exactNames.has(name) || (numericCode && numericCodes.has(numericCode))) {
      skippedNames.push(name);
      continue;
    }
    createProfile({ ...defaults, name });
    createdNames.push(name);
    exactNames.add(name);
    numericCodes.add(extractProfileCode(name));
  }

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
  const resolvedPad = normalizeBulkPad(pad);
  const resolvedStart = normalizeBulkRangeValue(start, "Range start");
  const resolvedEnd = normalizeBulkRangeValue(end, "Range end");
  if (resolvedStart > resolvedEnd) throw new Error("Range start must be less than or equal to range end.");
  const requested = resolvedEnd - resolvedStart + 1;
  if (requested > 50_000) throw new Error("Range is too large. Maximum 50,000 profiles per bulk create.");

  const { exactNames, numericCodes } = buildExistingProfileIndex();
  const createdNames = [];
  const skippedNames = [];

  for (let value = resolvedStart; value <= resolvedEnd; value += 1) {
    const name = String(value).padStart(resolvedPad, "0");
    const code = String(value).padStart(4, "0");
    if (exactNames.has(name) || numericCodes.has(code)) {
      skippedNames.push(name);
      continue;
    }
    createProfile({ ...defaults, name });
    createdNames.push(name);
    exactNames.add(name);
    numericCodes.add(extractProfileCode(name));
  }

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
  getDb()
    .prepare(
      `INSERT INTO profile_events (id, profile_id, event_type, level, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      String(profileId),
      String(eventType || "event"),
      String(level || "info"),
      String(message || ""),
      now,
    );
  return { id, profileId: String(profileId), eventType, level, message, createdAt: now };
}

function appendProfileStatusEvent(profileId, status) {
  const key = String(status || "");
  const preset = PROFILE_STATUS_EVENT[key];
  if (!preset) return null;
  return appendProfileEvent(profileId, preset);
}

function listProfileEvents(profileId, limit = 100) {
  const rows = getDb()
    .prepare(
      `SELECT id, profile_id, event_type, level, message, created_at
       FROM profile_events
       WHERE profile_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(String(profileId), Math.min(500, Math.max(1, limit)));

  return rows.map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    eventType: row.event_type,
    level: row.level || "info",
    message: row.message || "",
    createdAt: row.created_at,
  }));
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

function setProfileStatus(id, status) {
  if (!isDatabaseReady()) return null;
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE profiles SET status = ?, updated_at = ? WHERE id = ?")
    .run(String(status), now, String(id));
  appendProfileStatusEvent(id, status);
  return getProfile(id);
}

function touchLastOpened(id) {
  if (!isDatabaseReady()) return null;
  const ts = Date.now();
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE profiles SET last_opened_at = ?, updated_at = ? WHERE id = ?")
    .run(ts, now, String(id));
  checkpointDatabase();
  return getProfile(id);
}

function updateProfile(id, patch) {
  const existing = getProfile(id);
  if (!existing) throw new Error("Profile not found.");

  const next = {
    name: patch.name !== undefined ? String(patch.name).trim() : existing.name,
    groupId: patch.groupId !== undefined ? String(patch.groupId).trim() : existing.groupId,
    proxy: patch.proxy !== undefined ? String(patch.proxy).trim() : existing.proxy,
    note: patch.note !== undefined ? String(patch.note).trim() : existing.note,
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

  const device = normalizeDeviceFields(patch, existing);
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE profiles
       SET name = ?, group_id = ?, proxy = ?, fingerprint_seed = ?, note = ?, status = ?,
           platform = ?, timezone = ?, locale = ?, user_agent = ?,
           viewport_w = ?, viewport_h = ?, color_scheme = ?, device_preset = ?,
           headless = ?, humanize = ?, window_mode = ?, startup_url = ?,
           extension_overrides = ?,
           updated_at = ?
       WHERE id = ?`
    )
    .run(
      next.name,
      next.groupId || "default",
      next.proxy || null,
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

  const patchKeys = Object.keys(patch).filter((key) => key !== "id");
  const statusOnly = patchKeys.length === 1 && patchKeys[0] === "status";
  if (patchKeys.length > 0 && !statusOnly) {
    appendProfileEvent(id, {
      eventType: "save",
      level: "success",
      message: "Profile settings saved",
    });
  }

  return getProfile(id);
}

function deleteProfile(id) {
  const result = getDb().prepare("DELETE FROM profiles WHERE id = ?").run(String(id));
  if (!result.changes) throw new Error("Profile not found or already deleted.");
  return { ok: true };
}

function deleteProfiles(ids) {
  const stmt = getDb().prepare("DELETE FROM profiles WHERE id = ?");
  let count = 0;
  for (const id of ids) {
    const result = stmt.run(String(id));
    count += result.changes ?? 0;
  }
  if (ids.length > 0 && count === 0) throw new Error("No profiles were deleted.");
  return { ok: true, count };
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
  getDb()
    .prepare(
      `INSERT INTO runs (id, profile_id, workflow, target_url, status, started_at, finished_at, duration_ms, screenshot_path, error, logs_json)
       VALUES (@id, @profileId, @workflow, @targetUrl, @status, @startedAt, @finishedAt, @durationMs, @screenshotPath, @error, @logsJson)`
    )
    .run({
      id: run.id,
      profileId: run.profileId,
      workflow: run.workflow || "open-url",
      targetUrl: run.targetUrl || null,
      status: run.status,
      startedAt: run.startedAt || null,
      finishedAt: run.finishedAt || null,
      durationMs: run.durationMs ?? null,
      screenshotPath: run.screenshotPath || null,
      error: run.error || null,
      logsJson: run.logsJson || "[]"
    });
}

function listRuns(limit = 100) {
  const rows = getDb()
    .prepare(
      `SELECT r.*, p.name AS profile_name
       FROM runs r
       LEFT JOIN profiles p ON p.id = r.profile_id
       ORDER BY r.started_at DESC
       LIMIT ?`
    )
    .all(Math.min(500, Math.max(1, limit)));

  return rows.map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    profileName: row.profile_name || "Profile",
    workflow: row.workflow,
    targetUrl: row.target_url,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    screenshotPath: row.screenshot_path,
    error: row.error,
    logs: JSON.parse(row.logs_json || "[]")
  }));
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
  createProfile({
    name: "Stealth Demo",
    note: "Auto-seeded MVP profile — edit or delete anytime.",
    fingerprintSeed: DEMO_PROFILE_SEED
  });
  const proxyUrl = seedProxyUrl();
  if (proxyUrl) {
    createProfile({
      name: "Proxy Test",
      note: "Auto-seeded connectivity profile from STEALTH_SEED_PROXY_URL.",
      proxy: proxyUrl,
      fingerprintSeed: 517351
    });
  }
  return listProfiles();
}

function bulkUpdateStartupUrl(ids, startupUrl) {
  const list = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  if (!list.length) return { count: 0 };
  const normalized = resolveStartupUrlSave(startupUrl, "");
  const now = new Date().toISOString();
  const stmt = getDb().prepare("UPDATE profiles SET startup_url = ?, updated_at = ? WHERE id = ?");
  for (const id of list) {
    stmt.run(normalized, now, id);
  }
  return { count: list.length, startupUrl: normalized };
}

function getCatalogStats() {
  const totalRow = getDb().prepare("SELECT COUNT(*) AS c FROM profiles").get();
  const total = Number(totalRow?.c) || 0;
  const statusRows = getDb().prepare("SELECT status, COUNT(*) AS c FROM profiles GROUP BY status").all();
  const groupRows = getDb().prepare("SELECT group_id, COUNT(*) AS c FROM profiles GROUP BY group_id").all();
  const stats = {
    total,
    closed: 0,
    opening: 0,
    running: 0,
    failed: 0,
    groupCounts: {},
  };
  for (const row of statusRows) {
    const key = String(row.status || "");
    const count = Number(row.c) || 0;
    if (key === "closed") stats.closed = count;
    else if (key === "opening") stats.opening = count;
    else if (key === "running") stats.running = count;
    else if (key === "failed") stats.failed = count;
  }
  for (const row of groupRows) {
    const gid = String(row.group_id || "");
    if (gid) stats.groupCounts[gid] = Number(row.c) || 0;
  }
  const accounted = stats.closed + stats.opening + stats.running + stats.failed;
  if (accounted < total) stats.closed += total - accounted;
  else if (accounted > total) stats.closed = Math.max(0, total - stats.opening - stats.running - stats.failed);
  return stats;
}

module.exports = {
  listProfiles,
  listProfilesLite,
  listProfilesPage,
  listActiveProfileIds,
  countProfiles,
  getProfile,
  resolveProfileForLaunch,
  findProfileByName,
  findProfilesByName,
  createProfile,
  createProfilesBulkByNames,
  createProfilesBulkByRange,
  updateProfile,
  setProfileStatus,
  generateFingerprintSeed,
  bulkUpdateStartupUrl,
  touchLastOpened,
  deleteProfile,
  deleteProfiles,
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  exportProfilesBundle,
  importProfilesBundle,
  insertRun,
  listRuns,
  listProfileEvents,
  appendProfileEvent,
  backfillProfileEvents,
  ensureSeedProfiles,
  getCatalogStats,
  normalizeStartupUrl,
  resolveProfileLaunchUrl,
  DEMO_PROFILE_SEED
};
