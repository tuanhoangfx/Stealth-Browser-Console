import type { LucideIcon } from "lucide-react";
import type { HubBrandIconId } from "../lib/resolve-hub-brand-icon";
import { compactIconSize, HUB_DIRECTORY_HEADER_GLYPH_PX } from "../ui-scale";
import { HubSemanticGlyph } from "../shell/HubSemanticGlyph";
import {
  type HubTableColumnRole,
  resolveHubTableColumnMeta,
} from "../table/hub-table-column-meta";

export type HubTableColumnHeaderProps = {
  label: string;
  /** Native emoji glyph — replaces Lucide/brand header icon when set. */
  headerEmoji?: string;
  /** Semantic role — preferred; pulls icon + color from shared registry. */
  role?: HubTableColumnRole;
  icon?: LucideIcon;
  iconClassName?: string;
  brandIcon?: HubBrandIconId;
};

/** Table header icon + label — wrap with `.hub-users-th-label` in sortable headers. */
export function HubTableColumnHeader({
  label,
  headerEmoji,
  role,
  icon: IconProp,
  iconClassName,
  brandIcon,
}: HubTableColumnHeaderProps) {
  if (headerEmoji) {
    return (
      <span className="hub-users-th-heading">
        <span className="hub-users-th-emoji" aria-hidden>
          {headerEmoji}
        </span>
        <span className="hub-users-th-text">{label}</span>
      </span>
    );
  }
  const meta = role ? resolveHubTableColumnMeta(role) : null;
  const Icon = meta?.icon ?? IconProp;
  const iconClass = meta?.iconClassName ?? iconClassName ?? "hub-users-th-icon--name";
  if (!Icon && !brandIcon) return <span className="hub-users-th-text">{label}</span>;

  return (
    <span className="hub-users-th-heading">
      <HubSemanticGlyph
        icon={Icon}
        brandIcon={brandIcon}
        size={compactIconSize(HUB_DIRECTORY_HEADER_GLYPH_PX)}
        className={`hub-users-th-icon ${iconClass}`}
      />
      <span className="hub-users-th-text">{label}</span>
    </span>
  );
}
