#!/usr/bin/env node
"use strict";
/**
 * Đa dạng hoá device surface cho profile (viewport/colorScheme[/platform]) — suy xác định
 * từ fingerprint seed. Mặc định chỉ chạm profile "device blank" (chưa cấu hình tay).
 *
 * AN TOÀN: từ chối ghi nếu app P0003 đang mở (port 6003) — trừ --dry (chỉ đọc, xem trước).
 *
 * Dùng:
 *   node scripts/diversify-profiles.cjs --dry          # xem phân bố sẽ áp (đọc, an toàn dù app mở)
 *   node scripts/diversify-profiles.cjs                # áp cho profile blank (app phải đóng)
 *   node scripts/diversify-profiles.cjs --all          # áp cho TẤT CẢ (kể cả đã cấu hình)
 *   node scripts/diversify-profiles.cjs --platforms    # đa dạng cả OS (rủi ro lộ host — cân nhắc)
 *   node scripts/diversify-profiles.cjs --no-colors    # bỏ đa dạng color scheme
 */
const http = require("node:http");
const path = require("node:path");

function hasFlag(name) { return process.argv.includes(`--${name}`); }
function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return def;
}

const DRY = hasFlag("dry");
const ALL = hasFlag("all");
const REVERT = hasFlag("revert");
const COLORS = !hasFlag("no-colors");
const PLATFORMS = hasFlag("platforms");
const USERDATA = arg("userdata", path.join(process.env.APPDATA || "", "stealth-browser-console"));
const PORT = Number(arg("port", 6003));

function checkAppRunning() {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path: "/api/health", timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

async function main() {
  const running = await checkAppRunning();
  if (running && !DRY) {
    console.error(`✗ App P0003 đang chạy (port ${PORT}). ĐÓNG app trước (hoặc dùng --dry để xem trước).`);
    process.exit(2);
  }

  const { openDatabase, flushDatabase, closeDatabase } = require("../electron/db/init.cjs");
  await openDatabase(USERDATA);
  const profileService = require("../electron/db/profile-service.cjs");
  const { deriveDeviceProfile, isDefaultDevice } = require("../electron/lib/fingerprint-diversify.cjs");

  const profiles = profileService.listProfiles();

  // --revert: trả device về "như cũ" (host-maximized / fullscreen, viewport 0, không color).
  if (REVERT) {
    const targets = profiles.filter((p) => p.windowMode === "preset-viewport" || Number(p.viewportW || 0) > 0 || p.colorScheme);
    console.log(`DB: ${path.join(USERDATA, "data", "stealth-console.db")}`);
    console.log(`Revert ${DRY ? "[DRY] " : ""}${targets.length}/${profiles.length} profile về host-maximized (fullscreen).`);
    let n = 0;
    for (const p of targets) {
      if (DRY) { n += 1; continue; }
      profileService.updateProfile(p.id, { windowMode: "host-maximized", viewportW: 0, viewportH: 0, colorScheme: "" });
      n += 1;
      if (n % 500 === 0) console.log(`  …${n}/${targets.length}`);
    }
    if (!DRY) { flushDatabase(); closeDatabase(); }
    console.log(DRY ? `[DRY] sẽ revert ${n}.` : `Revert ${n} profile về fullscreen.`);
    return;
  }

  const targets = ALL ? profiles : profiles.filter(isDefaultDevice);

  console.log(`DB: ${path.join(USERDATA, "data", "stealth-console.db")}`);
  console.log(`Tổng ${profiles.length} profile, sẽ ${DRY ? "[DRY] " : ""}đa dạng ${targets.length} (${ALL ? "tất cả" : "device blank"}). colors=${COLORS} platforms=${PLATFORMS}`);

  // Thống kê phân bố để xác nhận hợp lý.
  const dist = { viewport: {}, colorScheme: {}, platform: {} };
  const bump = (m, k) => { if (k != null) m[k] = (m[k] || 0) + 1; };

  let applied = 0;
  const t0 = Date.now();
  for (const p of targets) {
    const dev = deriveDeviceProfile(p.fingerprintSeed, { colors: COLORS, platforms: PLATFORMS });
    bump(dist.viewport, `${dev.viewportW}x${dev.viewportH}`);
    bump(dist.colorScheme, dev.colorScheme);
    bump(dist.platform, dev.platform);
    if (!DRY) {
      profileService.updateProfile(p.id, dev);
      applied += 1;
      if (applied % 500 === 0) console.log(`  …${applied}/${targets.length}`);
    }
  }

  if (!DRY) flushDatabase();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("\nPhân bố viewport:");
  for (const [k, v] of Object.entries(dist.viewport).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(11)} ${v} (${((v / targets.length) * 100).toFixed(1)}%)`);
  }
  if (COLORS) {
    console.log("Phân bố colorScheme:", JSON.stringify(dist.colorScheme));
  }
  if (PLATFORMS) {
    console.log("Phân bố platform:", JSON.stringify(dist.platform));
  }
  console.log(`\n${DRY ? "[DRY] Không ghi gì." : `Áp ${applied} profile. ${secs}s`}`);
  if (!DRY) closeDatabase();
}

main().catch((err) => {
  console.error("✗ Lỗi:", err.message);
  process.exit(1);
});
