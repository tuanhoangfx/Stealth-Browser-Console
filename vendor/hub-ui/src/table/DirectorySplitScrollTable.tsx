import type { ReactNode } from "react";
import { useEffect } from "react";
import { useDirectorySplitScrollbarSync } from "./useDirectorySplitScrollbarSync";

export type DirectorySplitScrollTableProps = {
  wrapClassName: string;
  tableClassName: string;
  showSelect: boolean;
  colgroup?: ReactNode;
  headRow: ReactNode;
  bodyRows: ReactNode;
  emptyMessage: string;
  hasRows: boolean;
  /** Reset tbody scroll when filters/search/page change. */
  scrollResetKey?: string | number | boolean | null;
};

export function DirectorySplitScrollTable({
  wrapClassName,
  tableClassName,
  showSelect,
  colgroup,
  headRow,
  bodyRows,
  emptyMessage,
  hasRows,
  scrollResetKey,
}: DirectorySplitScrollTableProps) {
  const syncPad = !wrapClassName.includes("hub-directory-table-scroll--flex-pane");
  const { headRef, bodyRef } = useDirectorySplitScrollbarSync(syncPad);

  useEffect(() => {
    if (scrollResetKey === undefined) return;
    const body = bodyRef.current;
    if (body) body.scrollTop = 0;
  }, [scrollResetKey, bodyRef]);

  return (
    <div className={wrapClassName}>
      <div className="hub-directory-table-head" ref={headRef}>
        <table className={tableClassName} data-hub-directory-select={showSelect ? "" : undefined}>
          {colgroup}
          <thead>{headRow}</thead>
        </table>
      </div>
      <div className="hub-directory-table-body-scroll" ref={bodyRef}>
        <table className={tableClassName} data-hub-directory-select={showSelect ? "" : undefined}>
          {colgroup}
          <tbody>{bodyRows}</tbody>
        </table>
        {!hasRows ? <div className="hub-users-empty">{emptyMessage}</div> : null}
      </div>
    </div>
  );
}
