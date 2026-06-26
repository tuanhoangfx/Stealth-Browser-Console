/** Production CSP for packaged renderer — shared by main + packaged auth smoke. */
function packagedContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

module.exports = { packagedContentSecurityPolicy };
