import { createClient } from "@supabase/supabase-js";
import { WorkspaceAuthGate, createWorkspaceAuthGate, HubAuthBrandIcon } from "@tool-workspace/hub-ui";
import { toolSvgIcon } from "../../lib/visual";
import {
  HUB_SUPABASE_ANON_KEY,
  HUB_SUPABASE_URL,
  isHubSupabaseConfigured,
} from "../../lib/hub-supabase-env";

type Props = {
  onAuthed?: () => void;
};

/**
 * HUB_UI_SCAFFOLD — auth-gate adapter (modal-only · WorkspaceAuthGate factory).
 * Canonical UI: packages/hub-ui/src/auth/HubAuthGateModal.tsx
 * Wire onSubmit to your Supabase / hub-identity session — see P0004 HubAuthGate or P0016 ChatCenterAuthGate.
 */
export function GoldenAuthGateAdapter({ onAuthed }: Props) {
  return (
    <WorkspaceAuthGate
      {...createWorkspaceAuthGate({
        code: "P00XX",
        headerLeading: <HubAuthBrandIcon src={toolSvgIcon({ code: "P00XX" }) ?? "/icons/tools/P00XX.svg"} />,
        onAuthed,
        onSubmit: async (login, password, mode) => {
          void login;
          void password;
          void mode;
          return { error: "Wire onSubmit — see P0004 HubAuthGate or P0016 ChatCenterAuthGate" };
        },
        forgotPassword: {
          isHubConfigured: () => isHubSupabaseConfigured,
          resetPasswordForEmail: async (authEmail, redirectTo) => {
            const hub = createClient(HUB_SUPABASE_URL, HUB_SUPABASE_ANON_KEY);
            return hub.auth.resetPasswordForEmail(authEmail, { redirectTo });
          },
        },
      })}
    />
  );
}
