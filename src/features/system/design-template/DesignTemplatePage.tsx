import { HubDesignTemplateEmpty } from "@tool-workspace/hub-ui";
import { Glass } from "../../../theme/p0008";
import { ACTIVE_DESIGN_COUNT } from "./design-registry";
import { SystemLaunchPerfPanel } from "../SystemLaunchPerfPanel";
import { SystemCookieBridgePanel } from "../SystemCookieBridgePanel";

export function DesignTemplatePage() {
  return (
    <div className="design-template-page space-y-4 px-3 pb-10 pt-3">
      <Glass tone="purple">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-purple-300">System</p>
          <h1 className="mt-1 text-xl font-semibold">Design Template</h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Active reviews: <strong className="text-cyan-200">{ACTIVE_DESIGN_COUNT}</strong>
          </p>
        </div>
      </Glass>
      <SystemLaunchPerfPanel />
      <SystemCookieBridgePanel />
      <HubDesignTemplateEmpty />
    </div>
  );
}
