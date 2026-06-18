/** Shared startup URL normalization — renderer + tests (mirror profile-service.cjs). */

import { DEFAULT_BROWSER_HOME_URL } from "./browser-home";

export { DEFAULT_BROWSER_HOME_URL };

function looksLikeUrlHost(raw: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) return true;
  if (raw.includes(".")) return true;
  if (/^localhost(?:[:/]|$)/i.test(raw)) return true;
  return false;
}

/** Coerce only real URL shapes — bare keywords (e.g. "adobe") stay invalid for search. */
export function coerceStartupUrlInput(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase() === "about:blank") return "about:blank";
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return trimmed;
  if (!looksLikeUrlHost(trimmed)) return "";
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

export function normalizeStartupUrl(value: string): string {
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

/** URL used on profile launch — explicit startup or Google home. */
export function resolveProfileLaunchUrl(value: string): string {
  const normalized = normalizeStartupUrl(value);
  if (normalized === "about:blank") return normalized;
  return normalized || DEFAULT_BROWSER_HOME_URL;
}

/** Persist startup URL — empty → Google home; invalid keyword keeps previous. */
export function resolveStartupUrlSave(value: string, existingUrl = ""): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return resolveProfileLaunchUrl("");
  const normalized = normalizeStartupUrl(trimmed);
  if (normalized) return normalized;
  const prior = normalizeStartupUrl(existingUrl);
  return prior || DEFAULT_BROWSER_HOME_URL;
}

/** Directory display label — keeps full URL in title tooltip. */
export function formatStartupUrlDisplay(value: string): string {
  const url = resolveProfileLaunchUrl(value || "");
  if (url === DEFAULT_BROWSER_HOME_URL) return "Google home";
  if (url === "about:blank") return "about:blank";
  return url;
}

export function isValidStartupUrl(value: string): boolean {
  const trimmed = String(value || "").trim();
  if (!trimmed) return true;
  return Boolean(normalizeStartupUrl(trimmed));
}

export function startupUrlSaveError(value: string): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  if (normalizeStartupUrl(trimmed)) return null;
  return "Use a full URL (https://…) or leave empty for Google home. Search keywords are not saved as URLs.";
}
