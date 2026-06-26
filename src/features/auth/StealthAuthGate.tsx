import { useMemo } from "react";
import { WorkspaceAuthGate, createWorkspaceAuthGate } from "@tool-workspace/hub-ui";
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
        headerLeading: (
          <img
            src={STEALTH_BRAND_ICON}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 object-contain drop-shadow-[0_0_12px_rgba(56,189,248,0.35)]"
          />
        ),
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
