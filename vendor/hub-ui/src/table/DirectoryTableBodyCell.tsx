import type { MouseEvent, ReactNode } from "react";

export type DirectoryTableBodyCellProps = {
  colClass: string;
  /** Optional typography helper e.g. hub-users-cell-num, hub-users-cell-muted */
  typographyClass?: string;
  children: ReactNode;
  title?: string;
  onClick?: (e: MouseEvent<HTMLTableCellElement>) => void;
};

/** Golden directory body cell — td class must match colgroup colClass (P0004 Users parity). */
export function DirectoryTableBodyCell({
  colClass,
  typographyClass,
  children,
  title,
  onClick,
}: DirectoryTableBodyCellProps) {
  const className = [colClass, typographyClass].filter(Boolean).join(" ");
  return (
    <td className={className} title={title} onClick={onClick}>
      {children}
    </td>
  );
}
