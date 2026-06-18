import { useCallback, useMemo } from "react";
import { hubDirectoryListResetKey, type FilterValues } from "@tool-workspace/hub-ui";
import type { WorkflowConfig } from "./workflow-types";
import {
  buildWorkflowFilters,
  workflowFilterValuesToState,
  workflowStateToFilterValues,
} from "./workflow-filters";

export type UseWorkflowDirectoryFiltersArgs = {
  workflowConfigs: WorkflowConfig[];
  workflowSearch: string;
  workflowGroupFilters: string[];
  setWorkflowGroupFilters: (values: string[]) => void;
  workflowPlatformFilters: string[];
  setWorkflowPlatformFilters: (values: string[]) => void;
};

/** SSOT — workflow directory filter state + list reset key (rail + Scripts panel). */
export function useWorkflowDirectoryFilters({
  workflowConfigs,
  workflowSearch,
  workflowGroupFilters,
  setWorkflowGroupFilters,
  workflowPlatformFilters,
  setWorkflowPlatformFilters,
}: UseWorkflowDirectoryFiltersArgs) {
  const filters = useMemo(() => buildWorkflowFilters(workflowConfigs), [workflowConfigs]);
  const filterValues = useMemo(
    () => workflowStateToFilterValues(workflowGroupFilters, workflowPlatformFilters),
    [workflowGroupFilters, workflowPlatformFilters],
  );
  const listResetKey = hubDirectoryListResetKey(workflowSearch, filterValues, "id", "asc");

  const handleFilterValuesChange = useCallback(
    (values: FilterValues) => {
      const next = workflowFilterValuesToState(values);
      setWorkflowGroupFilters(next.groupIds);
      setWorkflowPlatformFilters(next.platformIds);
    },
    [setWorkflowGroupFilters, setWorkflowPlatformFilters],
  );

  return {
    filters,
    filterValues,
    listResetKey,
    handleFilterValuesChange,
  };
}
