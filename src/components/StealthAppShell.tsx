import {
  HubLoaderRoot,
  HubVisitedTabPanel,
  hubMainShellClassFromManifest,
  type ToolManifestUiShell,
} from "@tool-workspace/hub-ui";
import { lazy, memo, Suspense, useLayoutEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { StealthHubShellSidebar } from "./StealthHubShellSidebar";
import { StealthScreenLoadingView } from "./StealthScreenLoadingView";
import { StealthTabHeaderActions } from "./StealthTabHeaderActions";
import { resolveWorkspaceAuthPaint } from "@tool-workspace/hub-identity";
import { StealthAuthGate } from "../features/auth/StealthAuthGate";
import { StealthAccessDeniedScreen, StealthAuthBootScreen } from "../features/auth/StealthAuthScreens";
import { useStealthAuth } from "../features/auth/AuthSessionProvider";
import { isStealthHubAuthEnabled } from "../lib/stealth-auth-policy";
import { isOfflineWorkspaceSession } from "../lib/offlineMode";
import { useStealthShell } from "../context/stealth-shell-context";
import type { StealthAndroidTab } from "../lib/stealth-android-tab";
import type { StealthScreen } from "../lib/stealth-screen";
import type { StealthSystemTab } from "../lib/stealth-system-tab";
import type { StealthWorkflowTab } from "../lib/stealth-workflow-tab";
import { ViewChunkErrorBoundary } from "../ui/ViewChunkErrorBoundary";
import { AndroidProfilesView } from "../views/AndroidProfilesView";
import { MobileFarmView } from "../views/MobileFarmView";
import { ProfilesView } from "../views/ProfilesView";
import { SystemView } from "../views/SystemView";
import toolManifest from "../../tool.manifest.json";

type StealthEngineStatus = "checking" | "ready" | "offline";

const WorkflowView = lazy(() => import("../views/WorkflowView").then((m) => ({ default: m.WorkflowView })));
const WorkflowStoreView = lazy(() => import("../views/WorkflowStoreView").then((m) => ({ default: m.WorkflowStoreView })));

type StealthVisitedPanelId =
  | "profiles"
  | "android:profiles"
  | "android:farm"
  | "workflow:editor"
  | "workflow:store"
  | "system";

const STEALTH_VISITED_PANEL_CLASS = "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden";

function resolveStealthPanelId(
  view: StealthScreen,
  androidTab: StealthAndroidTab,
  workflowTab: StealthWorkflowTab,
): StealthVisitedPanelId {
  if (view === "android") return androidTab === "farm" ? "android:farm" : "android:profiles";
  if (view === "workflow") return workflowTab === "store" ? "workflow:store" : "workflow:editor";
  if (view === "system") return "system";
  return "profiles";
}

function StealthConsoleScreens({
  visited,
  view,
  androidTab,
  systemTab,
  workflowTab,
  headerActions,
  engineStatus,
}: {
  visited: Set<StealthScreen>;
  view: StealthScreen;
  androidTab: StealthAndroidTab;
  systemTab: StealthSystemTab;
  workflowTab: StealthWorkflowTab;
  headerActions: ReactNode;
  engineStatus: StealthEngineStatus;
}) {
  const activePanelId = resolveStealthPanelId(view, androidTab, workflowTab);
  const [visitedPanels, setVisitedPanels] = useState<Set<StealthVisitedPanelId>>(() => {
    const seed = new Set<StealthVisitedPanelId>([activePanelId]);
    if (visited.has("profiles")) seed.add("profiles");
    if (visited.has("workflow")) seed.add("workflow:editor");
    return seed;
  });

  useLayoutEffect(() => {
    setVisitedPanels((prev) => {
      if (prev.has(activePanelId)) return prev;
      return new Set(prev).add(activePanelId);
    });
  }, [activePanelId]);

  const effectiveVisitedPanels = useMemo(() => {
    const next = new Set(visitedPanels);
    next.add(activePanelId);
    if (visited.has("profiles")) next.add("profiles");
    if (visited.has("workflow")) next.add("workflow:editor");
    return next;
  }, [activePanelId, visited, visitedPanels]);

  return (
    <div className="stealth-console-screens flex min-h-0 flex-1 flex-col">
      <HubVisitedTabPanel
        tabId="profiles"
        active={view === "profiles"}
        visited={effectiveVisitedPanels}
        className={STEALTH_VISITED_PANEL_CLASS}
        dataScreen="profiles"
      >
        <Suspense fallback={<StealthScreenLoadingView screen="profiles" enabled={view === "profiles"} />}>
          <ViewChunkErrorBoundary viewName="Profiles">
            <ProfilesView headerActions={headerActions} engineStatus={engineStatus} />
          </ViewChunkErrorBoundary>
        </Suspense>
      </HubVisitedTabPanel>
      <HubVisitedTabPanel
        tabId="android:profiles"
        active={view === "android" && androidTab === "profiles"}
        visited={effectiveVisitedPanels}
        className={STEALTH_VISITED_PANEL_CLASS}
        dataScreen="android:profiles"
      >
        <Suspense fallback={<StealthScreenLoadingView screen="android" enabled={view === "android" && androidTab === "profiles"} />}>
          <ViewChunkErrorBoundary viewName="Android">
            <AndroidProfilesView headerActions={headerActions} />
          </ViewChunkErrorBoundary>
        </Suspense>
      </HubVisitedTabPanel>
      <HubVisitedTabPanel
        tabId="android:farm"
        active={view === "android" && androidTab === "farm"}
        visited={effectiveVisitedPanels}
        className={STEALTH_VISITED_PANEL_CLASS}
        dataScreen="android:farm"
      >
        <Suspense fallback={<StealthScreenLoadingView screen="android" enabled={view === "android" && androidTab === "farm"} />}>
          <ViewChunkErrorBoundary viewName="Mobile Farm">
            <MobileFarmView headerActions={headerActions} />
          </ViewChunkErrorBoundary>
        </Suspense>
      </HubVisitedTabPanel>
      <HubVisitedTabPanel
        tabId="workflow:editor"
        active={view === "workflow" && workflowTab === "editor"}
        visited={effectiveVisitedPanels}
        className={STEALTH_VISITED_PANEL_CLASS}
        dataScreen="workflow:editor"
      >
        <Suspense fallback={<StealthScreenLoadingView screen="workflow" enabled={view === "workflow" && workflowTab === "editor"} />}>
          <ViewChunkErrorBoundary viewName="Workflow">
            <WorkflowView headerActions={headerActions} />
          </ViewChunkErrorBoundary>
        </Suspense>
      </HubVisitedTabPanel>
      <HubVisitedTabPanel
        tabId="workflow:store"
        active={view === "workflow" && workflowTab === "store"}
        visited={effectiveVisitedPanels}
        className={STEALTH_VISITED_PANEL_CLASS}
        dataScreen="workflow:store"
      >
        <Suspense fallback={<StealthScreenLoadingView screen="workflow" enabled={view === "workflow" && workflowTab === "store"} />}>
          <ViewChunkErrorBoundary viewName="Workflow Store">
            <WorkflowStoreView headerActions={headerActions} />
          </ViewChunkErrorBoundary>
        </Suspense>
      </HubVisitedTabPanel>
      <HubVisitedTabPanel
        tabId="system"
        active={view === "system"}
        visited={effectiveVisitedPanels}
        className={STEALTH_VISITED_PANEL_CLASS}
        dataScreen="system"
      >
        <ViewChunkErrorBoundary viewName="System">
          <SystemView tab={systemTab} headerActions={headerActions} />
        </ViewChunkErrorBoundary>
      </HubVisitedTabPanel>
    </div>
  );
}

export const StealthAppShell = memo(function StealthAppShell({
  visited,
  mainRef,
  androidTab,
  onAndroidTabChange,
  systemTab,
  onSystemTabChange,
  workflowTab,
  onWorkflowTabChange,
}: {
  visited: Set<StealthScreen>;
  mainRef: RefObject<HTMLElement | null>;
  androidTab: StealthAndroidTab;
  onAndroidTabChange: (tab: StealthAndroidTab) => void;
  systemTab: StealthSystemTab;
  onSystemTabChange: (tab: StealthSystemTab) => void;
  workflowTab: StealthWorkflowTab;
  onWorkflowTabChange: (tab: StealthWorkflowTab) => void;
}) {
  const hubAuthEnabled = isStealthHubAuthEnabled();
  const { session, offline, authRequired, policyReady, loading, toolAccess, hubConfigured, prepareHubSignIn } =
    useStealthAuth();
  const [hubSignInRequested, setHubSignInRequested] = useState(false);
  const { view, setView, engineStatus } = useStealthShell();

  const headerActions = useMemo(() => <StealthTabHeaderActions screen={view} />, [view]);

  const hasRealHubSession = !isOfflineWorkspaceSession(session, offline);

  const authPaint = resolveWorkspaceAuthPaint({
    configured: hubAuthEnabled && hubConfigured,
    unconfigured: "app",
    authRequired: authRequired || hubSignInRequested,
    policyReady,
    hasSession: hasRealHubSession,
    sessionLoading: loading,
    toolAccess,
  });

  const consoleScreens = (
    <StealthConsoleScreens
      visited={visited}
      view={view}
      androidTab={androidTab}
      systemTab={systemTab}
      workflowTab={workflowTab}
      headerActions={headerActions}
      engineStatus={engineStatus}
    />
  );

  let mainContent: ReactNode = consoleScreens;
  if (authPaint === "gate") {
    mainContent = (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6">
        <StealthAuthGate onAuthed={() => setHubSignInRequested(false)} />
        {!authRequired ? (
          <button
            type="button"
            className="text-xs text-[var(--muted)] underline hover:text-[var(--text)]"
            onClick={() => setHubSignInRequested(false)}
          >
            Continue in Local Mode (without login)
          </button>
        ) : null}
      </div>
    );
  } else if (authPaint === "denied") {
    mainContent = (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <StealthAccessDeniedScreen />
      </div>
    );
  } else if (authPaint === "boot") {
    mainContent = (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <StealthAuthBootScreen />
      </div>
    );
  }

  return (
    <div className="hub-app theme-hub stealth-hub-app flex h-full min-h-0 min-h-dvh w-full overflow-hidden">
      <StealthHubShellSidebar
        screen={view}
        androidTab={androidTab}
        systemTab={systemTab}
        workflowTab={workflowTab}
        onNavigate={setView}
        onAndroidTabChange={onAndroidTabChange}
        onSystemTabChange={onSystemTabChange}
        onWorkflowTabChange={onWorkflowTabChange}
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
        className={hubMainShellClassFromManifest(
          view,
          toolManifest.uiShell as ToolManifestUiShell,
          "stealth-hub-main",
        )}
      >
        <HubLoaderRoot mainRef={mainRef} />
        {mainContent}
      </main>
    </div>
  );
});
