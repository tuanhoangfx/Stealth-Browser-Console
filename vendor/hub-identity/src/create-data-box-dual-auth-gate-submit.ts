/**
 * SSOT onSubmit for Data Box dual-plane WorkspaceAuthGate (≥2 hosts: P0012 / P0020).
 * HubAuthGateModal already owns mode/busy/normalize — this only returns the submit handler.
 */
import type { Session } from "@supabase/supabase-js";
import { withDevAuthTimeout } from "./dev-auto-login";
import { WORKSPACE_DUAL_SIGN_IN_TIMEOUT_MS } from "./workspace-auth-session";
import type { DataBoxDualSignInResult } from "./create-data-box-dual-sign-in";

export type WorkspaceAuthGateSubmitResult = { error?: string } | void;

export type WorkspaceAuthGateSubmit = (
  login: string,
  password: string,
  mode: "signin" | "signup",
) => Promise<WorkspaceAuthGateSubmitResult>;

export type CreateDataBoxDualAuthGateSubmitConfig = {
  signInWorkspaceDual: (
    login: string,
    password: string,
    mode: "signin" | "signup",
  ) => Promise<DataBoxDualSignInResult>;
  adoptSession: (session: Session) => void;
  /** Shown when Hub ok but data plane failed — e.g. "Performance" / "Data Box". */
  dataPlaneLabel: string;
  /** Optional detail when data plane fails with Hub ok — overrides default copy. */
  dataPlaneFailHint?: string;
  relaySessions?: (identity: Session | null, data: Session) => void;
  onBeforeAdopt?: (identity: Session | null, data: Session) => void;
  afterAdopt?: () => void | Promise<void>;
  /** P0012 fire-and-forget; P0020 awaits vault failures. Default false (await). */
  afterAdoptFireAndForget?: boolean;
  timeoutMs?: number;
};

const AUTH_TIMEOUT_MESSAGE =
  "Sign-in timed out — Tool Hub or workspace data plane is slow. Wait a moment and try again.";

export function createDataBoxDualAuthGateSubmit(
  config: CreateDataBoxDualAuthGateSubmitConfig,
): WorkspaceAuthGateSubmit {
  const timeoutMs = config.timeoutMs ?? WORKSPACE_DUAL_SIGN_IN_TIMEOUT_MS;
  const dataFailHint =
    config.dataPlaneFailHint ??
    `Tool Hub sign-in succeeded but the ${config.dataPlaneLabel} data session failed. Check the data plane status or try again.`;

  return async (login, password, mode) => {
    try {
      const { identitySession, dataSession, dataError } = await withDevAuthTimeout(
        config.signInWorkspaceDual(login, password, mode === "signup" ? "signup" : "signin"),
        timeoutMs,
      );
      if (!dataSession) {
        const detail = typeof dataError === "string" && dataError.trim() ? dataError.trim() : "";
        if (!identitySession) {
          return {
            error:
              detail ||
              (mode === "signup"
                ? "Sign-up failed on Tool Hub. Try again or use a different User ID."
                : "Sign-in failed on Tool Hub. Check User ID/email and password."),
          };
        }
        return { error: detail || dataFailHint };
      }
      config.onBeforeAdopt?.(identitySession, dataSession);
      config.adoptSession(dataSession);
      config.relaySessions?.(identitySession, dataSession);
      if (config.afterAdopt) {
        if (config.afterAdoptFireAndForget) void config.afterAdopt();
        else await config.afterAdopt();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e ?? "");
      if (msg === "AUTH_TIMEOUT" || msg.startsWith("AUTH_TIMEOUT:")) {
        return { error: AUTH_TIMEOUT_MESSAGE };
      }
      return { error: msg || "Sign-in failed." };
    }
  };
}
