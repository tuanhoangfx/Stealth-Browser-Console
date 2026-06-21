const { DEFAULT_BROWSER_HOME_URL } = require("./browser-home.cjs");



function hostPart(raw) {

  const trimmed = String(raw || "").trim().replace(/^\/+/, "");

  const slash = trimmed.indexOf("/");

  const head = slash === -1 ? trimmed : trimmed.slice(0, slash);

  const colon = head.indexOf(":");

  if (colon > 0 && !/^\d+$/.test(head.slice(colon + 1))) return head.slice(0, colon);

  return head;

}



function looksLikeUrlHost(raw) {

  const host = hostPart(raw);

  if (!host || /\s/.test(host)) return false;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;

  if (host.includes(".")) return true;

  if (/^localhost$/i.test(host)) return true;

  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?$/.test(host);

}



function schemeForHost(raw) {

  const host = hostPart(raw);

  if (/^localhost$/i.test(host)) return "http:";

  if (!host.includes(".") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return "http:";

  return "https:";

}



function coerceStartupUrlInput(value) {

  const trimmed = String(value || "").trim();

  if (!trimmed) return "";

  if (trimmed.toLowerCase() === "about:blank") return "about:blank";

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return trimmed;

  if (!looksLikeUrlHost(trimmed)) return "";

  return `${schemeForHost(trimmed)}//${trimmed.replace(/^\/+/, "")}`;

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

  DEFAULT_BROWSER_HOME_URL,

};

