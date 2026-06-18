import type { FilterDef } from "@tool-workspace/hub-ui";
import type { WorkflowConfig } from "./workflow-types";
import { workflowDisplayPlatform } from "./workflow-display";

export function buildWorkflowFilters(workflows: WorkflowConfig[]): FilterDef[] {
  const groupCounts = new Map<string, number>();
  const platformCounts = new Map<string, number>();

  for (const workflow of workflows) {
    groupCounts.set(workflow.group, (groupCounts.get(workflow.group) ?? 0) + 1);
    const platform = workflowDisplayPlatform(workflow);
    platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
  }

  return [
    {
      key: "group",
      label: "Group",
      showAllLabel: true,
      totalCount: workflows.length,
      options: [...groupCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, count]) => ({ value, label: value, count }))
    },
    {
      key: "platform",
      label: "Platform",
      showAllLabel: true,
      totalCount: workflows.length,
      options: [...platformCounts.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([value, count]) => ({ value, label: value, count }))
    }
  ];
}

export function workflowFilterValuesToState(values: Record<string, string[]>) {
  return {
    groupIds: values.group ?? [],
    platformIds: values.platform ?? []
  };
}

export function workflowStateToFilterValues(groupIds: string[], platformIds: string[]) {
  return {
    group: groupIds,
    platform: platformIds
  };
}
