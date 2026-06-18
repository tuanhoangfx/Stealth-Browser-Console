import { useHubTablePageSize, patchHubListPrefs, patchHubTablePageSizeValue } from "@tool-workspace/hub-ui";
import { useCallback, useDeferredValue, useMemo, useState } from "react";

type WorkflowLike = {
  id: string;
  name: string;
  description: string;
  group: string;
  steps: unknown[];
};

export function useWorkflows<TWorkflow extends WorkflowLike>(
  workflowConfigs: TWorkflow[],
  selectedWorkflowIds: string[],
  workflowDisplayId: (id: string) => string,
  workflowDisplayPlatform: (workflow: TWorkflow) => string,
) {
  const [workflowSearch, setWorkflowSearch] = useState("");
  const deferredWorkflowSearch = useDeferredValue(workflowSearch);
  const [workflowGroupFilters, setWorkflowGroupFilters] = useState<string[]>([]);
  const [workflowPlatformFilters, setWorkflowPlatformFilters] = useState<string[]>([]);
  const workflowTablePageSize = useHubTablePageSize();

  const setWorkflowTablePageSize = useCallback((size: number) => {
    patchHubListPrefs({ tpage: patchHubTablePageSizeValue(size) });
  }, []);

  const selectedWorkflowConfigs = useMemo(
    () =>
      selectedWorkflowIds
        .map((id) => workflowConfigs.find((workflow) => workflow.id === id))
        .filter(Boolean) as TWorkflow[],
    [selectedWorkflowIds, workflowConfigs],
  );

  const filteredWorkflows = useMemo(() => {
    const term = deferredWorkflowSearch.trim().toLowerCase();
    return workflowConfigs.filter((workflow) => {
      const displayId = workflowDisplayId(workflow.id).toLowerCase();
      const displayPlatform = workflowDisplayPlatform(workflow);
      const matchesTerm =
        !term ||
        displayId.includes(term) ||
        workflow.id.toLowerCase().includes(term) ||
        workflow.name.toLowerCase().includes(term) ||
        workflow.description.toLowerCase().includes(term) ||
        displayPlatform.toLowerCase().includes(term) ||
        workflow.group.toLowerCase().includes(term);
      const matchesGroup = workflowGroupFilters.length === 0 || workflowGroupFilters.includes(workflow.group);
      const matchesPlatform =
        workflowPlatformFilters.length === 0 || workflowPlatformFilters.includes(displayPlatform);
      return matchesTerm && matchesGroup && matchesPlatform;
    });
  }, [
    workflowConfigs,
    workflowDisplayId,
    workflowDisplayPlatform,
    workflowGroupFilters,
    workflowPlatformFilters,
    deferredWorkflowSearch,
  ]);

  const selectedWorkflowCount = selectedWorkflowIds.length;
  const visibleWorkflowSteps = useMemo(
    () => filteredWorkflows.reduce((count, workflow) => count + workflow.steps.length, 0),
    [filteredWorkflows],
  );

  return {
    workflowSearch,
    setWorkflowSearch,
    workflowGroupFilters,
    setWorkflowGroupFilters,
    workflowPlatformFilters,
    setWorkflowPlatformFilters,
    selectedWorkflowConfigs,
    filteredWorkflows,
    workflowTablePageSize,
    setWorkflowTablePageSize,
    selectedWorkflowCount,
    visibleWorkflowSteps,
  };
}
