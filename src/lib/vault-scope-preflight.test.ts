import { describe, expect, it, vi, afterEach } from "vitest";
import {
  isIncompleteVaultScopeStub,
  preflightVaultUserScope,
  workflowStepsNeedMailCredentials,
} from "./vault-scope-preflight";

describe("vault-scope-preflight", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects gmail and outlook placeholders", () => {
    expect(workflowStepsNeedMailCredentials([{ value: "{{gmailEmail}}" }])).toBe(true);
    expect(workflowStepsNeedMailCredentials([{ value: "{{outlookEmail}}" }])).toBe(true);
    expect(workflowStepsNeedMailCredentials([{ value: "hello" }])).toBe(false);
    expect(workflowStepsNeedMailCredentials([])).toBe(false);
  });

  it("detects incomplete web-mock stubs", () => {
    expect(isIncompleteVaultScopeStub({ ok: false, error: "Web mock stub: getVaultUserScope" })).toBe(true);
    expect(isIncompleteVaultScopeStub({ ok: false })).toBe(true);
    expect(
      isIncompleteVaultScopeStub({
        ok: false,
        scopeError: "Vault user scope missing",
        scopeEmail: null,
        devScope: false,
      }),
    ).toBe(false);
  });

  it("soft-skips incomplete stubs so Gmail Launch is not blocked", async () => {
    vi.stubGlobal("window", {
      stealthApi: {
        getVaultUserScope: async () => ({ ok: false, error: "Web mock stub: getVaultUserScope" }),
      },
    });
    const result = await preflightVaultUserScope();
    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/skipped/i);
  });

  it("allows devScope even without scopeEmail", async () => {
    vi.stubGlobal("window", {
      stealthApi: {
        getVaultUserScope: async () => ({
          ok: false,
          scopeEmail: null,
          scopeError: "pending",
          devScope: true,
        }),
      },
    });
    const result = await preflightVaultUserScope();
    expect(result.ok).toBe(true);
    expect(result.scopeEmail).toBe("czpgo@outlook.com");
  });

  it("blocks packaged missing Hub scope", async () => {
    vi.stubGlobal("window", {
      stealthApi: {
        getVaultUserScope: async () => ({
          ok: false,
          scopeEmail: null,
          scopeError: "Vault user scope missing — sign in",
          devScope: false,
        }),
      },
    });
    const result = await preflightVaultUserScope();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/blocked Script fill/i);
  });
});
