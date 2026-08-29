const fs = require("node:fs");
const path = require("node:path");

/** @type {string} */
let pendingShutdownReason = "unknown";

/** @type {Record<string, unknown>} */
let pendingShutdownDetails = {};

const LOG_DIR = "logs";
const LOG_FILE = "shutdown.jsonl";
const MAX_BYTES = 512 * 1024;

function setShutdownReason(reason) {
  if (typeof reason === "string" && reason.trim()) {
    pendingShutdownReason = reason.trim();
  }
}

function setShutdownDetails(details = {}) {
  if (!details || typeof details !== "object") return;
  pendingShutdownDetails = { ...pendingShutdownDetails, ...details };
}

function consumeShutdownReason() {
  const reason = pendingShutdownReason;
  pendingShutdownReason = "unknown";
  return reason;
}

function consumeShutdownDetails() {
  const details = pendingShutdownDetails;
  pendingShutdownDetails = {};
  return details;
}

function logPath(userDataRoot) {
  return path.join(userDataRoot, LOG_DIR, LOG_FILE);
}

function ensureLogDir(userDataRoot) {
  const dir = path.join(userDataRoot, LOG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function trimLogIfNeeded(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size <= MAX_BYTES) return;
    const keep = Math.floor(MAX_BYTES / 2);
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(keep);
    fs.readSync(fd, buf, 0, keep, stat.size - keep);
    fs.closeSync(fd);
    fs.writeFileSync(file, buf);
  } catch {
    /* best-effort */
  }
}

/** Append one JSON line — boot or shutdown diagnostics for packaged support. */
function appendLifecycleLog(userDataRoot, entry) {
  if (!userDataRoot) return;
  try {
    ensureLogDir(userDataRoot);
    const file = logPath(userDataRoot);
    const line = `${JSON.stringify({
      at: new Date().toISOString(),
      ...entry,
    })}\n`;
    fs.appendFileSync(file, line, "utf8");
    trimLogIfNeeded(file);
  } catch (error) {
    console.warn("[shutdown-log] write failed:", error instanceof Error ? error.message : error);
  }
}

function writeShutdownLog(userDataRoot, details = {}) {
  appendLifecycleLog(userDataRoot, {
    kind: "shutdown",
    reason: consumeShutdownReason(),
    ...consumeShutdownDetails(),
    ...details,
  });
}

function readLifecycleLog(userDataRoot, limit = 50) {
  if (!userDataRoot) return [];
  const lim = Math.min(200, Math.max(1, Math.floor(Number(limit) || 50)));
  try {
    const file = logPath(userDataRoot);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
    return lines.slice(-lim).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function writeBootLog(userDataRoot, details = {}) {
  appendLifecycleLog(userDataRoot, {
    kind: "boot",
    ...details,
  });
}

module.exports = {
  setShutdownReason,
  setShutdownDetails,
  consumeShutdownReason,
  consumeShutdownDetails,
  appendLifecycleLog,
  writeShutdownLog,
  writeBootLog,
  readLifecycleLog,
  logPath,
};
