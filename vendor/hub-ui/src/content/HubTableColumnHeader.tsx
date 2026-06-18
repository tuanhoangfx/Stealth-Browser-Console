import type { LucideIcon } from "lucide-react";
import {
  type HubTableColumnRole,
  resolveHubTableColumnMeta,
} from "../table/hub-table-column-meta";

export type HubTableColumnHeaderProps = {
  label: string;
  /** Semantic role — preferred; pulls icon + color from shared registry. */
  role?: HubTableColumnRole;
  icon?: LucideIcon;
  iconClassName?: string;
};

/** Table header icon + label — wrap with `.hub-users-th-label` in sortable headers. */
export function HubTableColumnHeader({
  label,
  role,
  icon: IconProp,
  iconClassName,
}: HubTableColumnHeaderProps) {
  const meta = role ? resolveHubTableColumnMeta(role) : null;
  const Icon = meta?.icon ?? IconProp;
  const iconClass = meta?.iconClassName ?? iconClassName ?? "hub-users-th-icon--name";
  if (!Icon) return <span className="hub-users-th-text">{label}</span>;

  return (
    <>
      <Icon size={13} className={`hub-users-th-icon ${iconClass}`} aria-hidden />
      <span className="hub-users-th-text">{label}</span>
    </>
  );
}
