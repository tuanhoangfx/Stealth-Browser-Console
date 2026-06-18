import { createContext, useContext, type ReactNode, type RefObject } from "react";
import type { ScriptStep, ScriptStepKind } from "../types";
import type { WorkflowConfig, WorkflowId } from "../features/workflows/workflow-types";
import type { ScriptStepCategoryKey } from "../views/ScriptsView.types";

/** Script editor + workflow CRUD — isolated from picker filter state. */
export type WorkflowEditorContextValue = {
  workflowConfigs: WorkflowConfig[];
  activeWorkflow: WorkflowId;
  setActiveWorkflow: (id: WorkflowId) => void;
  activeWorkflowConfig: WorkflowConfig;
  savePulse: boolean;
  selectedScriptStepId: string;
  setSelectedScriptStepId: (id: string) => void;
  selectedScriptStep: ScriptStep | undefined;
  pendingWorkflowImportId: string;
  setPendingWorkflowImportId: (id: string) => void;
  workflowUndoStack: WorkflowConfig[][];
  workflowRedoStack: WorkflowConfig[][];
  workflowImportRef: RefObject<HTMLInputElement | null>;
  singleWorkflowImportRef: RefObject<HTMLInputElement | null>;
  scriptStepKinds: ScriptStepKind[];
  updateActiveWorkflowConfig: (patch: Partial<WorkflowConfig>) => void;
  updateActiveScriptStep: (id: string, patch: Partial<ScriptStep>) => void;
  addScriptStep: (kind: ScriptStepKind) => void;
  removeScriptStep: (id: string) => void;
  moveScriptStep: (id: string, direction: -1 | 1) => void;
  reorderScriptStepsBySortedIds: (ids: string[]) => void;
  addWorkflow: () => void;
  applyAiGeneratedWorkflow: (workflow: WorkflowConfig) => void;
  duplicateWorkflow: () => void;
  deleteActiveWorkflow: () => void;
  deleteWorkflows: (ids: string[]) => void;
  resetWorkflowsBulk: (ids: string[]) => void;
  resetWorkflows: () => void;
  exportWorkflows: () => void;
  exportWorkflow: (workflow: WorkflowConfig) => void;
  copyWorkflow: (workflow: WorkflowConfig) => void;
  resetWorkflow: (workflowId: string) => void;
  undoWorkflowChange: () => void;
  redoWorkflowChange: () => void;
  saveWorkflowChanges: () => void;
  copyWorkflowId: (id: string) => void;
  startWorkflowImport: (workflowId: string) => void;
  importSingleWorkflow: (file?: File) => void;
  importWorkflows: (file?: File) => void;
  selectScriptWorkflow: (workflowId: WorkflowId) => void;
  scriptStepHeaderGroups: { cat: ScriptStepCategoryKey; kinds: ScriptStepKind[] }[];
  scriptStepCategoryLabel: (cat: ScriptStepCategoryKey) => string;
  createStep: (kind: ScriptStepKind, patch?: Partial<ScriptStep>) => ScriptStep;
  DEFAULT_WORKFLOWS: WorkflowConfig[];
  clampConcurrency: (value: number) => number;
};

const WorkflowEditorContext = createContext<WorkflowEditorContextValue | null>(null);

export function WorkflowEditorProvider({
  value,
  children,
}: {
  value: WorkflowEditorContextValue;
  children: ReactNode;
}) {
  return <WorkflowEditorContext.Provider value={value}>{children}</WorkflowEditorContext.Provider>;
}

export function useWorkflowEditor() {
  const value = useContext(WorkflowEditorContext);
  if (!value) throw new Error("useWorkflowEditor must be used within StealthAppProviders");
  return value;
}
