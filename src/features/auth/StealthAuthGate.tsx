import { WorkspaceAuthGate, createWorkspaceAuthGate, HubAuthBrandIcon } from "@tool-workspace/hub-ui";
import {
  createHubOnlyAuthGateSubmit,
  createWorkspaceAuthGateHubEnvPartial,
  createWorkspaceAuthGateHubForgotPasswordFromEnv,
} from "@tool-workspace/hub-identity";
import { STEALTH_BRAND_ICON } from "../../lib/stealth-product";
import { useStealthAuth } from "./AuthSessionProvider";

type Props = {
  onAuthed?: () => void;
};

export function StealthAuthGate({ onAuthed }: Props) {
  const {
    hubAuthEnv,
    getHubClient,
    prepareHubIdentityClient,
    persistHubSession,
    refreshSession,
    prepareHubSignIn,
  } = useStealthAuth();

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
          getHubClient,
          prepareHubIdentitySession: prepareHubIdentityClient,
        }),
        onSubmit: createHubOnlyAuthGateSubmit({
          toolCode: "P0003",
          getHubClient,
          persistSession: (session) => {
            prepareHubSignIn();
            persistHubSession(session, "auth_gate");
          },
        }),
        forgotPassword: createWorkspaceAuthGateHubForgotPasswordFromEnv({ env: hubAuthEnv }),
      })}
    />
  );
}
