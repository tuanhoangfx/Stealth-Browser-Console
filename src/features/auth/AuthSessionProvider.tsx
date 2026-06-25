import { createAuthSessionProvider } from "@tool-workspace/hub-ui";
import { useStealthAuthState, type StealthAuthState } from "./useStealthAuthState";

export const { AuthSessionProvider, useAuth: useStealthAuth } = createAuthSessionProvider<StealthAuthState>(
  useStealthAuthState,
  "useStealthAuth",
);
