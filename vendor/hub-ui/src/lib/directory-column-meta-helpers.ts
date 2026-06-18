import type { LucideIcon } from "lucide-react";
import type { HubDirectoryColumnMetaInput } from "../table/hub-directory-table-meta";
import type { HubTableColumnRole } from "../table/hub-table-column-meta";
import { semanticDirectoryColumnIcon } from "./semantic-icon-registry";
import type { SemanticIconLookupKey } from "../types/semantic-icon";

export type DirectoryColumnHeaderMeta = {
  label: string;
  colClass: string;
  role: HubTableColumnRole;
  width: string;
  headerIcon: LucideIcon;
  headerIconClassName: string;
};

/** SSOT helper — per-tool column defs call `col()` then `toHubDirectoryColumnMeta()`. */
export function createDirectoryColumnMetaHelpers() {
  function col(
    label: string,
    colClass: string,
    role: HubTableColumnRole,
    semanticKey: SemanticIconLookupKey,
    width: string,
  ): DirectoryColumnHeaderMeta {
    const icon = semanticDirectoryColumnIcon(semanticKey);
    return {
      label,
      colClass,
      role,
      width,
      headerIcon: icon.headerIcon as LucideIcon,
      headerIconClassName: icon.headerIconClassName,
    };
  }

  function toHubDirectoryColumnMeta(
    meta: Record<string, DirectoryColumnHeaderMeta>,
  ): Record<string, HubDirectoryColumnMetaInput> {
    return Object.fromEntries(
      Object.entries(meta).map(([key, def]) => [
        key,
        {
          label: def.label,
          colClass: def.colClass,
          role: def.role,
          width: def.width,
          headerIcon: def.headerIcon,
          headerIconClassName: def.headerIconClassName,
        },
      ]),
    );
  }

  return { col, toHubDirectoryColumnMeta };
}
