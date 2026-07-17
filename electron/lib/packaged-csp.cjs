/** Production CSP for packaged renderer — shared by main + packaged auth smoke. */
function packagedContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    // Hub identity moved to hub-api.infi.io.vn (custom domain). Keep *.supabase.co for vault/legacy.
    "connect-src 'self' https://hub-api.infi.io.vn wss://hub-api.infi.io.vn https://*.infi.io.vn wss://*.infi.io.vn https://*.supabase.co wss://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

module.exports = { packagedContentSecurityPolicy };
