/**
 * E0001 TOTP Clock & RFC 6238 Generator SSOT — shared with `packages/totp-clock/src/p0020-clock.ts`.
 * Reads/writes `p0020_totp_clock_offset_ms_v1` in both `localStorage` and `chrome.storage.local`
 * and calibrates against Lenovo Linux `origin-nginx` `/api/quota-time` so 2FA OTP generation
 * and JWT expiry checks stay 100% accurate when the workstation clock or timezone is skewed.
 */

export const STORAGE_TOTP_CLOCK_OFFSET = "p0020_totp_clock_offset_ms_v1";

const MIN_UNIX_MS = 1_000_000_000_000;
const SYNC_GAP_MS = 15_000;
const FETCH_TIMEOUT_MS = 3_500;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const CLOCK_CANDIDATE_URLS = [
  "https://databox.infi28.com/api/quota-time",
  "https://databox.infi.io.vn/api/quota-time",
  "https://infi28.com/api/quota-time",
  "https://sb-api.infi28.com/api/quota-time",
  "http://127.0.0.1:5198/api/quota-time",
];

function readLocalOffsetSync() {
  try {
    if (typeof localStorage === "undefined") return 0;
    const raw = localStorage.getItem(STORAGE_TOTP_CLOCK_OFFSET);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  } catch {
    return 0;
  }
}

let totpClockOffsetMs = readLocalOffsetSync();
let syncing = null;
let lastSyncAt = 0;

function persistOffset(offsetMs) {
  const truncated = Math.trunc(offsetMs);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_TOTP_CLOCK_OFFSET, String(truncated));
    }
  } catch {
    // ignore
  }
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local?.set) {
      void chrome.storage.local.set({ [STORAGE_TOTP_CLOCK_OFFSET]: truncated });
    }
  } catch {
    // ignore
  }
}

// Hydrate from chrome.storage.local in service worker / popup contexts
try {
  if (typeof chrome !== "undefined" && chrome.storage?.local?.get) {
    chrome.storage.local.get(STORAGE_TOTP_CLOCK_OFFSET, (stored) => {
      const val = Number(stored?.[STORAGE_TOTP_CLOCK_OFFSET]);
      if (Number.isFinite(val) && totpClockOffsetMs === 0) {
        totpClockOffsetMs = Math.trunc(val);
      }
    });
  }
} catch {
  // ignore
}

export function totpClockOffsetMsValue() {
  return totpClockOffsetMs;
}

export function setE0001TotpClockOffsetMs(offsetMs) {
  const n = Number(offsetMs);
  if (!Number.isFinite(n)) return totpClockOffsetMs;
  totpClockOffsetMs = Math.trunc(n);
  persistOffset(totpClockOffsetMs);
  return totpClockOffsetMs;
}

export function totpNowMs() {
  return Date.now() + totpClockOffsetMs;
}

export function applyE0001ServerUnixMs(unixMs, receivedAt = Date.now()) {
  const n = typeof unixMs === "number" ? unixMs : typeof unixMs === "string" ? Number(unixMs) : NaN;
  if (!Number.isFinite(n) || n < MIN_UNIX_MS) return totpClockOffsetMs;
  totpClockOffsetMs = Math.trunc(n) - receivedAt;
  persistOffset(totpClockOffsetMs);
  return totpClockOffsetMs;
}

function parseServerUnixMs(body, dateHeader) {
  if (body && typeof body === "object") {
    const rawMs = body.unix_ms ?? body.serverTimeMs;
    const ms = typeof rawMs === "number" ? rawMs : typeof rawMs === "string" ? Number(rawMs) : NaN;
    if (Number.isFinite(ms) && ms >= MIN_UNIX_MS) return Math.trunc(ms);
    const rawSec = body.unix_sec ?? body.server_unix;
    const sec = typeof rawSec === "number" ? rawSec : typeof rawSec === "string" ? Number(rawSec) : NaN;
    if (Number.isFinite(sec) && sec >= MIN_UNIX_MS / 1000) return Math.trunc(sec * 1000);
  }
  if (dateHeader) {
    const parsed = Date.parse(dateHeader);
    if (Number.isFinite(parsed) && parsed >= MIN_UNIX_MS) return parsed;
  }
  return null;
}

async function pullTotpClock() {
  for (const url of CLOCK_CANDIDATE_URLS) {
    try {
      const startedAt = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res?.ok) continue;
      const endedAt = Date.now();
      const body = await res.json().catch(() => null);
      const serverUnixMs = parseServerUnixMs(body, res.headers?.get?.("date") ?? null);
      if (serverUnixMs !== null) {
        applyE0001ServerUnixMs(serverUnixMs, Math.floor((startedAt + endedAt) / 2));
        lastSyncAt = Date.now();
        return;
      }
    } catch {
      // try next candidate
    }
  }
}

export function syncE0001TotpClock(force = false) {
  if (syncing) return syncing;
  if (!force && lastSyncAt > 0 && Date.now() - lastSyncAt < SYNC_GAP_MS) {
    return Promise.resolve();
  }
  syncing = pullTotpClock()
    .catch(() => {})
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

export function normalizeE0001TotpSecret(rawSecret = "") {
  let raw = String(rawSecret ?? "").trim();
  if (!raw) return "";
  const uriMatch = raw.match(/[?&]secret=([A-Za-z2-7=\s-]+)/i);
  if (uriMatch?.[1]) raw = uriMatch[1];
  const clean = raw.replace(/[\s=-]+/g, "").toUpperCase();
  if (clean.length < 8 || !/^[A-Z2-7]+$/.test(clean)) return "";
  return clean;
}

function decodeBase32ToBytes(cleanSecret) {
  let clean = cleanSecret;
  if (clean.length === 31) clean = `${clean}A`;
  let bits = "";
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx >= 0) bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

export async function generateE0001TotpCode(secret, atMs = totpNowMs()) {
  const clean = normalizeE0001TotpSecret(secret);
  if (!clean || !globalThis.crypto?.subtle) return null;
  try {
    const keyBytes = decodeBase32ToBytes(clean);
    const counter = Math.floor(atMs / 1000 / 30);
    const counterBuf = new ArrayBuffer(8);
    const view = new DataView(counterBuf);
    view.setUint32(0, Math.floor(counter / 0x100000000), false);
    view.setUint32(4, counter >>> 0, false);
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"],
    );
    const sig = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", cryptoKey, counterBuf));
    const offset = sig[sig.length - 1] & 0x0f;
    const bin =
      ((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff);
    return String(bin % 1_000_000).padStart(6, "0");
  } catch {
    return null;
  }
}

export function e0001TotpSecondsRemaining(period = 30, atMs = totpNowMs()) {
  const now = Math.floor(atMs / 1000);
  const left = period - (now % period);
  return left === 0 ? period : left;
}
