import { HubDesktopAccessDeniedScreen, HubDesktopAuthBootScreen } from "@tool-workspace/hub-ui";
import { STEALTH_BRAND_ICON, STEALTH_PRODUCT } from "../../lib/stealth-product";
import { useStealthAuth } from "./AuthSessionProvider";

export function StealthAuthBootScreen() {
  return (
    <HubDesktopAuthBootScreen
      toolName={STEALTH_PRODUCT.name}
      brandIcon={STEALTH_BRAND_ICON}
    />
  );
}

export function StealthAccessDeniedScreen() {
  const auth = useStealthAuth();
  return (
    <HubDesktopAccessDeniedScreen
      toolName={STEALTH_PRODUCT.name}
      brandIcon={STEALTH_BRAND_ICON}
      auth={auth}
      message="Ask a workspace admin to grant P0003 access in Tool Hub → Users, then check access again (or sign out and sign in)."
    />
  );
}
