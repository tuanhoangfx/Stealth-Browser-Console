const crypto = require("node:crypto");

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input) {
  const clean = input.replace(/[\s=-]+/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * Generate a TOTP code from a base32 secret (RFC 6238).
 * @param {string} secret — base32-encoded TOTP secret
 * @param {object} [opts]
 * @param {number} [opts.period=30] — time step in seconds
 * @param {number} [opts.digits=6] — code length
 * @param {number} [opts.timestamp] — override current time (ms)
 * @returns {string} — zero-padded TOTP code
 */
function generateTotp(secret, opts = {}) {
  const period = opts.period || 30;
  const digits = opts.digits || 6;
  const now = opts.timestamp ?? Date.now();

  const counter = Math.floor(now / 1000 / period);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const key = base32Decode(secret);
  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = binary % 10 ** digits;
  return String(code).padStart(digits, "0");
}

module.exports = { generateTotp, base32Decode };
