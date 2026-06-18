/** PNG flags via flagcdn.com — same pattern as P0021 AutoVideo Studio / P0004 RegionFlagBadge. */

const FLAGCDN = "https://flagcdn.com";

export function flagCdnUrl(countryCode: string, width = 16, height = 12): string {
  const code = countryCode.trim().toLowerCase();
  if (!code || !/^[a-z]{2}$/.test(code)) return `${FLAGCDN}/${width}x${height}/un.png`;
  return `${FLAGCDN}/${width}x${height}/${code}.png`;
}

/** Map BCP-47 locale (or short region code) to ISO 3166-1 alpha-2 for flagcdn. */
export function countryCodeForLocale(locale: string): string {
  const normalized = locale.trim();
  if (!normalized) return "un";

  if (normalized === "VI" || normalized === "vi") return "vn";

  const region = normalized.includes("-") ? normalized.split("-")[1]! : normalized;
  const map: Record<string, string> = {
    US: "us",
    GB: "gb",
    AU: "au",
    CA: "ca",
    IN: "in",
    IE: "ie",
    NZ: "nz",
    ZA: "za",
    HK: "hk",
    SG: "sg",
    PH: "ph",
    JA: "jp",
    JP: "jp",
    KO: "kr",
    KR: "kr",
    ZH: "cn",
    CN: "cn",
    TH: "th",
    ID: "id",
    VN: "vn",
    DE: "de",
    FR: "fr",
  };

  const hit = map[region.toUpperCase()];
  if (hit) return hit;

  const lower = region.toLowerCase();
  if (/^[a-z]{2}$/.test(lower)) return lower;
  return "un";
}

export function localeFlagIconSrc(locale: string): string {
  return flagCdnUrl(countryCodeForLocale(locale));
}
