import type { ScriptStep } from "../../types";
import type { WorkflowExecutorAction } from "./workflow-executors";

export type WorkflowId = string;
export type WorkflowIconKey = "play" | "globe" | "camera" | "shield" | "education" | "layers";
export type WorkflowAction = WorkflowExecutorAction;
export type WorkflowGroup = "Core" | "Account Check" | "Appeal";
export type WorkflowPlatform = string;

export type WorkflowConfig = {
  id: WorkflowId;
  name: string;
  description: string;
  icon: WorkflowIconKey;
  group: WorkflowGroup;
  platform: WorkflowPlatform;
  action: WorkflowAction;
  targetUrl: string;
  takeScreenshot: boolean;
  closeWhenDone: boolean;
  inspectMode: boolean;
  concurrency: number;
  steps: ScriptStep[];
  /** ISO timestamp — persisted with workflow JSON. */
  createdAt?: string;
  /** ISO timestamp — bumped on script edits. */
  updatedAt?: string;
};
