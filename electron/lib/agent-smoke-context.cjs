"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

const agentSmokeRequestStore =
  globalThis.__p0003AgentSmokeRequestStore ||
  (globalThis.__p0003AgentSmokeRequestStore = new AsyncLocalStorage());

function truthy(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isAgentSmokeRequest() {
  const store = agentSmokeRequestStore.getStore();
  if (store && typeof store === "object") return store.agentSmoke === true;
  return store === true;
}

/**
 * Canonical single-format Agent/Daemon identifier normalizer: `agent:<slug>`
 * Preserves per-task `agent:inline-<ppid>` so concurrent IDE chat tabs do not collide and evict each other,
 * while normalizing `daemon:<name>`, `agent:<conv>:<script>`, `antigravity:<id>` into `agent:<slug>`.
 */
function normalizeAgentCallerId(rawInput) {
  const raw = String(rawInput || "").trim().toLowerCase();
  if (!raw || raw === "default-agent" || raw === "agent:default" || raw === "default" || raw === "inline") {
    return "agent:inline";
  }
  const inlinePidMatch = raw.match(/^(?:agent:|daemon:|caller:)?(inline-\d+)$/);
  if (inlinePidMatch) {
    return `agent:${inlinePidMatch[1]}`;
  }
  if (/^(?:agent:|daemon:|caller:)?inline$/.test(raw)) {
    return "agent:inline";
  }
  const parts = raw
    .replace(/^(?:agent|daemon|caller|antigravity|cursor|claude):+/, "")
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean);
  let slug = parts.length > 0 ? parts[parts.length - 1] : "inline";
  slug = slug
    .replace(/\.[cm]?[jt]sx?$/i, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!/support|chat|appeal/.test(slug)) {
    slug = slug.replace(/-p\d{4}$/, "");
  }
  if (!slug || slug === "default" || slug === "default-agent") {
    return "agent:inline";
  }
  return `agent:${slug.slice(0, 80)}`;
}

function getAgentCallerId() {
  const store = agentSmokeRequestStore.getStore();
  if (store && typeof store === "object" && store.callerId) {
    return normalizeAgentCallerId(store.callerId);
  }
  return "";
}

function runWithAgentSmokeRequest(flag, fn, callerId = "") {
  const prev = agentSmokeRequestStore.getStore();
  const prevCaller = prev && typeof prev === "object" && prev.callerId ? String(prev.callerId) : "";
  const rawEffective = String(callerId || prevCaller || "").trim();
  const effectiveCallerId = rawEffective ? normalizeAgentCallerId(rawEffective) : "";
  return agentSmokeRequestStore.run(
    { agentSmoke: Boolean(flag), callerId: effectiveCallerId },
    fn,
  );
}

/** Per-request agent smoke — API header/body without polluting interactive Electron env. */
function parseAgentSmokeFlag(req, body = {}) {
  const headers = req?.headers || {};
  const headerValue =
    headers["x-stealth-agent-smoke"] ||
    headers["x-agent-smoke"] ||
    headers["X-Stealth-Agent-Smoke"] ||
    headers["X-Agent-Smoke"];
  if (truthy(headerValue)) return true;
  if (truthy(body?.agent_smoke ?? body?.agentSmoke)) return true;
  return false;
}

/** Per-request Agent/Daemon caller identifier for enforcing the 3-profile per-caller cap. */
function parseAgentCallerId(req, body = {}) {
  const headers = req?.headers || {};
  const raw =
    headers["x-stealth-caller-id"] ||
    headers["x-agent-caller"] ||
    headers["x-daemon-id"] ||
    headers["X-Stealth-Caller-Id"] ||
    headers["X-Agent-Caller"] ||
    body?.callerId ||
    body?.agentCaller ||
    body?.daemonId ||
    "";
  const trimmed = String(raw || "").trim();
  return trimmed ? normalizeAgentCallerId(trimmed) : "";
}

module.exports = {
  isAgentSmokeRequest,
  getAgentCallerId,
  normalizeAgentCallerId,
  runWithAgentSmokeRequest,
  parseAgentSmokeFlag,
  parseAgentCallerId,
};
