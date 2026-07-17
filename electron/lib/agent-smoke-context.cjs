"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

const agentSmokeRequestStore = new AsyncLocalStorage();

function truthy(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function isAgentSmokeRequest() {
  return agentSmokeRequestStore.getStore() === true;
}

function runWithAgentSmokeRequest(flag, fn) {
  return agentSmokeRequestStore.run(Boolean(flag), fn);
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

module.exports = {
  isAgentSmokeRequest,
  runWithAgentSmokeRequest,
  parseAgentSmokeFlag,
};
