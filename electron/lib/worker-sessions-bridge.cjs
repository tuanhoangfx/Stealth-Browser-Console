"use strict";
/**
 * Non-blocking bridge to query & merge active headless sessions from the
 * standalone Agent Worker Daemon (`:6004`) into the Desktop UI (`:6003`).
 */
const http = require("node:http");

const WORKER_HOST = "127.0.0.1";
const DEFAULT_WORKER_PORT = Number(process.env.STEALTH_AGENT_WORKER_PORT || 6004);
const CACHE_TTL_MS = 1200;
const STALE_EXPIRE_MS = 15_000;
const REQUEST_TIMEOUT_MS = 450;

let _cache = {
  sessions: [],
  fetchedAt: 0,
  inFlight: null,
};

function isWorkerSessionsBridgeEnabled() {
  if (process.env.STEALTH_AGENT_WORKER === "1") return false;
  if (process.env.STEALTH_DISABLE_WORKER_SESSIONS_BRIDGE === "1") return false;
  if (process.env.NODE_TEST_CONTEXT && process.env.STEALTH_ENABLE_WORKER_SESSIONS_BRIDGE_IN_TEST !== "1") {
    return false;
  }
  return true;
}

function fetchWorkerSessionsHttp(port = DEFAULT_WORKER_PORT, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: WORKER_HOST,
        port,
        path: "/api/sessions/running?localOnly=1",
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            resolve([]);
            return;
          }
          try {
            const parsed = JSON.parse(raw);
            resolve(Array.isArray(parsed?.sessions) ? parsed.sessions : []);
          } catch {
            resolve([]);
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve([]);
    });
    req.on("error", () => {
      resolve([]);
    });
    req.end();
  });
}

async function refreshWorkerSessionsSnapshot({ force = false, port = DEFAULT_WORKER_PORT, fetcher } = {}) {
  if (!isWorkerSessionsBridgeEnabled() && typeof fetcher !== "function") {
    return [];
  }
  const now = Date.now();
  if (!force && _cache.fetchedAt > 0 && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.sessions;
  }
  if (_cache.inFlight) {
    return _cache.inFlight;
  }
  const runFetch = typeof fetcher === "function" ? fetcher : () => fetchWorkerSessionsHttp(port);
  _cache.inFlight = Promise.resolve()
    .then(() => runFetch())
    .then((rows) => {
      const normalized = Array.isArray(rows)
        ? rows.map((row) => ({ ...row, workerPort: port, remoteWorker: true }))
        : [];
      _cache.sessions = normalized;
      _cache.fetchedAt = Date.now();
      return normalized;
    })
    .catch(() => _cache.sessions)
    .finally(() => {
      _cache.inFlight = null;
    });
  return _cache.inFlight;
}

function getCachedWorkerSessions({ triggerRefresh = true, port = DEFAULT_WORKER_PORT } = {}) {
  if (!isWorkerSessionsBridgeEnabled()) return [];
  const now = Date.now();
  if (triggerRefresh && now - _cache.fetchedAt >= CACHE_TTL_MS && !_cache.inFlight) {
    void refreshWorkerSessionsSnapshot({ port });
  }
  if (_cache.fetchedAt > 0 && now - _cache.fetchedAt <= STALE_EXPIRE_MS) {
    return _cache.sessions;
  }
  return [];
}

/**
 * Merge local `:6003` sessions with `:6004` worker sessions.
 * Local `:6003` headed sessions always win over remote `:6004` entries for the same id;
 * remote non-headless duplicates discovered via sidecars on `:6004` are ignored unless
 * explicitly `headless: true` or `shadowLane: true`.
 */
function mergeLocalAndWorkerSessions(localSessions = [], workerSessions = []) {
  const merged = new Map();
  for (const row of Array.isArray(localSessions) ? localSessions : []) {
    const id = String(row?.id || row?.profileId || "").trim();
    if (!id) continue;
    merged.set(id, row);
  }
  for (const row of Array.isArray(workerSessions) ? workerSessions : []) {
    const id = String(row?.id || row?.profileId || "").trim();
    if (!id) continue;
    if (merged.has(id)) continue;
    if (row?.headless !== true && row?.shadowLane !== true) continue;
    merged.set(id, { ...row, headless: true, remoteWorker: true });
  }
  return [...merged.values()];
}

function _resetWorkerSessionsBridgeCacheForTest() {
  _cache = { sessions: [], fetchedAt: 0, inFlight: null };
}

module.exports = {
  DEFAULT_WORKER_PORT,
  isWorkerSessionsBridgeEnabled,
  refreshWorkerSessionsSnapshot,
  getCachedWorkerSessions,
  mergeLocalAndWorkerSessions,
  _resetWorkerSessionsBridgeCacheForTest,
};
