import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { HubTableColumnRole } from "../table/hub-table-column-meta";
import { HubTableColumnHeader } from "./HubTableColumnHeader";

export type HubTableColumn = {
  key: string;
  label: string;
  className?: string;
  role?: HubTableColumnRole;
  icon?: LucideIcon;
  iconClassName?: string;
  /** Custom header cell (sort buttons, select-all, etc.) */
  header?: ReactNode;
};

export function HubDataTable({
  columns,
  children,
  empty,
  tableClassName = "hub-users-table",
  wrapClassName = "hub-users-table-wrap overflow-hidden rounded-xl border border-white/5",
  directorySelect = false,
}: {
  columns: HubTableColumn[];
  children: ReactNode;
  empty?: ReactNode;
  tableClassName?: string;
  wrapClassName?: string;
  /** Enables 36px select column + hub-checkbox SSOT (hub-directory-table.css). */
  directorySelect?: boolean;
}) {
  return (
    <div className={wrapClassName}>
      <table className={tableClassName} data-hub-directory-select={directorySelect ? "" : undefined}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className} scope="col">
                {col.header ??
                  (col.role || col.icon ? (
                    <span className="hub-users-th-label">
                      <HubTableColumnHeader
                        label={col.label}
                        role={col.role}
                        icon={col.icon}
                        iconClassName={col.iconClassName}
                      />
                    </span>
                  ) : (
                    <span className="hub-users-th-text">{col.label}</span>
                  ))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ?? null}
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function HubTableEmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-[var(--muted)]">
        {children}
      </td>
    </tr>
  );
}
