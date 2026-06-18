const { DEFAULT_BROWSER_HOME_URL } = require("./browser-home.cjs");

function looksLikeUrlHost(raw) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) return true;
  if (raw.includes(".")) return true;
  if (/^localhost(?:[:/]|$)/i.test(raw)) return true;
  return false;
}

function coerceStartupUrlInput(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase() === "about:blank") return "about:blank";
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return trimmed;
  if (!looksLikeUrlHost(trimmed)) return "";
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function normalizeStartupUrl(value) {
  const raw = coerceStartupUrlInput(value);
  if (!raw) return "";
  if (raw === "about:blank") return raw;
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function resolveProfileLaunchUrl(value) {
  const normalized = normalizeStartupUrl(value);
  if (normalized === "about:blank") return normalized;
  return normalized || DEFAULT_BROWSER_HOME_URL;
}

function resolveStartupUrlSave(value, existingUrl = "") {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return resolveProfileLaunchUrl("");
  const normalized = normalizeStartupUrl(trimmed);
  if (normalized) return normalized;
  const prior = normalizeStartupUrl(existingUrl);
  return prior || DEFAULT_BROWSER_HOME_URL;
}

module.exports = {
  coerceStartupUrlInput,
  normalizeStartupUrl,
  resolveProfileLaunchUrl,
  resolveStartupUrlSave,
  DEFAULT_BROWSER_HOME_URL
};
