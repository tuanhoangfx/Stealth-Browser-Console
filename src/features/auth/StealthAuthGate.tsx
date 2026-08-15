import { WorkspaceAuthGate, createWorkspaceAuthGate, HubAuthBrandIcon } from "@tool-workspace/hub-ui";
import {
  createWorkspaceAuthGateHubEnvPartial,
  createWorkspaceAuthGateHubForgotPasswordFromEnv,
} from "@tool-workspace/hub-identity";
import { STEALTH_BRAND_ICON } from "../../lib/stealth-product";
import {
  HUB_SUPABASE_ANON_KEY,
  HUB_SUPABASE_URL,
  isHubSupabaseConfigured,
} from "../../lib/hub-supabase-env";
import { getIdentitySupabase, applyHubIdentitySession } from "../../lib/supabase-identity";
import { useStealthAuth } from "./AuthSessionProvider";

const hubEnv = { HUB_SUPABASE_URL, HUB_SUPABASE_ANON_KEY, isHubSupabaseConfigured };

type Props = {
  onAuthed?: () => void;
};

export function StealthAuthGate({ onAuthed }: Props) {
  const { signIn, prepareHubSignIn } = useStealthAuth();

  return (
    <WorkspaceAuthGate
      {...createWorkspaceAuthGate({
        code: "P0003",
        tagline: "",
        headerLeading: <HubAuthBrandIcon src={STEALTH_BRAND_ICON} />,
        onAuthed,
        ...createWorkspaceAuthGateHubEnvPartial({
          env: hubEnv,
          getHubClient: getIdentitySupabase,
          prepareHubIdentitySession: applyHubIdentitySession,
        }),
        onSubmit: async (login, password, mode) => {
          try {
            prepareHubSignIn();
            await signIn(login, password, mode);
          } catch (err) {
            return { error: err instanceof Error ? err.message : String(err) };
          }
        },
        forgotPassword: createWorkspaceAuthGateHubForgotPasswordFromEnv({ env: hubEnv }),
      })}
    />
  );
}
