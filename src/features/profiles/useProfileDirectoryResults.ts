import { useEffect, useRef, useState } from "react";
import { fetchProfileDirectoryPage } from "../../api";
import type { ProfileProxyFilterMode, ProfileRow } from "../../types";
import type { StealthProfileSortKey } from "./StealthProfileDirectoryTable";
import { profileDirectorySortParam } from "./profile-directory-sort";

export type ProfileDirectoryQuery = {
  /** Debounced search — from `useDirectorySearchQuery().query`. */
  search: string;
  groupIds: readonly string[];
  statuses: readonly ProfileRow["status"][];
  proxyModes?: readonly ProfileProxyFilterMode[];
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
  const prevRefreshKeyRef = useRef(refreshKey);

  useEffect(() => {
    const req = ++requestId.current;
    const isBackgroundRefreshOnly = prevRefreshKeyRef.current !== refreshKey;
    prevRefreshKeyRef.current = refreshKey;
    if (!isBackgroundRefreshOnly) {
      setState((prev) => ({ ...prev, directoryBusy: true }));
    }

    fetchProfileDirectoryPage({
      search: query.search,
      groupIds: [...query.groupIds],
      statuses: [...query.statuses],
      proxyModes: query.proxyModes ? [...query.proxyModes] : [],
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
    query.search,
    query.groupIds,
    query.statuses,
    query.proxyModes,
    pageIndex,
    pageSize,
    sortKey,
    sortDir,
    refreshKey,
  ]);

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.stealthApi : undefined;
    if (!api?.onProfileSession) return undefined;
    const off = api.onProfileSession(({ profile }) => {
      if (!profile?.id) return;
      setState((prev) => {
        const idx = prev.filteredProfiles.findIndex((row) => row.id === profile.id);
        if (idx < 0) return prev;
        const next = [...prev.filteredProfiles];
        next[idx] = {
          ...next[idx]!,
          ...profile,
          activeVpnCountry:
            profile.status === "running"
              ? profile.activeVpnCountry ?? next[idx]!.activeVpnCountry
              : undefined,
        };
        return { ...prev, filteredProfiles: next };
      });
    });
    return () => {
      off?.();
    };
  }, []);

  return {
    filteredProfiles: state.filteredProfiles,
    filteredTotal: state.filteredTotal,
    directoryBusy: state.directoryBusy,
  };
}
