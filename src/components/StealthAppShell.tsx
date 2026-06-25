import { HubLoaderRoot } from "@tool-workspace/hub-ui";
import { lazy, memo, Suspense, useMemo, useState, type ReactNode, type RefObject } from "react";
import { StealthHubShellSidebar } from "./StealthHubShellSidebar";
import { StealthScreenLoadingView } from "./StealthScreenLoadingView";
import { StealthTabHeaderActions } from "./StealthTabHeaderActions";
import { StealthAuthGate } from "../features/auth/StealthAuthGate";
import { StealthAccessDeniedScreen, StealthAuthBootScreen } from "../features/auth/StealthAuthScreens";
import { useStealthAuth } from "../features/auth/AuthSessionProvider";
import { isStealthHubAuthEnabled } from "../lib/stealth-auth-policy";
import { isOfflineWorkspaceSession } from "../lib/offlineMode";
import { useStealthShell } from "../context/stealth-shell-context";
import type { StealthScreen } from "../lib/stealth-screen";
import { ViewChunkErrorBoundary } from "../ui/ViewChunkErrorBoundary";

type StealthEngineStatus = "checking" | "ready" | "offline";

const ProfilesView = lazy(() => import("../views/ProfilesView").then((m) => ({ default: m.ProfilesView })));
const WorkflowView = lazy(() => import("../views/WorkflowView").then((m) => ({ default: m.WorkflowView })));
const SystemView = lazy(() => import("../views/SystemView").then((m) => ({ default: m.SystemView })));

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

function StealthConsoleScreens({
  visited,
  view,
  headerActions,
  engineStatus,
}: {
  visited: Set<StealthScreen>;
  view: StealthScreen;
  headerActions: ReactNode;
  engineStatus: StealthEngineStatus;
}) {
  return (
    <div className="stealth-console-screens flex min-h-0 flex-1 flex-col">
      {visited.has("profiles") ? (
        <ScreenPanel active={view === "profiles"}>
          <Suspense fallback={<StealthScreenLoadingView screen="profiles" enabled={view === "profiles"} />}>
            <ViewChunkErrorBoundary viewName="Profiles">
              <ProfilesView headerActions={headerActions} engineStatus={engineStatus} />
            </ViewChunkErrorBoundary>
          </Suspense>
        </ScreenPanel>
      ) : null}
      {visited.has("workflow") ? (
        <ScreenPanel active={view === "workflow"}>
          <Suspense fallback={<StealthScreenLoadingView screen="workflow" enabled={view === "workflow"} />}>
            <ViewChunkErrorBoundary viewName="Workflow">
              <WorkflowView headerActions={headerActions} />
            </ViewChunkErrorBoundary>
          </Suspense>
        </ScreenPanel>
      ) : null}
      {visited.has("system") ? (
        <ScreenPanel active={view === "system"}>
          <Suspense fallback={<StealthScreenLoadingView screen="system" enabled={view === "system"} />}>
            <ViewChunkErrorBoundary viewName="System">
              <SystemView />
            </ViewChunkErrorBoundary>
          </Suspense>
        </ScreenPanel>
      ) : null}
    </div>
  );
}

export const StealthAppShell = memo(function StealthAppShell({
  visited,
  mainRef,
}: {
  visited: Set<StealthScreen>;
  mainRef: RefObject<HTMLElement | null>;
}) {
  const hubAuthEnabled = isStealthHubAuthEnabled();
  const { session, offline, authRequired, policyReady, loading, toolAccess, hubConfigured, prepareHubSignIn } =
    useStealthAuth();
  const [hubSignInRequested, setHubSignInRequested] = useState(false);
  const { view, setView, refreshProfiles, syncBusy, engineStatus } = useStealthShell();

  const headerActions = useMemo(() => <StealthTabHeaderActions screen={view} />, [view]);

  const hasRealHubSession = !isOfflineWorkspaceSession(session, offline);

  const needsSignIn =
    hubAuthEnabled && !hasRealHubSession && (hubSignInRequested || authRequired);

  const consoleScreens = (
    <StealthConsoleScreens
      visited={visited}
      view={view}
      headerActions={headerActions}
      engineStatus={engineStatus}
    />
  );

  let mainContent: ReactNode;
  if (!hubAuthEnabled || !hubConfigured) {
    mainContent = consoleScreens;
  } else if (authRequired && (!policyReady || loading) && !hasRealHubSession) {
    mainContent = (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <StealthAuthBootScreen />
      </div>
    );
  } else if (needsSignIn) {
    mainContent = (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <StealthAuthGate onAuthed={() => setHubSignInRequested(false)} />
      </div>
    );
  } else if (hasRealHubSession && toolAccess === false) {
    mainContent = (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <StealthAccessDeniedScreen />
      </div>
    );
  } else {
    mainContent = consoleScreens;
  }

  return (
    <div className="hub-app theme-hub stealth-hub-app flex h-full min-h-0 min-h-dvh w-full overflow-hidden">
      <StealthHubShellSidebar
        screen={view}
        onNavigate={setView}
        onRefresh={() => void refreshProfiles()}
        refreshBusy={syncBusy}
        onRequestHubSignIn={
          hubAuthEnabled
            ? () => {
                prepareHubSignIn();
                setHubSignInRequested(true);
              }
            : undefined
        }
      />
      <main
        ref={mainRef}
        className={`hub-main stealth-hub-main hub-main--${view} flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden`}
      >
        <HubLoaderRoot mainRef={mainRef} />
        {mainContent}
      </main>
    </div>
  );
});
