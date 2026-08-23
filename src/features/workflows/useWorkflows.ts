import { useHubTablePageSize, patchHubListPrefs, patchHubTablePageSizeValue } from "@tool-workspace/hub-ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { workflowDisplayPlatform } from "./workflow-display";
import {
  readScriptsDirectoryFilterUrl,
  writeScriptsDirectoryFilterUrl,
} from "./workflow-directory-filter-url";
import { matchesWorkflowDirectorySearch } from "./workflow-directory-search";
import type { WorkflowConfig } from "./workflow-types";

export function useWorkflows(
  workflowConfigs: WorkflowConfig[],
  selectedWorkflowIds: string[],
  builtinWorkflows: WorkflowConfig[],
) {
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [workflowGroupFilters, setWorkflowGroupFilters] = useState<string[]>(
    () => readScriptsDirectoryFilterUrl().groupIds,
  );
  const [workflowPlatformFilters, setWorkflowPlatformFilters] = useState<string[]>(
    () => readScriptsDirectoryFilterUrl().platformIds,
  );
  const workflowTablePageSize = useHubTablePageSize();

  const setWorkflowTablePageSize = useCallback((size: number) => {
    patchHubListPrefs({ tpage: patchHubTablePageSizeValue(size) });
  }, []);

  useEffect(() => {
    writeScriptsDirectoryFilterUrl(workflowGroupFilters, workflowPlatformFilters);
  }, [workflowGroupFilters, workflowPlatformFilters]);

  const selectedWorkflowConfigs = useMemo(
    () =>
      selectedWorkflowIds
        .map((id) => workflowConfigs.find((workflow) => workflow.id === id))
        .filter(Boolean) as WorkflowConfig[],
    [selectedWorkflowIds, workflowConfigs],
  );

  const filteredWorkflows = useMemo(() => {
    const term = workflowSearch.trim();
    return workflowConfigs.filter((workflow) => {
      const matchesTerm = !term || matchesWorkflowDirectorySearch(workflow, term, builtinWorkflows);
      const matchesGroup = workflowGroupFilters.length === 0 || workflowGroupFilters.includes(workflow.group);
      const displayPlatform = workflowDisplayPlatform(workflow);
      const matchesPlatform =
        workflowPlatformFilters.length === 0 || workflowPlatformFilters.includes(displayPlatform);
      return matchesTerm && matchesGroup && matchesPlatform;
    });
  }, [workflowConfigs, builtinWorkflows, workflowGroupFilters, workflowPlatformFilters, workflowSearch]);

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
