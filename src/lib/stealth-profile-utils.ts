export const PROXY_PRESETS = [
  { id: "local", label: "Local IP", value: "", countryCode: "" },
  { id: "proxy-vn", label: "Proxy Vietnam (VN)", value: "proxy://VN", countryCode: "VN" },
  { id: "proxy-us", label: "Proxy United States (US)", value: "proxy://US", countryCode: "US" },
  { id: "vpn-us", label: "VPN United States (US)", value: "vpn://US", countryCode: "US" },
  { id: "vpn-sg", label: "VPN Singapore (SG)", value: "vpn://SG", countryCode: "SG" },
  { id: "vpn-jp", label: "VPN Japan (JP)", value: "vpn://JP", countryCode: "JP" },
  { id: "vpn-gb", label: "VPN United Kingdom (GB)", value: "vpn://GB", countryCode: "GB" },
  { id: "vpn-de", label: "VPN Germany (DE)", value: "vpn://DE", countryCode: "DE" },
  { id: "vpn-kr", label: "VPN South Korea (KR)", value: "vpn://KR", countryCode: "KR" },
  { id: "vpn-fr", label: "VPN France (FR)", value: "vpn://FR", countryCode: "FR" },
  { id: "vpn-nl", label: "VPN Netherlands (NL)", value: "vpn://NL", countryCode: "NL" },
  { id: "vpn-ca", label: "VPN Canada (CA)", value: "vpn://CA", countryCode: "CA" },
  { id: "vpn-au", label: "VPN Australia (AU)", value: "vpn://AU", countryCode: "AU" },
  { id: "vpn-vn", label: "VPN Vietnam (VN)", value: "vpn://VN", countryCode: "VN" },
  { id: "http", label: "HTTP proxy", value: "http://user:pass@host:port", countryCode: "" },
  { id: "socks5", label: "SOCKS5 proxy", value: "socks5://user:pass@host:port", countryCode: "" }
] as const;

export const COUNTRY_DISPLAY_NAMES: Record<string, string> = {
  US: "United States (US)",
  VN: "Vietnam (VN)",
  SG: "Singapore (SG)",
  JP: "Japan (JP)",
  GB: "United Kingdom (GB)",
  DE: "Germany (DE)",
  KR: "South Korea (KR)",
  FR: "France (FR)",
  NL: "Netherlands (NL)",
  CA: "Canada (CA)",
  AU: "Australia (AU)",
  IE: "Ireland (IE)",
  PH: "Philippines (PH)",
  MY: "Malaysia (MY)",
};

/** Extract host/IP from proxy string (`host:port:user:pass` or `http://user:pass@host:port`). */
export function extractProxyHostIp(proxy?: string | null): string {
  const raw = String(proxy || "").trim();
  if (!raw || /^(?:vpn|proxy|surfshark|nordvpn|country):/i.test(raw)) return "";
  let rest = raw.replace(/^(?:https?|socks[45]?):\/\//i, "");
  if (rest.includes("@")) {
    rest = rest.split("@").pop() || "";
  }
  const host = (rest.split(":")[0] || "").trim();
  if (!host || host === "127.0.0.1" || host === "localhost") return "";
  return host;
}

const KNOWN_STATIC_PROXY_COUNTRY_PREFIXES: Array<[string, string]> = [
  ["14.190.", "VN"],
  ["160.250.", "VN"],
  ["183.80.", "VN"],
  ["171.236.", "VN"],
  ["58.186.", "VN"],
  ["180.149.", "US"],
  ["206.125.", "US"],
  ["23.95.", "US"],
  ["172.111.", "US"],
];

function isPrivateOrTestIp(host: string): boolean {
  return /^(?:10\.|192\.168\.|127\.|172\.(?:1[6-9]|2\d|3[01])\.|203\.0\.113\.)/.test(host);
}

/** Extract 2-letter ISO country code from vpn://XX, surfshark://XX, country:XX, or [vpn:XX] note tag. */
export function extractVpnCountryCode(proxy?: string | null, note?: string | null): string {
  const rawProxy = String(proxy || "").trim();
  const mProxy = rawProxy.match(/^(?:vpn|surfshark|nordvpn|country):(?:\/\/)?([A-Za-z]{2})\b/i);
  if (mProxy) return mProxy[1]!.toUpperCase();
  const rawNote = String(note || "");
  const mNote = rawNote.match(/\[(?:vpn|country):([A-Za-z]{2})\]/i);
  if (mNote && !rawProxy) return mNote[1]!.toUpperCase();
  return "";
}

/** Extract 2-letter ISO country code for Static/HTTP Proxy (`proxy://XX`, `[proxy:XX]`, known Vault proxy IPs, or profile geo). */
export function extractProxyCountryCode(
  proxy?: string | null,
  note?: string | null,
  timezone?: string | null,
  locale?: string | null,
): string {
  const rawProxy = String(proxy || "").trim();
  if (!rawProxy) return "";
  if (extractVpnCountryCode(rawProxy, note)) return "";
  const mProxy = rawProxy.match(/^proxy:(?:\/\/)?([A-Za-z]{2})\b/i);
  if (mProxy) return mProxy[1]!.toUpperCase();
  const rawNote = String(note || "");
  const mNote = rawNote.match(/\[(?:proxy|vpn|country):([A-Za-z]{2})\]/i);
  if (mNote) return mNote[1]!.toUpperCase();

  const host = extractProxyHostIp(rawProxy);
  if (host) {
    for (const [prefix, cc] of KNOWN_STATIC_PROXY_COUNTRY_PREFIXES) {
      if (host.startsWith(prefix)) return cc;
    }
    if (isPrivateOrTestIp(host)) return "";
  }

  const tz = String(timezone || "").trim();
  if (tz === "Asia/Ho_Chi_Minh" || tz === "Asia/Saigon" || tz === "Asia/Bangkok") return "VN";
  if (tz.startsWith("America/Toronto") || tz.startsWith("America/Vancouver")) return "CA";
  if (tz.startsWith("America/")) return "US";
  if (tz === "Asia/Singapore") return "SG";
  if (tz === "Asia/Tokyo") return "JP";
  if (tz === "Europe/London") return "GB";
  if (tz === "Europe/Dublin") return "IE";
  if (tz === "Australia/Sydney") return "AU";
  if (tz === "Asia/Manila") return "PH";
  if (tz === "Asia/Kuala_Lumpur") return "MY";

  const loc = String(locale || "").trim();
  const mLoc = loc.match(/[-_]([A-Za-z]{2})\b/);
  if (mLoc && host && !isPrivateOrTestIp(host)) {
    return mLoc[1]!.toUpperCase();
  }
  return "";
}

/** Coherent IANA timezone + BCP-47 locale defaults for each Country VPN/Proxy pool preset (`ok 2`). */
export const COUNTRY_VPN_GEO_DEFAULTS: Record<string, { timezone: string; locale: string }> = {
  US: { timezone: "America/New_York", locale: "en-US" },
  SG: { timezone: "Asia/Singapore", locale: "en-SG" },
  JP: { timezone: "Asia/Tokyo", locale: "ja-JP" },
  GB: { timezone: "Europe/London", locale: "en-GB" },
  DE: { timezone: "Europe/Berlin", locale: "de-DE" },
  KR: { timezone: "Asia/Seoul", locale: "ko-KR" },
  FR: { timezone: "Europe/Paris", locale: "fr-FR" },
  NL: { timezone: "Europe/Amsterdam", locale: "nl-NL" },
  CA: { timezone: "America/Toronto", locale: "en-CA" },
  AU: { timezone: "Australia/Sydney", locale: "en-AU" },
  VN: { timezone: "Asia/Ho_Chi_Minh", locale: "vi-VN" },
  IE: { timezone: "Europe/Dublin", locale: "en-IE" },
  PH: { timezone: "Asia/Manila", locale: "en-PH" },
  MY: { timezone: "Asia/Kuala_Lumpur", locale: "en-MY" },
};

/** Resolve matching `{ countryCode, timezone, locale }` when a Country VPN/Proxy (`vpn://XX` or `proxy://XX`) is selected. */
export function resolveVpnCountryGeoDefaults(
  proxy?: string | null,
  note?: string | null,
): { countryCode: string; timezone: string; locale: string } | null {
  const cc = extractVpnCountryCode(proxy, note) || extractProxyCountryCode(proxy, note);
  if (!cc) return null;
  const def = COUNTRY_VPN_GEO_DEFAULTS[cc];
  if (!def) return null;
  return { countryCode: cc, ...def };
}

/** Format proxy cell badge and country metadata for directory table & popovers. */
export function formatProxyBadgeLabel(
  proxy?: string | null,
  note?: string | null,
  timezone?: string | null,
  locale?: string | null,
): {
  label: string;
  countryCode: string;
  isVpnPool: boolean;
  isCountryProxy?: boolean;
} {
  const vpnCode = extractVpnCountryCode(proxy, note);
  if (vpnCode) {
    return {
      label: `VPN ${vpnCode}`,
      countryCode: vpnCode,
      isVpnPool: true,
    };
  }
  const proxyCode = extractProxyCountryCode(proxy, note, timezone, locale);
  if (proxyCode) {
    return {
      label: `Proxy ${proxyCode}`,
      countryCode: proxyCode,
      isVpnPool: false,
      isCountryProxy: true,
    };
  }
  const trimmed = String(proxy || "").trim();
  return {
    label: trimmed || "Local IP",
    countryCode: "",
    isVpnPool: false,
  };
}

/** Parse host:port:user:pass or full URL into a proxy string for CloakBrowser. */
export function parseProxyLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (trimmed.includes("://")) return trimmed;

  const parts = trimmed.split(":");
  if (parts.length >= 4) {
    const host = parts[0]!;
    const port = parts[1]!;
    const user = parts[2]!;
    const pass = parts.slice(3).join(":");
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  if (parts.length === 2) {
    return `http://${parts[0]}:${parts[1]}`;
  }
  return trimmed;
}

/** Dummy sample for parseProxyLine docs/tests — never a real endpoint. */
export const PROXY_TEST_LINE = "203.0.113.10:8080:user:pass";
export const PROXY_TEST_URL = parseProxyLine(PROXY_TEST_LINE);

export function randomFingerprintSeed() {
  return Math.floor(10000 + Math.random() * 89999);
}

/** Filesystem-safe profile label for export/download basenames. */
export function sanitizeProfileExportBasename(name: string) {
  const token = String(name || "profile")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);
  return token || "profile";
}

/** Local timestamp token for export filenames — `YYYY-MM-DD_HH-mm-ss`. */
export function profileExportTimestampToken(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/**
 * Export basename — one profile: `{Name}_{timestamp}.ext`; many: `{First}_+{n-1}_{timestamp}.ext`.
 * Empty names → `all-profiles_{timestamp}.ext`.
 */
export function buildProfileExportFilename(profileNames: string[], ext: "json" | "zip") {
  const ts = profileExportTimestampToken();
  const names = profileNames.map(sanitizeProfileExportBasename).filter(Boolean);
  let base: string;
  if (names.length === 0) base = "all-profiles";
  else if (names.length === 1) base = names[0]!;
  else base = `${names[0]!}_+${names.length - 1}`;
  return `${base}_${ts}.${ext}`;
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatRunDuration(ms?: number) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatRunTimestamp(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
