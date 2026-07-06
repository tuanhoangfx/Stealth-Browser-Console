import type { LucideIcon } from "lucide-react";
import type { HubBrandIconId } from "./resolve-hub-brand-icon";
import type { HubDirectoryColumnHintContent } from "../table/HubDirectoryColumnHint";
import type { HubDirectoryColumnMetaInput } from "../table/hub-directory-table-meta";
import type { HubTableColumnRole } from "../table/hub-table-column-meta";
import { semanticDirectoryColumnIcon } from "./semantic-icon-registry";
import type { SemanticIconLookupKey } from "../types/semantic-icon";

export type DirectoryColumnMetaOptions = {
  /** Native tooltip when rich hint is absent. */
  headerTooltip?: string;
  /** Rich multi-line popover — icon rows for enum / source types. */
  headerHint?: HubDirectoryColumnHintContent;
};

export type DirectoryColumnHeaderMeta = {
  label: string;
  colClass: string;
  role: HubTableColumnRole;
  width: string;
  headerIcon: LucideIcon;
  headerIconClassName: string;
  headerBrandIcon?: HubBrandIconId;
  headerTooltip?: string;
  headerHint?: HubDirectoryColumnHintContent;
};

/** SSOT helper — per-tool column defs call `col()` then `toHubDirectoryColumnMeta()`. */
export function createDirectoryColumnMetaHelpers() {
  function col(
    label: string,
    colClass: string,
    role: HubTableColumnRole,
    semanticKey: SemanticIconLookupKey,
    width: string,
    options?: DirectoryColumnMetaOptions,
  ): DirectoryColumnHeaderMeta {
    const icon = semanticDirectoryColumnIcon(semanticKey);
    return {
      label,
      colClass,
      role,
      width,
      headerIcon: icon.headerIcon as LucideIcon,
      headerIconClassName: icon.headerIconClassName,
      headerBrandIcon: icon.headerBrandIcon,
      headerTooltip: options?.headerTooltip,
      headerHint: options?.headerHint,
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
          headerBrandIcon: def.headerBrandIcon,
          headerTooltip: def.headerTooltip,
          headerHint: def.headerHint,
        },
      ]),
    );
  }

  return { col, toHubDirectoryColumnMeta };
}
