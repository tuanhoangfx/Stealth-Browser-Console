"use strict";

const assert = require("node:assert/strict");
const {
  DEFAULT_DEV_VAULT_EMAIL,
  isVaultDevScope,
  resolveDevVaultEmail,
  resolveVaultScopeEmail,
  setVaultHubLoginEmail,
  getVaultHubLoginEmail,
} = require("./vault-user-scope.cjs");

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

withEnv("STEALTH_VAULT_SCOPE_EMAIL", undefined, () => {
  withEnv("STEALTH_VAULT_DEV_SCOPE", "1", () => {
    withEnv("STEALTH_PACKAGED", "1", () => {
      assert.equal(isVaultDevScope(), true);
      assert.equal(resolveVaultScopeEmail(), resolveDevVaultEmail());
      assert.match(resolveDevVaultEmail(), /@/);
      assert.equal(DEFAULT_DEV_VAULT_EMAIL, "czpgo@outlook.com");
    });
  });
});

withEnv("STEALTH_VAULT_SCOPE_EMAIL", undefined, () => {
  withEnv("STEALTH_VAULT_DEV_SCOPE", "0", () => {
    withEnv("STEALTH_PACKAGED", "1", () => {
      assert.equal(isVaultDevScope(), false);
      setVaultHubLoginEmail("x1e3@outlook.com");
      assert.equal(getVaultHubLoginEmail(), "x1e3@outlook.com");
      assert.equal(resolveVaultScopeEmail(), "x1e3@outlook.com");
      setVaultHubLoginEmail(null);
      assert.throws(() => resolveVaultScopeEmail(), /Vault user scope missing/);
    });
  });
});

withEnv("STEALTH_VAULT_SCOPE_EMAIL", "tenant@example.com", () => {
  assert.equal(resolveVaultScopeEmail(), "tenant@example.com");
});

console.log("vault-user-scope.test.cjs: ok");
