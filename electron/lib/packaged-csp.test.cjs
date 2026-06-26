const { test } = require("node:test");
const assert = require("node:assert/strict");
const { packagedContentSecurityPolicy } = require("./packaged-csp.cjs");

test("packaged CSP allows Hub Supabase auth", () => {
  const policy = packagedContentSecurityPolicy();
  assert.match(policy, /connect-src[^;]*https:\/\/\*\.supabase\.co/);
  assert.match(policy, /wss:\/\/\*\.supabase\.co/);
});
