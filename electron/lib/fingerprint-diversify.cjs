"use strict";
/**
 * Đa dạng hoá device surface per-profile — KHÔNG random, suy xác định từ fingerprint seed
 * (chạy lại cho kết quả y hệt) và NHẤT QUÁN nội bộ.
 *
 * Nguyên tắc antidetect:
 *  - Đa dạng viewport theo phân bố độ phân giải desktop THỰC (có trọng số) thay vì
 *    host-maximized (mọi profile cùng kích thước cửa sổ = tín hiệu correlate).
 *  - timezone/locale ĐỂ TRỐNG → CloakBrowser geoip tự suy từ proxy (tránh lệch geo).
 *  - platform mặc định giữ nguyên (khớp host); opt-in mới đa dạng OS.
 */

// Inner viewport thực tế (đã trừ chrome trình duyệt), trọng số xấp xỉ thị phần desktop.
const VIEWPORTS = [
  { w: 1536, h: 864, weight: 18 },
  { w: 1366, h: 768, weight: 16 },
  { w: 1920, h: 1080, weight: 14 },
  { w: 1920, h: 937, weight: 8 },
  { w: 1440, h: 900, weight: 10 },
  { w: 1280, h: 720, weight: 8 },
  { w: 1600, h: 900, weight: 7 },
  { w: 1280, h: 1024, weight: 4 },
  { w: 1680, h: 1050, weight: 4 },
  { w: 2560, h: 1440, weight: 5 },
  { w: 1360, h: 768, weight: 3 },
  { w: 1360, h: 768, weight: 3 }
];

const COLOR_SCHEMES = [
  { value: "light", weight: 64 },
  { value: "dark", weight: 30 },
  { value: "no-preference", weight: 6 }
];

// Opt-in: phân bố OS xấp xỉ thị phần. Lưu ý spoof macOS/linux trên host Windows có rủi ro
// lộ tín hiệu — chỉ bật khi engine spoof platform đầy đủ.
const PLATFORMS = [
  { value: "windows", weight: 72 },
  { value: "macos", weight: 21 },
  { value: "linux", weight: 7 }
];

/** Hash xác định 32-bit từ (seed, salt) — để các field không tương quan hoàn hảo. */
function hash(seed, salt) {
  let x = (Number(seed) ^ (salt * 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function pickWeighted(pool, n) {
  const total = pool.reduce((s, x) => s + x.weight, 0);
  let r = n % total;
  for (const item of pool) {
    if (r < item.weight) return item;
    r -= item.weight;
  }
  return pool[pool.length - 1];
}

/**
 * Suy device fields đa dạng từ seed.
 * @param {number} seed fingerprintSeed của profile
 * @param {{ colors?: boolean, platforms?: boolean }} opts
 * @returns {{ windowMode: string, viewportW: number, viewportH: number, colorScheme?: string, platform?: string }}
 */
function deriveDeviceProfile(seed, opts = {}) {
  const { colors = true, platforms = false } = opts;
  const vp = pickWeighted(VIEWPORTS, hash(seed, 1));
  const out = {
    windowMode: "preset-viewport",
    viewportW: vp.w,
    viewportH: vp.h
  };
  if (colors) out.colorScheme = pickWeighted(COLOR_SCHEMES, hash(seed, 2)).value;
  if (platforms) out.platform = pickWeighted(PLATFORMS, hash(seed, 3)).value;
  return out;
}

/** Profile "device chưa cấu hình" (blank) — an toàn để đa dạng mà không đè cấu hình tay. */
function isDefaultDevice(profile) {
  return (
    (profile.windowMode === "host-maximized" || !profile.windowMode) &&
    Number(profile.viewportW || 0) === 0 &&
    Number(profile.viewportH || 0) === 0 &&
    !String(profile.timezone || "").trim() &&
    !String(profile.locale || "").trim()
  );
}

module.exports = { deriveDeviceProfile, isDefaultDevice, VIEWPORTS, COLOR_SCHEMES, PLATFORMS };
