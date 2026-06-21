/** Shared startup URL normalization — renderer + tests (mirror profile-service.cjs). */



import { DEFAULT_BROWSER_HOME_URL } from "./browser-home";



export { DEFAULT_BROWSER_HOME_URL };



function hostPart(raw: string): string {

  const trimmed = String(raw || "").trim().replace(/^\/+/, "");

  const slash = trimmed.indexOf("/");

  const head = slash === -1 ? trimmed : trimmed.slice(0, slash);

  const colon = head.indexOf(":");

  if (colon > 0 && !/^\d+$/.test(head.slice(colon + 1))) return head.slice(0, colon);

  return head;

}



function looksLikeUrlHost(raw: string): boolean {

  const host = hostPart(raw);

  if (!host || /\s/.test(host)) return false;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;

  if (host.includes(".")) return true;

  if (/^localhost$/i.test(host)) return true;

  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?$/.test(host);

}



function schemeForHost(raw: string): "http:" | "https:" {

  const host = hostPart(raw);

  if (/^localhost$/i.test(host)) return "http:";

  if (!host.includes(".") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return "http:";

  return "https:";

}



/** Coerce URL shapes — single-label hosts (e.g. `check`) → `http://`; domains → `https://`. */

export function coerceStartupUrlInput(value: string): string {

  const trimmed = String(value || "").trim();

  if (!trimmed) return "";

  if (trimmed.toLowerCase() === "about:blank") return "about:blank";

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) return trimmed;

  if (!looksLikeUrlHost(trimmed)) return "";

  return `${schemeForHost(trimmed)}//${trimmed.replace(/^\/+/, "")}`;

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



/** Blur helper for URL inputs — auto-prefix scheme when user omits it. */

export function formatStartupUrlOnBlur(value: string): string {

  const trimmed = String(value || "").trim();

  if (!trimmed) return "";

  return normalizeStartupUrl(trimmed) || trimmed;

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



/** Directory display label — compact host (google.com); full URL in title tooltip. */
export function formatStartupUrlDisplay(value: string): string {
  const url = resolveProfileLaunchUrl(value || "");
  if (url === "about:blank") return "about:blank";
  try {
    const parsed = new URL(url);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host;
  } catch {
    return String(url)
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "")
      .split("/")[0];
  }
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

  return "Use a URL (e.g. google.com, http://check) or leave empty for Google home.";

}

