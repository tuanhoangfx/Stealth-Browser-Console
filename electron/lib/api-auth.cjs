"use strict";
/**
 * Auth tối thiểu cho BrowserHub API.
 *
 * Mô hình: token chia sẻ (bearer). Token lấy từ env STEALTH_API_TOKEN.
 * - Nếu KHÔNG set token  → API mở (giữ tương thích ngược cho P0025 cũ), chỉ bind 127.0.0.1.
 * - Nếu CÓ set token     → mọi route (trừ /api/health) phải gửi đúng token.
 *
 * Chấp nhận 2 cách gửi:
 *   Authorization: Bearer <token>
 *   X-Api-Token: <token>
 */
const crypto = require("node:crypto");

function getConfiguredToken() {
  const token = String(process.env.STEALTH_API_TOKEN || "").trim();
  return token || null;
}

/** So sánh hằng-thời-gian để tránh timing attack. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractToken(req) {
  const auth = String(req.headers["authorization"] || "").trim();
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  const direct = req.headers["x-api-token"];
  if (direct) return String(direct).trim();
  return "";
}

/**
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
function checkAuth(req, urlPath) {
  const configured = getConfiguredToken();
  if (!configured) return { ok: true }; // chế độ mở (single-user localhost)
  if (urlPath === "/api/health") return { ok: true }; // health luôn mở để probe
  const provided = extractToken(req);
  if (!provided) return { ok: false, status: 401, error: "Thiếu API token" };
  if (!safeEqual(provided, configured)) return { ok: false, status: 403, error: "API token sai" };
  return { ok: true };
}

module.exports = { checkAuth, getConfiguredToken };
