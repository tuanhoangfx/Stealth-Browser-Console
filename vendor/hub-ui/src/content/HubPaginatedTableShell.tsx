import type { ReactNode } from "react";
import { HubTablePager } from "./HubTablePager";
import { useHubTablePagination, type HubServerPaginationControl } from "../table/hub-table-pagination";
import { useHubTablePageSize } from "../table/hub-table-page-size";

export type HubPaginatedTableShellProps<T> = {
  items: readonly T[];
  resetKey?: string | number | boolean | null;
  pageSize?: number;
  ariaLabel?: string;
  className?: string;
  /** Hide pager when total rows ≤ page size (rail / compact lists). */
  hideWhenSinglePage?: boolean;
  /** Pre-sliced page rows + SQL total — pager uses host pageIndex (P0003 profiles). */
  serverPagination?: HubServerPaginationControl;
  children: (pageItems: readonly T[]) => ReactNode;
};

/** Pager + slice wrapper for custom hub-users-table markup. */
export function HubPaginatedTableShell<T>({
  items,
  resetKey,
  pageSize,
  ariaLabel,
  className,
  hideWhenSinglePage,
  serverPagination,
  children,
}: HubPaginatedTableShellProps<T>) {
  const resolvedPageSize = useHubTablePageSize(pageSize);
  const pagination = useHubTablePagination(items, {
    resetKey,
    pageSize: resolvedPageSize,
    server: serverPagination,
  });

  return (
    <div
      className={
        className
          ? `hub-paginated-table-shell min-h-0 min-w-0 ${className}`
          : "hub-paginated-table-shell min-h-0 min-w-0"
      }
    >
      {children(pagination.pageItems)}
      <HubTablePager
        pageIndex={pagination.pageIndex}
        totalPages={pagination.totalPages}
        rangeStart={pagination.rangeStart}
        rangeEnd={pagination.rangeEnd}
        totalCount={pagination.totalCount}
        onPrev={pagination.goPrev}
        onNext={pagination.goNext}
        pageSize={resolvedPageSize}
        ariaLabel={ariaLabel}
        hideWhenSinglePage={hideWhenSinglePage}
      />
    </div>
  );
}
