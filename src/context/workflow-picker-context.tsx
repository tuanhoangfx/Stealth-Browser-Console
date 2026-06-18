import { createContext, useContext, type ReactNode } from "react";
import type { WorkflowConfig, WorkflowId } from "../features/workflows/workflow-types";

/** Workflow picker — rail + directory list (Profiles tab rail, Scripts left pane). */
export type WorkflowPickerContextValue = {
  workflowConfigs: WorkflowConfig[];
  activeWorkflow: WorkflowId;
  setActiveWorkflow: (id: WorkflowId) => void;
  selectedWorkflowIds: WorkflowId[];
  setSelectedWorkflowIds: (ids: WorkflowId[] | ((current: WorkflowId[]) => WorkflowId[])) => void;
  workflowSearch: string;
  setWorkflowSearch: (value: string) => void;
  workflowGroupFilters: string[];
  setWorkflowGroupFilters: (values: string[]) => void;
  workflowPlatformFilters: string[];
  setWorkflowPlatformFilters: (values: string[]) => void;
  filteredWorkflows: WorkflowConfig[];
  selectedWorkflowConfigs: WorkflowConfig[];
  workflowTablePageSize: number;
  setWorkflowTablePageSize: (size: number) => void;
  selectedWorkflowCount: number;
  visibleWorkflowSteps: number;
  builtinWorkflows: WorkflowConfig[];
  selectScriptWorkflow: (workflowId: WorkflowId) => void;
};

const WorkflowPickerContext = createContext<WorkflowPickerContextValue | null>(null);

export function WorkflowPickerProvider({
  value,
  children,
}: {
  value: WorkflowPickerContextValue;
  children: ReactNode;
}) {
  return <WorkflowPickerContext.Provider value={value}>{children}</WorkflowPickerContext.Provider>;
}

export function useWorkflowPicker() {
  const value = useContext(WorkflowPickerContext);
  if (!value) throw new Error("useWorkflowPicker must be used within StealthAppProviders");
  return value;
}
