import { useEffect, useRef, useState } from "react";
import { fetchProfileDirectoryPage } from "../../api";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import type { ProfileRow } from "../../types";
import type { StealthProfileSortKey } from "./StealthProfileDirectoryTable";
import { profileDirectorySortParam } from "./profile-directory-sort";

export type ProfileDirectoryQuery = {
  search: string;
  groupIds: readonly string[];
  statuses: readonly ProfileRow["status"][];
};

/**
 * Server-side directory page — SQL filter/sort/pagination (no full-catalog client scan).
 */
export function useProfileDirectoryResults(
  query: ProfileDirectoryQuery,
  pageIndex: number,
  pageSize: number,
  sortKey: StealthProfileSortKey,
  sortDir: "asc" | "desc",
  /** Bump after open/close/session so server page reflects lastOpenedAt + status. */
  refreshKey = 0,
) {
  const debouncedSearch = useDebouncedValue(query.search, 200);
  const [state, setState] = useState<{
    filteredProfiles: ProfileRow[];
    filteredTotal: number;
    directoryBusy: boolean;
  }>({
    filteredProfiles: [],
    filteredTotal: 0,
    directoryBusy: true,
  });
  const requestId = useRef(0);

  useEffect(() => {
    const req = ++requestId.current;
    setState((prev) => ({ ...prev, directoryBusy: true }));

    fetchProfileDirectoryPage({
      search: debouncedSearch,
      groupIds: [...query.groupIds],
      statuses: [...query.statuses],
      limit: pageSize,
      offset: pageIndex * pageSize,
      sort: profileDirectorySortParam(sortKey),
      dir: sortDir,
    })
      .then((page) => {
        if (req !== requestId.current) return;
        setState({
          filteredProfiles: page.profiles as ProfileRow[],
          filteredTotal: page.total,
          directoryBusy: false,
        });
      })
      .catch(() => {
        if (req !== requestId.current) return;
        setState((prev) => ({ ...prev, directoryBusy: false }));
      });
  }, [
    debouncedSearch,
    query.groupIds,
    query.statuses,
    pageIndex,
    pageSize,
    sortKey,
    sortDir,
    refreshKey,
  ]);

  return {
    filteredProfiles: state.filteredProfiles,
    filteredTotal: state.filteredTotal,
    directoryBusy: state.directoryBusy || debouncedSearch !== query.search,
  };
}
