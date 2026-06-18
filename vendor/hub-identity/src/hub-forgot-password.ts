import { canUseEmailPasswordRecovery, resolveHubLogin } from "./hub-login";

export type CreateHubForgotPasswordHandlerOptions = {
  isHubConfigured: () => boolean;
  resetPasswordForEmail: (
    authEmail: string,
    redirectTo: string,
  ) => Promise<{ error?: { message: string } | null }>;
  redirectOrigin?: string;
  syntheticHint?: string;
  notConfiguredMessage?: string;
  successMessage?: string;
};

const DEFAULT_MESSAGES = {
  syntheticHint: "Link email on Tool Hub (Account), or ask an admin to reset your password.",
  notConfiguredMessage: "Tool Hub Supabase is not configured.",
  successMessage: "Check your inbox for a Hub password reset link.",
};

/** Shared forgot-password handler for golden WorkspaceAuthGate (P0004 / P0016 / P0020). */
export function createHubForgotPasswordHandler(
  options: CreateHubForgotPasswordHandlerOptions,
): (login: string) => Promise<string | void> {
  const messages = { ...DEFAULT_MESSAGES, ...options };

  return async (login: string) => {
    const resolved = resolveHubLogin(login);
    if (!resolved.isEmailLogin || !canUseEmailPasswordRecovery(resolved.authEmail)) {
      return messages.syntheticHint;
    }
    if (!options.isHubConfigured()) return messages.notConfiguredMessage;
    const origin =
      options.redirectOrigin ??
      (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "");
    const { error } = await options.resetPasswordForEmail(resolved.authEmail, `${origin}/`);
    if (error) return error.message;
    return messages.successMessage;
  };
}
