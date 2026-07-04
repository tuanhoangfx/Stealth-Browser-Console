import { hubSessionLabels } from "@tool-workspace/hub-identity";
import { HubAccessDeniedPanel, HubAuthBootPanel, HubAuthBrandIcon } from "@tool-workspace/hub-ui";
import { STEALTH_BRAND_ICON, STEALTH_PRODUCT } from "../../lib/stealth-product";
import { useStealthAuth } from "./AuthSessionProvider";

const TOOL_INFO = { name: STEALTH_PRODUCT.name };

export function StealthAuthBootScreen() {
  return (
    <HubAuthBootPanel
      title="Welcome to Stealth Browser Console"
      toolInfo={TOOL_INFO}
      headerLeading={<HubAuthBrandIcon src={STEALTH_BRAND_ICON} />}
      status="Checking workspace session…"
    />
  );
}

export function StealthAccessDeniedScreen() {
  const { session, signOut } = useStealthAuth();
  const labels = hubSessionLabels(session);

  return (
    <HubAccessDeniedPanel
      title="No access to Stealth Browser Console"
      toolInfo={TOOL_INFO}
      headerLeading={<HubAuthBrandIcon src={STEALTH_BRAND_ICON} />}
      signedInAs={labels.email || labels.loginId || session?.user?.email || undefined}
      message="Ask a workspace admin to grant P0003 access in Tool Hub → Users, then sign in again."
      onSignOut={() => void signOut()}
    />
  );
}
