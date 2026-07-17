import { describe, expect, it } from "vitest";

const {
  normalizeBrowserCode,
  resolveVaultConfig,
} = require("../../electron/lib/twofa-vault-bridge.cjs");
const {
  DEFAULT_DEV_VAULT_EMAIL,
  isVaultDevScope,
  resolveVaultScopeEmail,
  setVaultHubLoginEmail,
} = require("../../electron/lib/vault-user-scope.cjs");

describe("twofa-vault-bridge", () => {
  it("normalizes browser codes to 4 digits", () => {
    expect(normalizeBrowserCode("98")).toBe("0098");
    expect(normalizeBrowserCode("0098")).toBe("0098");
    expect(normalizeBrowserCode("1001")).toBe("1001");
  });

  it("defaults vault to Lenovo Data Box plane", () => {
    const prevLegacy = process.env.STEALTH_TWOFA_VAULT_REF;
    delete process.env.STEALTH_TWOFA_VAULT_REF;
    const config = resolveVaultConfig();
    if (prevLegacy !== undefined) process.env.STEALTH_TWOFA_VAULT_REF = prevLegacy;
    expect(config.source).toBe("lenovo-databox");
    expect(config.url).toMatch(/sb-api\.infi\.io\.vn$/);
  });
});

describe("vault-user-scope", () => {
  it("forces czpgo in dev scope", () => {
    const prevDev = process.env.STEALTH_VAULT_DEV_SCOPE;
    const prevForced = process.env.STEALTH_VAULT_SCOPE_EMAIL;
    process.env.STEALTH_VAULT_DEV_SCOPE = "1";
    delete process.env.STEALTH_VAULT_SCOPE_EMAIL;
    expect(isVaultDevScope()).toBe(true);
    expect(resolveVaultScopeEmail()).toBe(DEFAULT_DEV_VAULT_EMAIL);
    if (prevDev === undefined) delete process.env.STEALTH_VAULT_DEV_SCOPE;
    else process.env.STEALTH_VAULT_DEV_SCOPE = prevDev;
    if (prevForced === undefined) delete process.env.STEALTH_VAULT_SCOPE_EMAIL;
    else process.env.STEALTH_VAULT_SCOPE_EMAIL = prevForced;
  });

  it("uses Hub email when not in dev scope", () => {
    const prevDev = process.env.STEALTH_VAULT_DEV_SCOPE;
    const prevPackaged = process.env.STEALTH_PACKAGED;
    const prevForced = process.env.STEALTH_VAULT_SCOPE_EMAIL;
    process.env.STEALTH_VAULT_DEV_SCOPE = "0";
    process.env.STEALTH_PACKAGED = "1";
    delete process.env.STEALTH_VAULT_SCOPE_EMAIL;
    setVaultHubLoginEmail("x1e3@outlook.com");
    expect(resolveVaultScopeEmail()).toBe("x1e3@outlook.com");
    setVaultHubLoginEmail(null);
    expect(() => resolveVaultScopeEmail()).toThrow(/Vault user scope missing/);
    if (prevDev === undefined) delete process.env.STEALTH_VAULT_DEV_SCOPE;
    else process.env.STEALTH_VAULT_DEV_SCOPE = prevDev;
    if (prevPackaged === undefined) delete process.env.STEALTH_PACKAGED;
    else process.env.STEALTH_PACKAGED = prevPackaged;
    if (prevForced === undefined) delete process.env.STEALTH_VAULT_SCOPE_EMAIL;
    else process.env.STEALTH_VAULT_SCOPE_EMAIL = prevForced;
  });
});
