const SCRIPT_STEP_KINDS = new Set(["navigate", "wait", "click", "type", "delay", "scroll", "screenshot", "condition", "action"]);

function asObject(value, label = "payload") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

const { normalizeStartupUrl } = require("./lib/startup-url.cjs");

function validateTargetUrl(targetUrl) {
  const value = normalizeStartupUrl(String(targetUrl || "").trim());
  if (!value) throw new Error("Automation URL must be a valid URL (e.g. google.com or http://host).");
  return value;
}

function validateProfileId(id) {
  if (id === null || id === undefined) throw new Error("Missing profile id");
  const value = String(id).trim();
  if (!value) throw new Error("Missing profile id");
  return value;
}

function validateCreateProfilePayload(payload = {}) {
  const next = asObject(payload);
  next.name = String(next.name || "").trim();
  if (!next.name) throw new Error("Profile name is required.");
  if (next.proxy !== undefined) next.proxy = String(next.proxy).trim();
  if (next.note !== undefined) next.note = String(next.note).trim();
  if (next.groupId !== undefined) next.groupId = String(next.groupId).trim() || "default";
  if (next.fingerprintSeed !== undefined && Number.isFinite(Number(next.fingerprintSeed))) {
    next.fingerprintSeed = Math.floor(Number(next.fingerprintSeed));
  }
  return next;
}

const WORKFLOW_ACTIONS = new Set(["open-url", "google-form-ag-appeal"]);

function validateScriptSteps(steps) {
  if (steps === undefined) return undefined;
  if (!Array.isArray(steps)) throw new Error("steps must be an array.");
  return steps
    .filter(Boolean)
    .map((step, index) => {
      const row = asObject(step, `steps[${index}]`);
      const kind = String(row.kind || "").trim();
      if (!SCRIPT_STEP_KINDS.has(kind)) throw new Error(`Invalid step kind: ${kind || "(empty)"}`);
      return {
        kind,
        name: row.name !== undefined ? String(row.name) : undefined,
        selector: row.selector !== undefined ? String(row.selector) : undefined,
        value: row.value !== undefined ? String(row.value) : undefined,
        timeoutMs: row.timeoutMs !== undefined ? Number(row.timeoutMs) : undefined,
        enabled: row.enabled !== false
      };
    });
}

function validateOpenUrlPayload(payload = {}) {
  const next = asObject(payload);
  next.profileId = validateProfileId(next.profileId);
  next.targetUrl = validateTargetUrl(next.targetUrl);
  next.screenshot = next.screenshot !== false;
  next.closeWhenDone = Boolean(next.closeWhenDone);
  next.inspectMode = Boolean(next.inspectMode);
  if (next.workflowAction !== undefined) {
    const action = String(next.workflowAction || "").trim();
    if (!WORKFLOW_ACTIONS.has(action)) throw new Error(`Unsupported workflow action: ${action}`);
    next.workflowAction = action;
  }
  if (next.workflowId !== undefined) next.workflowId = String(next.workflowId).trim();
  next.steps = validateScriptSteps(next.steps);
  return next;
}

function validateGroupName(name) {
  const value = String(name || "").trim();
  if (!value) throw new Error("Group name is required.");
  if (value.length > 120) throw new Error("Group name is too long.");
  return value;
}

function validateRunsLimit(limit) {
  const value = Number(limit);
  if (!Number.isFinite(value) || value <= 0) return 100;
  return Math.min(500, Math.max(1, Math.floor(value)));
}

// Block SSRF + header injection on the renderer-driven 9Router proxy handler.
const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[?::1\]?)/i;
const FORBIDDEN_HEADER_RE = /^(authorization|content-length|host|cookie)$/i;
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function validateRouterRequestPayload(payload = {}) {
  const next = asObject(payload);

  const rawBase = String(next.baseUrl || "").trim().replace(/\/+$/, "");
  if (!rawBase) throw new Error("9Router baseUrl is required.");
  let parsedBase;
  try {
    parsedBase = new URL(rawBase);
  } catch {
    throw new Error("9Router baseUrl must be a valid URL.");
  }
  if (!["http:", "https:"].includes(parsedBase.protocol)) {
    throw new Error("9Router baseUrl must use http or https.");
  }
  if (PRIVATE_HOST_RE.test(parsedBase.hostname)) {
    throw new Error("9Router baseUrl must not target an internal host.");
  }

  const apiKey = String(next.apiKey || "").trim();
  if (!apiKey) throw new Error("9Router apiKey is required.");

  // Strip leading slashes and any path traversal segments before joining.
  const routePath = String(next.path || "")
    .replace(/^\/+/, "")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");

  const method = String(next.method || "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) throw new Error("Unsupported HTTP method.");

  const timeoutMs = Math.min(300_000, Math.max(1_000, Number(next.timeoutMs) || 120_000));

  // Caller-supplied headers are allowed but cannot override auth / hop-by-hop headers.
  const headers = {};
  if (next.headers && typeof next.headers === "object" && !Array.isArray(next.headers)) {
    for (const [key, value] of Object.entries(next.headers)) {
      if (FORBIDDEN_HEADER_RE.test(key)) continue;
      headers[key] = String(value);
    }
  }

  return {
    baseUrl: rawBase,
    apiKey,
    path: routePath,
    method,
    timeoutMs,
    headers,
    body: next.body
  };
}

module.exports = {
  validateTargetUrl,
  validateProfileId,
  validateCreateProfilePayload,
  validateOpenUrlPayload,
  validateGroupName,
  validateRunsLimit,
  validateRouterRequestPayload,
  SCRIPT_STEP_KINDS
};
