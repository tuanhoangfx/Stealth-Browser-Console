import { matchesDirectoryIdSearch } from "@tool-workspace/hub-ui";
import { workflowDisplayId, workflowDisplayPlatform } from "./workflow-display";
import type { WorkflowConfig } from "./workflow-types";

export function workflowDirectoryIdText(id: string, builtinWorkflows: WorkflowConfig[]): string {
  return workflowDisplayId(id, builtinWorkflows).replace(/\D/g, "");
}

export function workflowDirectoryTextBlob(
  workflow: WorkflowConfig,
  builtinWorkflows: WorkflowConfig[],
): string {
  const platform = workflowDisplayPlatform(workflow);
  const stepText = workflow.steps.map((step) => `${step.name} ${step.kind}`).join(" ");
  return [
    workflow.id,
    workflow.name,
    workflow.description,
    workflow.group,
    platform,
    workflowDisplayId(workflow.id, builtinWorkflows),
    stepText,
  ]
    .join("\u0001")
    .toLowerCase();
}

export function matchesWorkflowDirectorySearch(
  workflow: WorkflowConfig,
  searchTerm: string,
  builtinWorkflows: WorkflowConfig[],
): boolean {
  return matchesDirectoryIdSearch(
    {
      idText: workflowDirectoryIdText(workflow.id, builtinWorkflows),
      textBlob: workflowDirectoryTextBlob(workflow, builtinWorkflows),
    },
    searchTerm,
    { mixedRequiresWhitespace: true },
  );
}
