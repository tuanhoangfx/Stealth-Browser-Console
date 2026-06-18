import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { WorkflowEditorProvider } from "../context/workflow-editor-context";
import { WorkflowPickerProvider } from "../context/workflow-picker-context";
import { WorkflowRuntimeProvider } from "../context/workflow-runtime-context";
import { StealthShellProvider } from "../context/stealth-shell-context";
import { fetchEngineHealth } from "../api";
import type { StealthScreen } from "../lib/stealth-screen";
import { STEALTH_CONSOLE_THEME_KEY, readStoredThemeMode, syncDocumentTheme, type StealthTheme } from "../theme";
import { ProfilesRuntimeProvider, useProfilesRuntime } from "./ProfilesRuntimeProvider";
import { useStealthWorkflowStack } from "./useStealthWorkflowStack";

export { useProfilesRuntime } from "./ProfilesRuntimeProvider";

function StealthShellBridge({
  view,
  setView,
  theme,
  setTheme,
  children,
}: {
  view: StealthScreen;
  setView: (view: StealthScreen) => void;
  theme: StealthTheme;
  setTheme: (theme: StealthTheme) => void;
  children: ReactNode;
}) {
  const { refreshProfiles, refreshHistory, syncBusy } = useProfilesRuntime();
  const [engineStatus, setEngineStatus] = useState<"checking" | "ready" | "offline">("checking");

  const refreshAll = useCallback(async () => {
    await refreshProfiles();
    try {
      const health = await fetchEngineHealth();
      setEngineStatus(health.ok ? "ready" : "offline");
    } catch {
      setEngineStatus("offline");
    }
    if (view === "workflow") {
      await refreshHistory();
    }
  }, [refreshProfiles, refreshHistory, view]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const shellValue = useMemo(
    () => ({
      view,
      setView,
      theme,
      setTheme,
      engineStatus,
      refreshProfiles: refreshAll,
      syncBusy,
    }),
    [view, setView, theme, setTheme, engineStatus, refreshAll, syncBusy],
  );

  return <StealthShellProvider value={shellValue}>{children}</StealthShellProvider>;
}

function StealthWorkflowProviders({
  view,
  setView,
  workflowEditorActive,
  children,
}: {
  view: StealthScreen;
  setView: (view: StealthScreen) => void;
  workflowEditorActive: boolean;
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
      {workflowEditorActive ? (
        <WorkflowEditorProvider value={workflowEditor}>{runtime}</WorkflowEditorProvider>
      ) : (
        runtime
      )}
    </WorkflowPickerProvider>
  );
}

export function StealthAppProviders({
  view,
  setView,
  visited,
  children,
}: {
  view: StealthScreen;
  setView: (view: StealthScreen) => void;
  visited: Set<StealthScreen>;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<StealthTheme>(() => readStoredThemeMode());
  const workflowEditorActive = visited.has("workflow");

  const setTheme = useCallback((next: StealthTheme) => {
    setThemeState(next);
    localStorage.setItem(STEALTH_CONSOLE_THEME_KEY, next);
    syncDocumentTheme(next);
  }, []);

  return (
    <ProfilesRuntimeProvider view={view}>
      <StealthShellBridge view={view} setView={setView} theme={theme} setTheme={setTheme}>
        <StealthWorkflowProviders view={view} setView={setView} workflowEditorActive={workflowEditorActive}>
          {children}
        </StealthWorkflowProviders>
      </StealthShellBridge>
    </ProfilesRuntimeProvider>
  );
}
