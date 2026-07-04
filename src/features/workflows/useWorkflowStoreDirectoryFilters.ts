import { useCallback, useMemo } from "react";
import { hubDirectoryListResetKey, type FilterValues, type HubViewMode, type TimeRange } from "@tool-workspace/hub-ui";
import type { WorkflowStoreEntry } from "./workflow-store-types";
import {
  buildWorkflowStoreFilters,
  workflowStoreFilterValuesToState,
  workflowStoreStateToFilterValues,
} from "./workflow-store-filters";

function sameStringList(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export type UseWorkflowStoreDirectoryFiltersArgs = {
  entries: WorkflowStoreEntry[];
  search: string;
  groupFilters: string[];
  setGroupFilters: (values: string[]) => void;
  platformFilters: string[];
  setPlatformFilters: (values: string[]) => void;
  sourceFilters: string[];
  setSourceFilters: (values: string[]) => void;
  timeRange: TimeRange;
  viewMode: HubViewMode;
};

export function useWorkflowStoreDirectoryFilters({
  entries,
  search,
  groupFilters,
  setGroupFilters,
  platformFilters,
  setPlatformFilters,
  sourceFilters,
  setSourceFilters,
  timeRange,
  viewMode,
}: UseWorkflowStoreDirectoryFiltersArgs) {
  const filters = useMemo(() => buildWorkflowStoreFilters(entries), [entries]);
  const filterValues = useMemo(
    () => workflowStoreStateToFilterValues(groupFilters, platformFilters, sourceFilters),
    [groupFilters, platformFilters, sourceFilters],
  );
  const listResetKey = hubDirectoryListResetKey(search, filterValues, "name", "asc", timeRange, viewMode);

  const handleFilterValuesChange = useCallback(
    (values: FilterValues) => {
      const next = workflowStoreFilterValuesToState(values);
      if (!sameStringList(groupFilters, next.groupIds)) setGroupFilters(next.groupIds);
      if (!sameStringList(platformFilters, next.platformIds)) setPlatformFilters(next.platformIds);
      if (!sameStringList(sourceFilters, next.sourceIds)) setSourceFilters(next.sourceIds);
    },
    [groupFilters, platformFilters, sourceFilters, setGroupFilters, setPlatformFilters, setSourceFilters],
  );

  return {
    filters,
    filterValues,
    listResetKey,
    handleFilterValuesChange,
  };
}
