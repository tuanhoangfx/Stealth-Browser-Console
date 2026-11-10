const { test } = require("node:test");
const assert = require("node:assert/strict");
const { packagedContentSecurityPolicy } = require("./packaged-csp.cjs");

test("packaged CSP allows Hub Supabase auth and local BrowserHub API", () => {
  const policy = packagedContentSecurityPolicy();
  assert.match(policy, /connect-src[^;]*http:\/\/127\.0\.0\.1:6003/);
  assert.match(policy, /connect-src[^;]*http:\/\/127\.0\.0\.1:6004/);
  assert.match(policy, /connect-src[^;]*https:\/\/hub-api\.infi\.io\.vn/);
  assert.match(policy, /wss:\/\/hub-api\.infi\.io\.vn/);
  assert.match(policy, /connect-src[^;]*https:\/\/\*\.supabase\.co/);
  assert.match(policy, /wss:\/\/\*\.supabase\.co/);
});
