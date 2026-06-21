import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { clampConcurrency, clampTimeout } from "../../app/constants";
import type { ScriptStep, ScriptStepKind } from "../../types";
import type { WorkflowConfig, WorkflowId } from "./workflow-types";
import {
  ACTIVE_WORKFLOW_KEY,
  createStep,
  DEFAULT_WORKFLOWS,
  hydrateWorkflowSteps,
  readStoredActiveWorkflow,
  readStoredWorkflows,
  stripObsoleteScriptSteps,
  WORKFLOWS_KEY,
  workflowExportPayload,
  workflowSteps,
  syncFirstNavigateStep
} from "./workflow-defaults";
import { newWorkflowTimestamps, touchWorkflowUpdated, ensureWorkflowTimestamps } from "./workflow-meta";
import { workflowDisplayId } from "./workflow-display";
const SCRIPT_STEP_KINDS: ScriptStepKind[] = ["navigate", "wait", "click", "type", "delay", "scroll", "screenshot", "condition", "action"];

type LogFn = (level: "info" | "success" | "error", source: string, message: string) => void;

export function useWorkflowConfig(options: { setError: (message: string) => void; addLog: LogFn }) {
  const { setError, addLog } = options;
  const [savedWorkflowConfigs, setSavedWorkflowConfigs] = useState<WorkflowConfig[]>(readStoredWorkflows);
  const [draftWorkflowConfigs, setDraftWorkflowConfigs] = useState<WorkflowConfig[]>(savedWorkflowConfigs);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowId>(readStoredActiveWorkflow);
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<WorkflowId[]>([readStoredActiveWorkflow()]);
  const [savePulse, setSavePulse] = useState(false);
  const [selectedScriptStepId, setSelectedScriptStepId] = useState<string>("");
  const [pendingWorkflowImportId, setPendingWorkflowImportId] = useState<string>("");
  const [workflowUndoStack, setWorkflowUndoStack] = useState<WorkflowConfig[][]>([]);
  const [workflowRedoStack, setWorkflowRedoStack] = useState<WorkflowConfig[][]>([]);
  const workflowImportRef = useRef<HTMLInputElement>(null);
  const singleWorkflowImportRef = useRef<HTMLInputElement>(null);

  const workflowConfigs = draftWorkflowConfigs;
  const activeWorkflowConfig =
    workflowConfigs.find((workflow) => workflow.id === activeWorkflow) || workflowConfigs[0] || DEFAULT_WORKFLOWS[0];

  useEffect(() => {
    localStorage.setItem(ACTIVE_WORKFLOW_KEY, activeWorkflow);
  }, [activeWorkflow]);

  useEffect(() => {
    const workflow = workflowConfigs.find((item) => item.id === activeWorkflow);
    if (!workflow?.steps.length) {
      if (selectedScriptStepId !== "") setSelectedScriptStepId("");
      return;
    }
    const firstId = workflow.steps[0]?.id;
    if (!firstId) return;
    if (!workflow.steps.some((step) => step.id === selectedScriptStepId) && selectedScriptStepId !== firstId) {
      setSelectedScriptStepId(firstId);
    }
  }, [activeWorkflow, selectedScriptStepId, workflowConfigs]);

  useEffect(() => {
    setDraftWorkflowConfigs((items) => {
      let changed = false;
      const next = items.map((w, index) => {
        const stamped = ensureWorkflowTimestamps(w, Date.now() - index * 86_400_000);
        if (stamped.createdAt !== w.createdAt || stamped.updatedAt !== w.updatedAt) changed = true;
        return stamped;
      });
      if (!changed) return items;
      localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    setDraftWorkflowConfigs((items) => {
      let changed = false;
      const next = items.map((w) => {
        if (stripObsoleteScriptSteps(w.steps).length === w.steps.length) return w;
        changed = true;
        const preset = DEFAULT_WORKFLOWS.find((x) => x.id === w.id)?.steps || workflowSteps(w.targetUrl || "", false);
        return { ...w, steps: hydrateWorkflowSteps(w.steps, preset, w.targetUrl || "") };
      });
      return changed ? next : items;
    });
  }, []);

  const updateActiveWorkflowConfig = useCallback((patch: Partial<WorkflowConfig>) => {
    setDraftWorkflowConfigs((items) =>
      items.map((workflow) => {
        if (workflow.id !== activeWorkflow) return workflow;
        const nextTargetUrl = patch.targetUrl ?? workflow.targetUrl;
        return touchWorkflowUpdated({
          ...workflow,
          ...patch,
          concurrency: patch.concurrency === undefined ? workflow.concurrency : clampConcurrency(Number(patch.concurrency)),
          steps: patch.targetUrl === undefined ? workflow.steps : syncFirstNavigateStep(workflow.steps, workflow.targetUrl, nextTargetUrl),
        });
      }),
    );
  }, [activeWorkflow]);

  const updateWorkflowConfigsWithHistory = useCallback((updater: (items: WorkflowConfig[]) => WorkflowConfig[]) => {
    setDraftWorkflowConfigs((items) => {
      setWorkflowUndoStack((stack) => [...stack.slice(-19), items]);
      setWorkflowRedoStack([]);
      return updater(items).map((workflow, index) =>
        workflow === items[index] ? workflow : touchWorkflowUpdated(workflow),
      );
    });
  }, []);

  const updateActiveScriptStep = useCallback((stepId: string, patch: Partial<ScriptStep>) => {
    updateWorkflowConfigsWithHistory((items) =>
      items.map((workflow) =>
        workflow.id === activeWorkflow
          ? {
              ...workflow,
              steps: workflow.steps.map((step) =>
                step.id === stepId
                  ? {
                      ...step,
                      ...patch,
                      timeoutMs: patch.timeoutMs === undefined ? step.timeoutMs : clampTimeout(Number(patch.timeoutMs))
                    }
                  : step
              )
            }
          : workflow
      )
    );
  }, [activeWorkflow, updateWorkflowConfigsWithHistory]);

  const addScriptStep = useCallback((kind: ScriptStepKind) => {
    const step = createStep(kind);
    updateWorkflowConfigsWithHistory((items) =>
      items.map((workflow) =>
        workflow.id === activeWorkflow ? { ...workflow, steps: [...workflow.steps, step] } : workflow
      )
    );
    setSelectedScriptStepId(step.id);
  }, [activeWorkflow, updateWorkflowConfigsWithHistory]);

  const removeScriptStep = useCallback((stepId: string) => {
    updateWorkflowConfigsWithHistory((items) =>
      items.map((workflow) =>
        workflow.id === activeWorkflow
          ? { ...workflow, steps: workflow.steps.filter((step) => step.id !== stepId) }
          : workflow
      )
    );
  }, [activeWorkflow, updateWorkflowConfigsWithHistory]);

  const moveScriptStep = useCallback((stepId: string, direction: -1 | 1) => {
    updateWorkflowConfigsWithHistory((items) =>
      items.map((workflow) => {
        if (workflow.id !== activeWorkflow) return workflow;
        const index = workflow.steps.findIndex((step) => step.id === stepId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= workflow.steps.length) return workflow;
        const steps = [...workflow.steps];
        const [step] = steps.splice(index, 1);
        steps.splice(nextIndex, 0, step);
        return { ...workflow, steps };
      })
    );
  }, [activeWorkflow, updateWorkflowConfigsWithHistory]);

  const reorderScriptStepsBySortedIds = useCallback((sortedIds: string[]) => {
    updateWorkflowConfigsWithHistory((items) =>
      items.map((workflow) => {
        if (workflow.id !== activeWorkflow) return workflow;
        if (sortedIds.length !== workflow.steps.length) return workflow;
        const byId = new Map(workflow.steps.map((s) => [s.id, s]));
        const next: ScriptStep[] = [];
        const seen = new Set<string>();
        for (const id of sortedIds) {
          const s = byId.get(id);
          if (!s) return workflow;
          if (seen.has(id)) return workflow;
          seen.add(id);
          next.push(s);
        }
        return { ...workflow, steps: next };
      })
    );
  }, [activeWorkflow, updateWorkflowConfigsWithHistory]);

  function createWorkflowDraft(source?: WorkflowConfig): WorkflowConfig {
    const id = `workflow-${Date.now()}`;
    if (!source) {
      return {
        id,
        name: "New Workflow",
        description: "Custom workflow script.",
        icon: "play",
        group: "Core",
        platform: "Generic",
        action: "open-url",
        targetUrl: "",
        takeScreenshot: true,
        closeWhenDone: false,
        inspectMode: false,
        concurrency: 1,
        steps: [createStep("navigate", { value: "" })],
        ...newWorkflowTimestamps(),
      };
    }

    return {
      ...source,
      id,
      name: `${source.name} Copy`,
      description: source.description,
      action: "open-url",
      targetUrl: source.targetUrl || "https://example.com",
      steps: hydrateWorkflowSteps(
        source.steps || workflowSteps(source.targetUrl || "https://example.com", true),
        workflowSteps(source.targetUrl || "https://example.com", true),
        source.targetUrl || "https://example.com"
      ).map((step) => ({ ...step, id: crypto.randomUUID() })),
      ...newWorkflowTimestamps(),
    };
  }

  const addWorkflow = useCallback(() => {
    const workflow = createWorkflowDraft();
    updateWorkflowConfigsWithHistory((items) => [...items, workflow]);
    setActiveWorkflow(workflow.id);
    setSelectedWorkflowIds([workflow.id]);
  }, [updateWorkflowConfigsWithHistory]);

  const importGeneratedWorkflow = useCallback((workflow: WorkflowConfig) => {
    updateWorkflowConfigsWithHistory((items) => [...items, workflow]);
    setActiveWorkflow(workflow.id);
    setSelectedWorkflowIds([workflow.id]);
  }, [updateWorkflowConfigsWithHistory]);

  const applyAiGeneratedWorkflow = useCallback((generated: WorkflowConfig) => {
    updateWorkflowConfigsWithHistory((items) =>
      items.map((workflow) => {
        if (workflow.id !== activeWorkflow) return workflow;
        const targetUrl = generated.targetUrl || workflow.targetUrl;
        return {
          ...workflow,
          name: generated.name || workflow.name,
          description: generated.description ?? workflow.description,
          icon: generated.icon ?? workflow.icon,
          group: generated.group ?? workflow.group,
          platform: generated.platform ?? workflow.platform,
          action: generated.action ?? workflow.action,
          targetUrl,
          takeScreenshot: generated.takeScreenshot ?? workflow.takeScreenshot,
          closeWhenDone: generated.closeWhenDone ?? workflow.closeWhenDone,
          inspectMode: generated.inspectMode ?? workflow.inspectMode,
          concurrency: generated.concurrency ?? workflow.concurrency,
          steps: generated.steps
        };
      })
    );
    const firstStepId = generated.steps[0]?.id;
    if (firstStepId) setSelectedScriptStepId(firstStepId);
  }, [activeWorkflow, updateWorkflowConfigsWithHistory]);

  const duplicateWorkflow = useCallback(() => {
    const workflow = createWorkflowDraft(activeWorkflowConfig);
    updateWorkflowConfigsWithHistory((items) => [...items, workflow]);
    setActiveWorkflow(workflow.id);
    setSelectedWorkflowIds([workflow.id]);
  }, [activeWorkflowConfig, updateWorkflowConfigsWithHistory]);

  const deleteWorkflows = useCallback((ids: string[]) => {
    const targets = ids.length > 0 ? ids : [activeWorkflow];
    const idSet = new Set(targets);
    const nextItems = workflowConfigs.filter((workflow) => !idSet.has(workflow.id));
    if (nextItems.length < 1 || nextItems.length === workflowConfigs.length) return;
    updateWorkflowConfigsWithHistory(() => nextItems);
    const nextActive = nextItems.find((workflow) => workflow.id === activeWorkflow)?.id ?? nextItems[0]?.id ?? "open-url";
    setActiveWorkflow(nextActive);
    setSelectedWorkflowIds([nextActive]);
  }, [activeWorkflow, updateWorkflowConfigsWithHistory, workflowConfigs]);

  const deleteActiveWorkflow = useCallback(() => {
    deleteWorkflows([activeWorkflow]);
  }, [activeWorkflow, deleteWorkflows]);

  const resetWorkflowsBulk = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    updateWorkflowConfigsWithHistory((items) =>
      items.map((workflow) => {
        if (!idSet.has(workflow.id)) return workflow;
        return DEFAULT_WORKFLOWS.find((item) => item.id === workflow.id) ?? workflow;
      })
    );
  }, [updateWorkflowConfigsWithHistory]);

  const resetWorkflows = useCallback(() => {
    setDraftWorkflowConfigs(DEFAULT_WORKFLOWS);
    setActiveWorkflow("open-url");
    setSelectedWorkflowIds(["open-url"]);
  }, []);

  const exportWorkflows = useCallback(() => {
    const blob = new Blob([JSON.stringify(workflowExportPayload(workflowConfigs), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `stealth-workflows-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [workflowConfigs]);

  const exportWorkflow = useCallback((workflow: WorkflowConfig) => {
    const blob = new Blob([JSON.stringify(workflowExportPayload([workflow])[0], null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${workflow.id || "workflow"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const copyWorkflow = useCallback((workflow: WorkflowConfig) => {
    const draft = createWorkflowDraft(workflow);
    setDraftWorkflowConfigs((items) => [...items, draft]);
    setActiveWorkflow(draft.id);
    setSelectedWorkflowIds([draft.id]);
  }, []);

  const resetWorkflow = useCallback((workflowId: string) => {
    const fallback = DEFAULT_WORKFLOWS.find((workflow) => workflow.id === workflowId);
    if (!fallback) return;
    updateWorkflowConfigsWithHistory((items) => items.map((workflow) => (workflow.id === workflowId ? fallback : workflow)));
  }, [updateWorkflowConfigsWithHistory]);

  const undoWorkflowChange = useCallback(() => {
    setWorkflowUndoStack((stack) => {
      const previous = stack.at(-1);
      if (!previous) return stack;
      setWorkflowRedoStack((redoStack) => [...redoStack.slice(-19), workflowConfigs]);
      setDraftWorkflowConfigs(previous);
      return stack.slice(0, -1);
    });
  }, [workflowConfigs]);

  const redoWorkflowChange = useCallback(() => {
    setWorkflowRedoStack((stack) => {
      const next = stack.at(-1);
      if (!next) return stack;
      setWorkflowUndoStack((undoStack) => [...undoStack.slice(-19), workflowConfigs]);
      setDraftWorkflowConfigs(next);
      return stack.slice(0, -1);
    });
  }, [workflowConfigs]);

  const saveWorkflowChanges = useCallback(() => {
    localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(draftWorkflowConfigs));
    setSavedWorkflowConfigs(draftWorkflowConfigs);
    setSavePulse(true);
    window.setTimeout(() => setSavePulse(false), 1200);
    addLog("success", "Workflows", "Workflow changes saved");
  }, [addLog, draftWorkflowConfigs]);

  const copyWorkflowId = useCallback(async (id: string) => {
    const displayId = workflowDisplayId(id, DEFAULT_WORKFLOWS);
    try {
      await navigator.clipboard.writeText(displayId);
      addLog("success", "Workflows", `Copied ${displayId}`);
    } catch {
      addLog("error", "Workflows", `Unable to copy ${displayId}`);
    }
  }, [addLog]);

  const startWorkflowImport = useCallback((workflowId: string) => {
    setPendingWorkflowImportId(workflowId);
    singleWorkflowImportRef.current?.click();
  }, []);

  const importSingleWorkflow = useCallback(async (file: File | undefined) => {
    if (!file || !pendingWorkflowImportId) return;
    try {
      const data = JSON.parse(await file.text()) as WorkflowConfig;
      if (!data || Array.isArray(data) || typeof data !== "object") throw new Error("Workflow JSON must be a single workflow object.");
      const url = data.targetUrl || "https://example.com";
      const preset = workflowSteps(url, true);
      const imported = {
        ...data,
        id: pendingWorkflowImportId,
        icon: data.icon || "play",
        group: data.group || "Core",
        platform: data.platform || "Generic",
        action: (data.action as string) === "set-screen-resolution-real" ? "open-url" : data.action || "open-url",
        concurrency: clampConcurrency(Number(data.concurrency || 1)),
        steps: hydrateWorkflowSteps(Array.isArray(data.steps) && data.steps.length ? (data.steps as ScriptStep[]) : [], preset, url)
      };
      setDraftWorkflowConfigs((items) => items.map((workflow) => (workflow.id === pendingWorkflowImportId ? imported : workflow)));
      setActiveWorkflow(pendingWorkflowImportId);
      setSelectedWorkflowIds([pendingWorkflowImportId]);
      addLog("success", "Workflows", `Imported workflow into ${pendingWorkflowImportId}`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Unable to import workflow JSON.");
    } finally {
      setPendingWorkflowImportId("");
      if (singleWorkflowImportRef.current) singleWorkflowImportRef.current.value = "";
    }
  }, [addLog, pendingWorkflowImportId, setError]);

  const importWorkflows = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as WorkflowConfig[];
      if (!Array.isArray(data) || data.length === 0) throw new Error("Workflow JSON must be an array.");
      const imported = data.map((workflow) => {
        const url = workflow.targetUrl || "https://example.com";
        const preset = workflowSteps(url, true);
        return {
          ...workflow,
          id: workflow.id || `workflow-${crypto.randomUUID()}`,
          icon: workflow.icon || "play",
          group: workflow.group || "Core",
          platform: workflow.platform || "Generic",
          action: (workflow.action as string) === "set-screen-resolution-real" ? "open-url" : workflow.action || "open-url",
          concurrency: clampConcurrency(Number(workflow.concurrency || 1)),
          steps: hydrateWorkflowSteps(
            Array.isArray(workflow.steps) && workflow.steps.length ? (workflow.steps as ScriptStep[]) : [],
            preset,
            url
          )
        };
      });
      setDraftWorkflowConfigs(imported);
      setActiveWorkflow(imported[0].id);
      setSelectedWorkflowIds([imported[0].id]);
      addLog("success", "Workflows", `Imported ${imported.length} workflows`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Unable to import workflow JSON.");
    } finally {
      if (workflowImportRef.current) workflowImportRef.current.value = "";
    }
  }, [addLog, setError]);

  const selectWorkflow = useCallback((workflowId: WorkflowId, event: MouseEvent<HTMLDivElement>) => {
    setActiveWorkflow(workflowId);
    if (event.ctrlKey || event.metaKey) {
      setSelectedWorkflowIds((current) => {
        const next = new Set(current);
        if (next.has(workflowId)) next.delete(workflowId);
        else next.add(workflowId);
        return Array.from(next);
      });
      return;
    }
    setSelectedWorkflowIds([workflowId]);
  }, []);

  const selectScriptWorkflow = useCallback((workflowId: WorkflowId) => {
    setActiveWorkflow(workflowId);
    setSelectedWorkflowIds([workflowId]);
  }, []);

  const selectedScriptStep =
    activeWorkflowConfig.steps.find((step) => step.id === selectedScriptStepId) || activeWorkflowConfig.steps[0];

  return {
    workflowConfigs,
    activeWorkflow,
    setActiveWorkflow,
    activeWorkflowConfig,
    selectedWorkflowIds,
    setSelectedWorkflowIds,
    savePulse,
    selectedScriptStepId,
    setSelectedScriptStepId,
    selectedScriptStep,
    pendingWorkflowImportId,
    setPendingWorkflowImportId,
    workflowUndoStack,
    workflowRedoStack,
    workflowImportRef,
    singleWorkflowImportRef,
    scriptStepKinds: SCRIPT_STEP_KINDS,
    updateActiveWorkflowConfig,
    updateActiveScriptStep,
    addScriptStep,
    removeScriptStep,
    moveScriptStep,
    reorderScriptStepsBySortedIds,
    addWorkflow,
    importGeneratedWorkflow,
    applyAiGeneratedWorkflow,
    duplicateWorkflow,
    deleteActiveWorkflow,
    deleteWorkflows,
    resetWorkflowsBulk,
    resetWorkflows,
    exportWorkflows,
    exportWorkflow,
    copyWorkflow,
    resetWorkflow,
    undoWorkflowChange,
    redoWorkflowChange,
    saveWorkflowChanges,
    copyWorkflowId,
    startWorkflowImport,
    importSingleWorkflow,
    importWorkflows,
    selectWorkflow,
    selectScriptWorkflow
  };
}
