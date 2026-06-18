import { HubLoaderRoot } from "@tool-workspace/hub-ui";
import { lazy, memo, Suspense, useMemo, type ReactNode, type RefObject } from "react";
import { StealthHubShellSidebar } from "./StealthHubShellSidebar";
import { StealthTabHeaderActions } from "./StealthTabHeaderActions";
import { useStealthShell } from "../context/stealth-shell-context";
import type { StealthScreen } from "../lib/stealth-screen";
import { ViewChunkErrorBoundary } from "../ui/ViewChunkErrorBoundary";

const ProfilesView = lazy(() => import("../views/ProfilesView").then((m) => ({ default: m.ProfilesView })));
const WorkflowView = lazy(() => import("../views/WorkflowView").then((m) => ({ default: m.WorkflowView })));
const SystemView = lazy(() => import("../views/SystemView").then((m) => ({ default: m.SystemView })));

function ViewLoadingFallback() {
  return <div className="view-loading-fallback p-4 text-sm text-[var(--muted)]">Loading…</div>;
}

function ScreenPanel({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      hidden={!active}
      className={active ? "flex min-h-0 flex-1 flex-col overflow-hidden" : undefined}
      aria-hidden={!active}
    >
      {children}
    </div>
  );
}

export const StealthAppShell = memo(function StealthAppShell({
  visited,
  mainRef
}: {
  visited: Set<StealthScreen>;
  mainRef: RefObject<HTMLElement | null>;
}) {
  const { view, setView, refreshProfiles, syncBusy, engineStatus } = useStealthShell();
  const headerActions = useMemo(
    () => <StealthTabHeaderActions screen={view} />,
    [view]
  );

  return (
    <div className="hub-app theme-hub stealth-hub-app flex h-full min-h-0 min-h-dvh w-full overflow-hidden">
      <StealthHubShellSidebar
        screen={view}
        onNavigate={setView}
        onRefresh={() => void refreshProfiles()}
        refreshBusy={syncBusy}
      />
      <main
        ref={mainRef}
        className={`hub-main stealth-hub-main hub-main--${view} flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden`}
      >
        <HubLoaderRoot mainRef={mainRef} />
        <div className="stealth-console-screens flex min-h-0 flex-1 flex-col">
          <Suspense fallback={<ViewLoadingFallback />}>
            {visited.has("profiles") ? (
              <ScreenPanel active={view === "profiles"}>
                <ViewChunkErrorBoundary viewName="Profiles">
                  <ProfilesView headerActions={headerActions} engineStatus={engineStatus} />
                </ViewChunkErrorBoundary>
              </ScreenPanel>
            ) : null}
            {visited.has("workflow") ? (
              <ScreenPanel active={view === "workflow"}>
                <ViewChunkErrorBoundary viewName="Workflow">
                  <WorkflowView headerActions={headerActions} />
                </ViewChunkErrorBoundary>
              </ScreenPanel>
            ) : null}
            {visited.has("system") ? (
              <ScreenPanel active={view === "system"}>
                <ViewChunkErrorBoundary viewName="System">
                  <SystemView />
                </ViewChunkErrorBoundary>
              </ScreenPanel>
            ) : null}
          </Suspense>
        </div>
      </main>
    </div>
  );
});
