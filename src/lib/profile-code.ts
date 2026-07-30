/** UI mirror of electron/lib/profile-code.cjs — keep extractFourDigitCode in sync. */
export const PROFILE_CODE_MIN = 0;
export const PROFILE_CODE_MAX = 9999;

/** UI mirror — px gap between last3 digits on taskbar ICO (+10% vs spaced7). */
export const BADGE_DIGIT_GAP_BY_MAX_SIZE = [
  { maxSize: 16, gap: 3.5 },
  { maxSize: 20, gap: 4.2 },
  { maxSize: 24, gap: 4.8 },
  { maxSize: 32, gap: 6.2 },
  { maxSize: 48, gap: 7.4 },
] as const;

export function digitGapForIcoSize(size: number): number {
  const s = Number(size) || 0;
  for (const rule of BADGE_DIGIT_GAP_BY_MAX_SIZE) {
    if (s <= rule.maxSize) return rule.gap;
  }
  return Math.round(s * 0.155848 * 10) / 10;
}

export function digitGapsCsvForSizes(sizes: number[]): string {
  return sizes.map((size) => `${Number(size)}:${digitGapForIcoSize(size)}`).join(",");
}

export function parseProfileCode(raw: unknown): { ok: true; code: string; n: number } | { ok: false; error: string } {
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

export function normalizeProfileName(raw: unknown): string | null {
  const parsed = parseProfileCode(raw);
  return parsed.ok ? parsed.code : null;
}

function digitsOnly(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** SSOT mirror — same rules as electron/lib/profile-code.cjs */
export function extractFourDigitCode(name: string, id = ""): string {
  const fromName = digitsOnly(name);
  if (fromName.length >= 4) {
    const slice = fromName.slice(-4);
    const n = Number(slice);
    if (Number.isInteger(n) && n >= PROFILE_CODE_MIN && n <= PROFILE_CODE_MAX) {
      return String(n).padStart(4, "0");
    }
  }
  if (/^\d{1,4}$/.test(String(name || "").trim())) {
    const parsed = parseProfileCode(name);
    if (parsed.ok) return parsed.code;
  }
  const fromIdRaw = String(id || "").replace(/-/g, "");
  const fromIdDigits = digitsOnly(fromIdRaw).slice(0, 4);
  if (fromIdDigits.length >= 1) return fromIdDigits.padStart(4, "0").slice(-4);
  if (fromIdRaw) return fromIdRaw.slice(0, 4);
  return "0000";
}

/** Alias used across UI + electron/lib/profile-code.cjs */
export function extractProfileCode(name: string, id = ""): string {
  return extractFourDigitCode(name, id);
}
