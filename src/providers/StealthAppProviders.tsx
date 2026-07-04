import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { WorkflowEditorProvider } from "../context/workflow-editor-context";
import { WorkflowPickerProvider } from "../context/workflow-picker-context";
import { WorkflowRuntimeProvider } from "../context/workflow-runtime-context";
import { StealthShellProvider } from "../context/stealth-shell-context";
import { fetchEngineHealth } from "../api";
import type { StealthScreen } from "../lib/stealth-screen";
import type { StealthWorkflowTab } from "../lib/stealth-workflow-tab";
import { STEALTH_CONSOLE_THEME_KEY, readStoredThemeMode, syncDocumentTheme, type StealthTheme } from "../theme";
import { ProfilesRuntimeProvider, useProfilesRuntime } from "./ProfilesRuntimeProvider";
import { useStealthWorkflowStack } from "./useStealthWorkflowStack";

export { useProfilesRuntime } from "./ProfilesRuntimeProvider";

function StealthShellBridge({
  view,
  setView,
  workflowTab,
  setWorkflowTab,
  theme,
  setTheme,
  children,
}: {
  view: StealthScreen;
  setView: (view: StealthScreen) => void;
  workflowTab: StealthWorkflowTab;
  setWorkflowTab: (tab: StealthWorkflowTab) => void;
  theme: StealthTheme;
  setTheme: (theme: StealthTheme) => void;
  children: ReactNode;
}) {
  const { refreshProfiles, syncBusy } = useProfilesRuntime();
  const [engineStatus, setEngineStatus] = useState<"checking" | "ready" | "offline">("checking");

  const refreshBoot = useCallback(async () => {
    await refreshProfiles();
    try {
      const health = await fetchEngineHealth();
      setEngineStatus(health.ok ? "ready" : "offline");
    } catch {
      setEngineStatus("offline");
    }
  }, [refreshProfiles]);

  useEffect(() => {
    void refreshBoot();
  }, [refreshBoot]);

  const openWorkflowStore = useCallback(() => {
    setWorkflowTab("store");
    setView("workflow");
  }, [setView, setWorkflowTab]);

  const shellValue = useMemo(
    () => ({
      view,
      setView,
      workflowTab,
      setWorkflowTab,
      openWorkflowStore,
      theme,
      setTheme,
      engineStatus,
      refreshProfiles: refreshBoot,
      syncBusy,
    }),
    [view, setView, workflowTab, setWorkflowTab, openWorkflowStore, theme, setTheme, engineStatus, refreshBoot, syncBusy],
  );

  return <StealthShellProvider value={shellValue}>{children}</StealthShellProvider>;
}

function StealthWorkflowProviders({
  view,
  setView,
  children,
}: {
  view: StealthScreen;
  setView: (view: StealthScreen) => void;
  children: ReactNode;
}) {
  const { profiles, selectedProfiles, appendAutomationRun } = useProfilesRuntime();
  const { workflowPicker, workflowEditor, workflowRuntime } = useStealthWorkflowStack({
    view,
    setView,
    profiles,
    selectedProfiles,
    appendAutomationRun,
  });

  const runtime = <WorkflowRuntimeProvider value={workflowRuntime}>{children}</WorkflowRuntimeProvider>;

  return (
    <WorkflowPickerProvider value={workflowPicker}>
      <WorkflowEditorProvider value={workflowEditor}>{runtime}</WorkflowEditorProvider>
    </WorkflowPickerProvider>
  );
}

export function StealthAppProviders({
  view,
  setView,
  workflowTab,
  setWorkflowTab,
  visited,
  children,
}: {
  view: StealthScreen;
  setView: (view: StealthScreen) => void;
  workflowTab: StealthWorkflowTab;
  setWorkflowTab: (tab: StealthWorkflowTab) => void;
  visited: Set<StealthScreen>;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<StealthTheme>(() => readStoredThemeMode());

  const setTheme = useCallback((next: StealthTheme) => {
    setThemeState(next);
    localStorage.setItem(STEALTH_CONSOLE_THEME_KEY, next);
    syncDocumentTheme(next);
  }, []);

  return (
    <ProfilesRuntimeProvider view={view}>
      <StealthShellBridge
        view={view}
        setView={setView}
        workflowTab={workflowTab}
        setWorkflowTab={setWorkflowTab}
        theme={theme}
        setTheme={setTheme}
      >
        <StealthWorkflowProviders view={view} setView={setView}>
          {children}
        </StealthWorkflowProviders>
      </StealthShellBridge>
    </ProfilesRuntimeProvider>
  );
}
