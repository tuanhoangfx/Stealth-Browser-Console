import { WorkspaceAuthGate, createWorkspaceAuthGate, HubAuthBrandIcon } from "@tool-workspace/hub-ui";
import {
  createWorkspaceAuthGateHubEnvPartial,
  createWorkspaceAuthGateHubForgotPasswordFromEnv,
} from "@tool-workspace/hub-identity";
import { STEALTH_BRAND_ICON } from "../../lib/stealth-product";
import { hubAuthEnv } from "../../lib/hub-supabase-env";
import { getIdentitySupabase, applyHubIdentitySession } from "../../lib/supabase-identity";
import { useStealthAuth } from "./AuthSessionProvider";

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
          env: hubAuthEnv,
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
        forgotPassword: createWorkspaceAuthGateHubForgotPasswordFromEnv({ env: hubAuthEnv }),
      })}
    />
  );
}
