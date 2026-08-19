import { WorkspaceAuthGate, createWorkspaceAuthGate, HubAuthBrandIcon } from "@tool-workspace/hub-ui";
import {
  createHubOnlyAuthGateSubmit,
  createWorkspaceAuthGateHubEnvPartial,
  createWorkspaceAuthGateHubForgotPasswordFromEnv,
} from "@tool-workspace/hub-identity";
import { STEALTH_BRAND_ICON } from "../../lib/stealth-product";
import { hubAuthEnv } from "../../lib/hub-supabase-env";
import { getIdentitySupabase, applyHubIdentitySession, persistHubSession } from "../../lib/supabase-identity";
import { useStealthAuth } from "./AuthSessionProvider";

type Props = {
  onAuthed?: () => void;
};

export function StealthAuthGate({ onAuthed }: Props) {
  const { refreshSession, prepareHubSignIn } = useStealthAuth();

  return (
    <WorkspaceAuthGate
      {...createWorkspaceAuthGate({
        code: "P0003",
        tagline: "",
        headerLeading: <HubAuthBrandIcon src={STEALTH_BRAND_ICON} />,
        onAuthed: () => {
          void refreshSession();
          onAuthed?.();
        },
        ...createWorkspaceAuthGateHubEnvPartial({
          env: hubAuthEnv,
          getHubClient: getIdentitySupabase,
          prepareHubIdentitySession: applyHubIdentitySession,
        }),
        onSubmit: createHubOnlyAuthGateSubmit({
          getHubClient: getIdentitySupabase,
          persistSession: (session) => {
            prepareHubSignIn();
            persistHubSession(session);
          },
        }),
        forgotPassword: createWorkspaceAuthGateHubForgotPasswordFromEnv({ env: hubAuthEnv }),
      })}
    />
  );
}
