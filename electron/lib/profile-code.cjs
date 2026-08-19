/**
 * Profile code SSOT — names are exactly 0000–9999 (4 digits).
 * Taskbar overlay Design V4: colored last3 on icon (no scrim/plate). 0xxx=white; 1–9 vivid hues.
 */
const PROFILE_CODE_MIN = 0;
const PROFILE_CODE_MAX = 9999;

/**
 * Digit ink RGB by thousands 0–9.
 * 0xxx = white (legacy default); 1–9 = high-chroma, well-separated hues for 16–24px taskbar.
 */
const THOUSANDS_DIGIT_ARGB = Object.freeze([
  [255, 255, 255, 255], // 0 white (default)
  [255, 0, 200, 255], // 1 sky cyan (was #00f5e9 — low contrast on Chromium)
  [255, 43, 255, 102], // 2 neon green
  [255, 255, 230, 0], // 3 yellow
  [255, 255, 138, 0], // 4 orange
  [255, 255, 45, 85], // 5 red-pink
  [255, 255, 0, 204], // 6 magenta
  [255, 179, 71, 255], // 7 violet
  [255, 61, 126, 255], // 8 blue
  [255, 200, 255, 0], // 9 chartreuse
]);

const THOUSANDS_DIGIT_HEX = Object.freeze([
  "#ffffff",
  "#00c8ff",
  "#2bff66",
  "#ffe600",
  "#ff8a00",
  "#ff2d55",
  "#ff00cc",
  "#b347ff",
  "#3d7eff",
  "#c8ff00",
]);

/** Design V4 — px gap between adjacent last3 digits on taskbar ICO (SSOT for render-taskbar-badge.ps1). +10% vs spaced7. */
const BADGE_DIGIT_GAP_BY_MAX_SIZE = Object.freeze([
  { maxSize: 16, gap: 3.5 },
  { maxSize: 20, gap: 4.2 },
  { maxSize: 24, gap: 4.8 },
  { maxSize: 32, gap: 6.2 },
  { maxSize: 48, gap: 7.4 },
]);

/** @param {number} size ICO frame width/height in px */
function digitGapForIcoSize(size) {
  const s = Number(size) || 0;
  for (const rule of BADGE_DIGIT_GAP_BY_MAX_SIZE) {
    if (s <= rule.maxSize) return rule.gap;
  }
  return Math.round(s * 0.155848 * 10) / 10;
}

/** @param {number[]} sizes */
function digitGapsCsvForSizes(sizes) {
  return (sizes || [])
    .map((size) => `${Number(size)}:${digitGapForIcoSize(size)}`)
    .join(",");
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** Chromium userData folder is the catalog UUID — never a 0000–9999 badge code. */
const UUID_FOLDER_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidFolderId(value) {
  return UUID_FOLDER_RE.test(String(value || "").trim());
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, code: string, n: number } | { ok: false, error: string }}
 */
function parseProfileCode(raw) {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: false, error: "Profile name is required." };
  if (!/^\d{1,4}$/.test(trimmed)) {
    return { ok: false, error: "Profile name must be a 4-digit code from 0000 to 9999." };
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < PROFILE_CODE_MIN || n > PROFILE_CODE_MAX) {
    return { ok: false, error: "Profile name must be a code from 0000 to 9999." };
  }
  return { ok: true, code: String(n).padStart(4, "0"), n };
}

/** @throws {Error} */
function normalizeProfileNameOrThrow(raw) {
  const parsed = parseProfileCode(raw);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.code;
}

function extractFourDigitCode(name, id = "") {
  const rawName = isUuidFolderId(name) ? "" : String(name ?? "");
  const rawId = isUuidFolderId(id) ? "" : String(id ?? "");
  const fromName = digitsOnly(rawName);
  if (fromName.length >= 4) {
    const slice = fromName.slice(-4);
    const n = Number(slice);
    if (Number.isInteger(n) && n >= PROFILE_CODE_MIN && n <= PROFILE_CODE_MAX) {
      return String(n).padStart(4, "0");
    }
  }
  if (/^\d{1,4}$/.test(rawName.trim())) {
    const parsed = parseProfileCode(rawName);
    if (parsed.ok) return parsed.code;
  }
  const fromIdRaw = String(rawId || "").replace(/-/g, "");
  const fromIdDigits = digitsOnly(fromIdRaw).slice(0, 4);
  if (fromIdDigits.length >= 1) return fromIdDigits.padStart(4, "0").slice(-4);
  if (fromIdRaw) return fromIdRaw.slice(0, 4);
  return "0000";
}

function badgeLast3(code) {
  return extractFourDigitCode(code).slice(-3);
}

function badgeThousands(code) {
  const n = Number(extractFourDigitCode(code));
  return Math.min(9, Math.max(0, Math.floor(n / 1000)));
}

function digitArgbForCode(code) {
  return THOUSANDS_DIGIT_ARGB[badgeThousands(code)] || THOUSANDS_DIGIT_ARGB[0];
}

function digitHexForCode(code) {
  return THOUSANDS_DIGIT_HEX[badgeThousands(code)] || THOUSANDS_DIGIT_HEX[0];
}

function extractProfileCode(name, id = "") {
  return extractFourDigitCode(name, id);
}

module.exports = {
  PROFILE_CODE_MIN,
  PROFILE_CODE_MAX,
  THOUSANDS_DIGIT_ARGB,
  THOUSANDS_DIGIT_HEX,
  BADGE_DIGIT_GAP_BY_MAX_SIZE,
  parseProfileCode,
  normalizeProfileNameOrThrow,
  isUuidFolderId,
  extractFourDigitCode,
  extractProfileCode,
  badgeLast3,
  badgeThousands,
  digitArgbForCode,
  digitHexForCode,
  digitGapForIcoSize,
  digitGapsCsvForSizes,
};
