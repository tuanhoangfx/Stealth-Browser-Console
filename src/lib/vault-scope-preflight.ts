/**
 * Preflight Data Box vault tenant before Script fill ({{gmail*}} placeholders).
 * Surfaces scopeError on Console when packaged build has no Hub login.
 *
 * Must never throw — a throw aborts Launch with an empty Console.
 * Soft-skips when vault IPC is missing / web-mock gap-patched (old preload + new renderer).
 */
export function workflowStepsNeedMailCredentials(
  steps: Array<{ value?: string }> | null | undefined,
): boolean {
  return Boolean(
    steps?.some((step) =>
      /\{\{(gmail|outlook|mail)(Email|Password|Recovery|TotpCode)\}\}/i.test(String(step?.value || "")),
    ),
  );
}

export type VaultScopePreflight = {
  ok: boolean;
  scopeEmail: string | null;
  scopeError: string | null;
  devScope: boolean;
  message: string;
};

type VaultScopeIpcResult = {
  ok?: boolean;
  hubEmail?: string | null;
  scopeEmail?: string | null;
  scopeError?: string | null;
  devScope?: boolean;
  error?: string;
};

function softSkip(message: string): VaultScopePreflight {
  return {
    ok: true,
    scopeEmail: null,
    scopeError: null,
    devScope: false,
    message,
  };
}

/** Incomplete stub from buildStealthApiStubLayer / gap-patch onto live Electron. */
export function isIncompleteVaultScopeStub(scope: VaultScopeIpcResult | null | undefined): boolean {
  if (!scope || typeof scope !== "object") return true;
  if (typeof scope.error === "string" && /web mock/i.test(scope.error)) return true;
  // Real IPC always returns scopeEmail and/or scopeError (and usually hubEmail/devScope).
  const hasTenantFields =
    scope.scopeEmail != null || scope.scopeError != null || typeof scope.devScope === "boolean";
  return scope.ok === false && !hasTenantFields;
}

export async function preflightVaultUserScope(): Promise<VaultScopePreflight> {
  try {
    const api = window.stealthApi;
    if (!api?.getVaultUserScope) {
      return softSkip("Vault scope preflight skipped (no IPC) — main will resolve tenant.");
    }

    const scope = (await api.getVaultUserScope()) as VaultScopeIpcResult;
    if (isIncompleteVaultScopeStub(scope)) {
      return softSkip(
        "Vault scope preflight skipped (IPC not on this build) — restart Stealth after vault-scope update, or continue (dev uses czpgo).",
      );
    }

    // Unpackaged / STEALTH_VAULT_DEV_SCOPE — never block Launch; tenant is forced on main.
    if (scope.devScope) {
      const email = scope.scopeEmail || "czpgo@outlook.com";
      return {
        ok: true,
        scopeEmail: email,
        scopeError: null,
        devScope: true,
        message: `Data Box tenant ${email} (dev)`,
      };
    }

    if (scope.ok && scope.scopeEmail) {
      return {
        ok: true,
        scopeEmail: scope.scopeEmail,
        scopeError: null,
        devScope: false,
        message: `Data Box tenant ${scope.scopeEmail}`,
      };
    }

    const scopeError =
      scope.scopeError ||
      "Vault user scope missing — sign in to P0003 Hub first (Data Box tenant follows your Hub login).";
    return {
      ok: false,
      scopeEmail: scope.scopeEmail ?? null,
      scopeError,
      devScope: Boolean(scope.devScope),
      message: `Vault scope blocked Script fill: ${scopeError}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return softSkip(`Vault scope preflight skipped (${msg}) — main will resolve tenant.`);
  }
}
