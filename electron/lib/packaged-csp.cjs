/** Production CSP for packaged renderer — shared by main + packaged auth smoke. */
function packagedContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    // Hub identity & Data Box on *.infi28.com + legacy *.infi.io.vn. Keep *.supabase.co for vault/legacy.
    // Local BrowserHub API (:6003 / :6004) and Social Hub Mobile Stealth Bridge (:3002).
    "connect-src 'self' http://127.0.0.1:6003 http://127.0.0.1:6004 http://127.0.0.1:3002 http://localhost:6003 http://localhost:6004 http://localhost:3002 https://hub-api.infi28.com wss://hub-api.infi28.com https://*.infi28.com wss://*.infi28.com https://hub-api.infi.io.vn wss://hub-api.infi.io.vn https://*.infi.io.vn wss://*.infi.io.vn https://*.supabase.co wss://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

module.exports = { packagedContentSecurityPolicy };
