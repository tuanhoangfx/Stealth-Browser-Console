import { useMemo } from "react";
import { WorkspaceAuthGate, createWorkspaceAuthGate, HubToolAvatar } from "@tool-workspace/hub-ui";
import { STEALTH_BRAND_ICON, STEALTH_PRODUCT } from "../../lib/stealth-product";
import { isHubSupabaseConfigured } from "../../lib/hub-supabase-env";
import { getIdentitySupabase, applyHubIdentitySession } from "../../lib/supabase-identity";
import { useStealthAuth } from "./AuthSessionProvider";

type Props = {
  onAuthed?: () => void;
};

export function StealthAuthGate({ onAuthed }: Props) {
  const { signIn, prepareHubSignIn } = useStealthAuth();
  const profileRoleClient = useMemo(
    () => (isHubSupabaseConfigured ? (getIdentitySupabase() as ReturnType<typeof getIdentitySupabase>) : null),
    [],
  );

  return (
    <WorkspaceAuthGate
      {...createWorkspaceAuthGate({
        code: "P0003",
        headerLeading: <HubToolAvatar code={STEALTH_PRODUCT.code} size="sm" svgSrc={STEALTH_BRAND_ICON} />,
        onAuthed,
        profileRoleClient: profileRoleClient as never,
        onPrepareProfileRoleClient: async () => {
          await applyHubIdentitySession();
        },
        onSubmit: async (login, password, mode) => {
          try {
            prepareHubSignIn();
            await signIn(login, password, mode);
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        forgotPassword: {
          isHubConfigured: () => isHubSupabaseConfigured,
          resetPasswordForEmail: async (authEmail, redirectTo) => {
            const hub = getIdentitySupabase();
            if (!hub) throw new Error("Tool Hub Supabase is not configured.");
            return hub.auth.resetPasswordForEmail(authEmail, { redirectTo });
          },
        },
      })}
    />
  );
}
