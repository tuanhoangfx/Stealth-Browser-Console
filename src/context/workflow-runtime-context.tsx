import { createContext, useContext, type ReactNode } from "react";
import type { WorkflowConfig } from "../features/workflows/workflow-types";

/** Profiles automation queue — isolated from picker filter + script editor state. */
export type WorkflowRuntimeContextValue = {
  runWorkflowConfigs: WorkflowConfig[];
  runWorkflowLabel: string;
  automationRunning: boolean;
  runAutomationQueue: () => void;
  /** Run a single workflow on open profiles (selected running first, else any running). */
  runWorkflowOnOpenProfiles: (workflowId: string) => Promise<void>;
  openProfilesForWorkflow: (workflowId: string) => void;
};

const WorkflowRuntimeContext = createContext<WorkflowRuntimeContextValue | null>(null);

export function WorkflowRuntimeProvider({
  value,
  children,
}: {
  value: WorkflowRuntimeContextValue;
  children: ReactNode;
}) {
  return <WorkflowRuntimeContext.Provider value={value}>{children}</WorkflowRuntimeContext.Provider>;
}

export function useWorkflowRuntime() {
  const value = useContext(WorkflowRuntimeContext);
  if (!value) throw new Error("useWorkflowRuntime must be used within StealthAppProviders");
  return value;
}
