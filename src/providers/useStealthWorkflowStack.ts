import { useCallback, useMemo, useState } from "react";
import type { StealthScreen } from "../lib/stealth-screen";
import { useRunLogs } from "../features/runtime/RunLogsContext";
import { useStealthAutomationQueue } from "../features/runtime/useStealthAutomationQueue";
import { clampConcurrency } from "../app/constants";
import {
  DEFAULT_WORKFLOWS,
  SCRIPT_STEP_HEADER_GROUPS,
  createStep,
  scriptStepCategoryLabel
} from "../features/workflows/workflow-defaults";
import { workflowDisplayId, workflowDisplayPlatform } from "../features/workflows/workflow-display";
import { useWorkflowConfig } from "../features/workflows/useWorkflowConfig";
import { useWorkflows } from "../features/workflows/useWorkflows";
import type { WorkflowEditorContextValue } from "../context/workflow-editor-context";
import type { WorkflowPickerContextValue } from "../context/workflow-picker-context";
import type { WorkflowRuntimeContextValue } from "../context/workflow-runtime-context";
import type { ProfileRow, RunHistoryItem } from "../types";
import { executeWorkflowAction } from "../features/workflows/workflow-executors";
import type { WorkflowConfig } from "../features/workflows/workflow-types";

export function useStealthWorkflowStack({
  view,
  setView,
  profiles,
  selectedProfiles,
  appendAutomationRun,
}: {
  view: StealthScreen;
  setView: (screen: StealthScreen) => void;
  profiles: ProfileRow[];
  selectedProfiles: ProfileRow[];
  appendAutomationRun: (entry: RunHistoryItem) => void;
}) {
  const { addLog } = useRunLogs();
  const [error, setError] = useState("");

  const workflow = useWorkflowConfig({ setError, addLog });

  const workflowFilters = useWorkflows(
    workflow.workflowConfigs,
    workflow.selectedWorkflowIds,
    (id) => workflowDisplayId(id, DEFAULT_WORKFLOWS),
    workflowDisplayPlatform
  );

  const appendRunToHistory = useCallback(
    (
      result: Awaited<ReturnType<typeof executeWorkflowAction>>,
      profile: ProfileRow,
      targetUrl: string,
      wf: WorkflowConfig
    ) => {
      appendAutomationRun({
        id: result.runId || crypto.randomUUID(),
        profileId: profile.id,
        profileName: profile.name,
        workflow: wf.name,
        targetUrl,
        status: (result.ok ? "success" : "failed") as RunHistoryItem["status"],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        screenshotPath: result.screenshotPath,
        error: result.error,
        logs: result.logs.map((entry) => ({
          level: entry.level,
          message: entry.message,
          time: entry.time,
        })),
      });
    },
    [appendAutomationRun],
  );

  const runWorkflowConfigs = useMemo(
    () =>
      workflowFilters.selectedWorkflowConfigs.length > 0
        ? workflowFilters.selectedWorkflowConfigs
        : [workflow.activeWorkflowConfig],
    [workflow.activeWorkflowConfig, workflowFilters.selectedWorkflowConfigs]
  );

  const automation = useStealthAutomationQueue({
    selectedProfiles,
    runWorkflowConfigs,
    addLog,
    appendRunToHistory
  });

  const openProfilesForWorkflow = useCallback(
    (workflowId: string) => {
      workflow.setActiveWorkflow(workflowId);
      // Navigation helper: selecting a workflow should not implicitly enqueue automation.
      // Keep it as the active workflow, but do not mark it as "selected" for bulk runs.
      workflow.setSelectedWorkflowIds([]);
      setView("profiles");
    },
    [setView, workflow.setActiveWorkflow, workflow.setSelectedWorkflowIds]
  );

  const runWorkflowOnOpenProfiles = useCallback(
    async (workflowId: string) => {
      const wf = workflow.workflowConfigs.find((item) => item.id === workflowId);
      if (!wf) {
        addLog("error", "Workflow", `Workflow ${workflowId} not found.`);
        return;
      }
      const isOpen = (profile: ProfileRow) =>
        profile.status === "running" || profile.status === "opening";
      const openSelected = selectedProfiles.filter(isOpen);
      const targets = openSelected.length ? openSelected : profiles.filter(isOpen);
      if (!targets.length) {
        addLog("error", "Workflow", "No open profiles — launch a profile first.");
        return;
      }
      await automation.runBatch(targets, [wf]);
    },
    [addLog, automation, profiles, selectedProfiles, workflow.workflowConfigs],
  );

  const workflowPicker = useMemo<WorkflowPickerContextValue>(
    () => ({
      workflowConfigs: workflow.workflowConfigs,
      activeWorkflow: workflow.activeWorkflow,
      setActiveWorkflow: workflow.setActiveWorkflow,
      selectedWorkflowIds: workflow.selectedWorkflowIds,
      setSelectedWorkflowIds: workflow.setSelectedWorkflowIds,
      workflowSearch: workflowFilters.workflowSearch,
      setWorkflowSearch: workflowFilters.setWorkflowSearch,
      workflowGroupFilters: workflowFilters.workflowGroupFilters,
      setWorkflowGroupFilters: workflowFilters.setWorkflowGroupFilters,
      workflowPlatformFilters: workflowFilters.workflowPlatformFilters,
      setWorkflowPlatformFilters: workflowFilters.setWorkflowPlatformFilters,
      filteredWorkflows: workflowFilters.filteredWorkflows,
      selectedWorkflowConfigs: workflowFilters.selectedWorkflowConfigs,
      workflowTablePageSize: workflowFilters.workflowTablePageSize,
      setWorkflowTablePageSize: workflowFilters.setWorkflowTablePageSize,
      selectedWorkflowCount: workflowFilters.selectedWorkflowCount,
      visibleWorkflowSteps: workflowFilters.visibleWorkflowSteps,
      builtinWorkflows: DEFAULT_WORKFLOWS,
      selectScriptWorkflow: workflow.selectScriptWorkflow
    }),
    [workflow, workflowFilters]
  );

  const workflowEditor = useMemo<WorkflowEditorContextValue>(
    () => ({
      workflowConfigs: workflow.workflowConfigs,
      activeWorkflow: workflow.activeWorkflow,
      setActiveWorkflow: workflow.setActiveWorkflow,
      activeWorkflowConfig: workflow.activeWorkflowConfig,
      savePulse: workflow.savePulse,
      selectedScriptStepId: workflow.selectedScriptStepId,
      setSelectedScriptStepId: workflow.setSelectedScriptStepId,
      selectedScriptStep: workflow.selectedScriptStep,
      pendingWorkflowImportId: workflow.pendingWorkflowImportId,
      setPendingWorkflowImportId: workflow.setPendingWorkflowImportId,
      workflowUndoStack: workflow.workflowUndoStack,
      workflowRedoStack: workflow.workflowRedoStack,
      workflowImportRef: workflow.workflowImportRef,
      singleWorkflowImportRef: workflow.singleWorkflowImportRef,
      scriptStepKinds: workflow.scriptStepKinds,
      updateActiveWorkflowConfig: workflow.updateActiveWorkflowConfig,
      updateActiveScriptStep: workflow.updateActiveScriptStep,
      addScriptStep: workflow.addScriptStep,
      removeScriptStep: workflow.removeScriptStep,
      moveScriptStep: workflow.moveScriptStep,
      reorderScriptStepsBySortedIds: workflow.reorderScriptStepsBySortedIds,
      addWorkflow: workflow.addWorkflow,
      applyAiGeneratedWorkflow: workflow.applyAiGeneratedWorkflow,
      duplicateWorkflow: workflow.duplicateWorkflow,
      deleteActiveWorkflow: workflow.deleteActiveWorkflow,
      deleteWorkflows: workflow.deleteWorkflows,
      resetWorkflowsBulk: workflow.resetWorkflowsBulk,
      resetWorkflows: workflow.resetWorkflows,
      exportWorkflows: workflow.exportWorkflows,
      exportWorkflow: workflow.exportWorkflow,
      copyWorkflow: workflow.copyWorkflow,
      resetWorkflow: workflow.resetWorkflow,
      importWorkflows: workflow.importWorkflows,
      importSingleWorkflow: workflow.importSingleWorkflow,
      saveWorkflowChanges: workflow.saveWorkflowChanges,
      undoWorkflowChange: workflow.undoWorkflowChange,
      redoWorkflowChange: workflow.redoWorkflowChange,
      copyWorkflowId: workflow.copyWorkflowId,
      startWorkflowImport: workflow.startWorkflowImport,
      selectScriptWorkflow: workflow.selectScriptWorkflow,
      scriptStepHeaderGroups: SCRIPT_STEP_HEADER_GROUPS,
      scriptStepCategoryLabel,
      createStep,
      DEFAULT_WORKFLOWS,
      clampConcurrency
    }),
    [workflow]
  );

  const workflowRuntime = useMemo<WorkflowRuntimeContextValue>(
    () => ({
      runWorkflowConfigs: automation.runWorkflowConfigs,
      runWorkflowLabel: automation.runWorkflowLabel,
      automationRunning: automation.automationRunning,
      runAutomationQueue: automation.runAutomationQueue,
      runWorkflowOnOpenProfiles,
      openProfilesForWorkflow
    }),
    [automation, openProfilesForWorkflow, runWorkflowOnOpenProfiles]
  );

  return { workflowPicker, workflowEditor, workflowRuntime, error, view, profiles };
}
