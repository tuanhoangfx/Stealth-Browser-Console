#!/usr/bin/env node
"use strict";
/**
 * Bulk-create profile theo dải tên số (zero-pad), idempotent.
 *
 * AN TOÀN: từ chối chạy nếu app P0003 đang mở (port 6003) — sql.js ghi đè TOÀN BỘ
 * file DB, ghi song song với app đang chạy sẽ mất dữ liệu. Đóng app trước.
 *
 * Dùng:
 *   node scripts/bulk-create-profiles.cjs                 # 0000..4999, DB mặc định (APPDATA)
 *   node scripts/bulk-create-profiles.cjs --start 1 --end 5000
 *   node scripts/bulk-create-profiles.cjs --pad 4 --dry   # xem trước, không ghi
 *   node scripts/bulk-create-profiles.cjs --userdata "D:/path/to/userData"
 *
 * Idempotent: tên đã tồn tại sẽ bỏ qua. Chạy lại an toàn.
 */
const http = require("node:http");
const path = require("node:path");

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return def;
}
const hasFlag = (name) => process.argv.includes(`--${name}`);

const START = Number(arg("start", 0));
const END = Number(arg("end", 4999));
const PAD = Number(arg("pad", 4));
const DRY = hasFlag("dry");
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
  if (!USERDATA) {
    console.error("✗ Không xác định được userData. Truyền --userdata <path>.");
    process.exit(1);
  }

  const running = await checkAppRunning();
  if (running) {
    console.error(`✗ App P0003 đang chạy (port ${PORT}). ĐÓNG app trước rồi chạy lại — nếu không sẽ mất dữ liệu.`);
    process.exit(2);
  }

  if (!(Number.isInteger(START) && Number.isInteger(END) && START <= END)) {
    console.error(`✗ Dải không hợp lệ: start=${START} end=${END}`);
    process.exit(1);
  }

  const { openDatabase, flushDatabase, closeDatabase } = require("../electron/db/init.cjs");
  await openDatabase(USERDATA);
  const profileService = require("../electron/db/profile-service.cjs");

  // Tập tên đã có → bỏ qua (idempotent).
  const existing = new Set(profileService.listProfiles().map((p) => String(p.name)));
  const total = END - START + 1;
  console.log(`DB: ${path.join(USERDATA, "data", "stealth-console.db")}`);
  console.log(`Dải: ${String(START).padStart(PAD, "0")}..${String(END).padStart(PAD, "0")} (${total} tên), đã có ${existing.size} profile.`);

  let created = 0;
  let skipped = 0;
  const t0 = Date.now();
  for (let n = START; n <= END; n += 1) {
    const name = String(n).padStart(PAD, "0");
    if (existing.has(name)) { skipped += 1; continue; }
    if (DRY) { created += 1; continue; }
    profileService.createProfile({ name });
    created += 1;
    if (created % 500 === 0) console.log(`  …${created} tạo, ${skipped} bỏ qua`);
  }

  if (!DRY) flushDatabase();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${DRY ? "[DRY] " : ""}Xong: tạo ${created}, bỏ qua ${skipped} (đã tồn tại). ${secs}s`);
  if (!DRY) {
    const after = profileService.listProfiles().length;
    console.log(`Tổng profile sau khi tạo: ${after}`);
    closeDatabase();
  }
}

main().catch((err) => {
  console.error("✗ Lỗi:", err.message);
  process.exit(1);
});
