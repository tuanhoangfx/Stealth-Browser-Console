import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { HUB_DIRECTORY_TABLE_SCROLL_CLASS } from "./directory-table-scroll";
import type { HubTableColumnRole } from "./hub-table-column-meta";
import { validateDirectoryColumnWidthMeta } from "./hub-directory-column-width-registry";

export type HubDirectoryTableVariant =
  | "default"
  | "4"
  | "5"
  | "6"
  | "7"
  | "accounts"
  | "fb-accounts"
  | "pages"
  | "groups"
  | "users-credentials"
  | "hub-tools"
  | "dashboard-screens"
  | "agent-context"
  | "tool-versions"
  | "tool-links"
  | "sheet"
  | "folders"
  | "cookie-routes";

export const HUB_DIRECTORY_TABLE_BASE_CLASS = "hub-users-table hub-users-table--directory";

/** Fixed checkbox column — 36px (16px hub-checkbox + 4px cell pad ×2). Use px not rem (root font-size varies). */
export const HUB_DIRECTORY_SELECT_COL_WIDTH = "36px";

/** Colgroup track under table-layout:fixed — 3% + data % must stay ≤100%; th/td locked to 36px in CSS. */
export const HUB_DIRECTORY_SELECT_COLGROUP_WIDTH = "3%";

/** Modal directory tables — golden wrap chrome + horizontal scroll inside section. */
export const HUB_MODAL_DIRECTORY_TABLE_WRAP_CLASS =
  "hub-users-table-wrap hub-modal-directory-table-wrap min-w-0 overflow-x-auto";

/** Default wrap for HubDirectoryTableShell — Users golden (border applied in shell). */
export const HUB_DIRECTORY_USER_TABLE_WRAP_CLASS = `hub-users-table-wrap ${HUB_DIRECTORY_TABLE_SCROLL_CLASS}`;
export const HUB_DIRECTORY_TABLE_WRAP_CLASS = HUB_DIRECTORY_USER_TABLE_WRAP_CLASS;

/** Column meta input — width is SSOT for colgroup (`table-layout: fixed`). % values are relative weights per visible set (scaled to 100% in buildDirectoryColumns). */
export type HubDirectoryColumnMetaInput = {
  label: string;
  colClass: string;
  role: HubTableColumnRole;
  width: string;
  headerIcon?: LucideIcon;
  headerIconClassName?: string;
};

export type HubDirectoryColumnDef<TKey extends string = string> = {
  key: TKey;
  label: string;
  role: HubTableColumnRole;
  colClass: string;
  width: string;
  sortable?: boolean;
  headerAlign?: "start" | "center";
  headerIcon?: LucideIcon;
  headerIconClassName?: string;
};

export type DirectoryColgroupOptions = {
  /** Checkbox column — must match HubDirectoryTableShell `onToggleSelect` (use buildDirectoryColgroupForShell). */
  includeSelect?: boolean;
  /** Trailing fixed columns (e.g. actions). */
  trailingCols?: readonly { colClass: string; width?: string }[];
};

export type DirectoryColgroupForShellOptions = Omit<DirectoryColgroupOptions, "includeSelect"> & {
  /** Mirrors HubDirectoryTableShell row select — single SSOT for col + header/body cells. */
  showSelect: boolean;
};

function parsePercentWidth(width: string): number | null {
  const trimmed = width.trim();
  if (!trimmed.endsWith("%")) return null;
  const n = Number.parseFloat(trimmed.slice(0, -1));
  return Number.isFinite(n) ? n : null;
}

/** Scale visible % widths to 100% when meta weights sum above budget (e.g. Pages default 11 cols). */
export function scaleDirectoryColumnWidths<TKey extends string>(
  columns: readonly HubDirectoryColumnDef<TKey>[],
  budget = 100,
): HubDirectoryColumnDef<TKey>[] {
  if (!columns.length) return [...columns];
  const percents = columns.map((c) => parsePercentWidth(c.width));
  if (percents.some((p) => p == null)) return [...columns];
  const nums = percents as number[];
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum <= budget + 0.01) return [...columns];

  const scaled = nums.map((p) => (p / sum) * budget);
  const rounded = scaled.map((p) => Math.round(p * 10) / 10);
  const drift = Math.round((budget - rounded.reduce((a, b) => a + b, 0)) * 10) / 10;
  rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1]! + drift) * 10) / 10;

  return columns.map((col, i) => ({
    ...col,
    width: `${rounded[i]}%`,
  }));
}

/** Fail fast when directory column meta breaks colgroup layout. */
export function validateDirectoryColumns<TKey extends string>(
  columns: readonly HubDirectoryColumnDef<TKey>[],
): void {
  const colClasses = columns.map((c) => c.colClass);
  const dupes = colClasses.filter((c, i) => colClasses.indexOf(c) !== i);
  if (dupes.length) {
    throw new Error(
      `Directory columns: duplicate colClass "${dupes[0]}" — each column needs a unique colClass or use width SSOT per key.`,
    );
  }

  const percentWidths = columns.map((c) => parsePercentWidth(c.width)).filter((w): w is number => w != null);
  if (percentWidths.length === columns.length && columns.length > 0) {
    const sum = percentWidths.reduce((a, b) => a + b, 0);
    if (sum > 100.01) {
      throw new Error(`Directory columns: width sum ${sum}% exceeds 100%`);
    }
  }
}

/** Build shell columns from meta registry — validates unique colClass + width budget. */
export function buildDirectoryColumns<TKey extends string>(
  keys: readonly TKey[],
  meta: Record<string, HubDirectoryColumnMetaInput>,
  options?: { sortable?: boolean; fallbackLabel?: (key: TKey) => string },
): HubDirectoryColumnDef<TKey>[] {
  const columns = keys.map((key) => {
    const def = meta[key];
    if (!def) {
      throw new Error(`Directory columns: missing meta for key "${key}"`);
    }
    return {
      key,
      label: def.label,
      colClass: def.colClass,
      role: def.role,
      width: def.width,
      sortable: options?.sortable ?? true,
      headerIcon: def.headerIcon,
      headerIconClassName: def.headerIconClassName,
    };
  });
  validateDirectoryColumnWidthMeta(columns);
  const normalized = scaleDirectoryColumnWidths(columns);
  validateDirectoryColumns(normalized);
  return normalized;
}

type ColgroupCol = { key: string; colClass: string; width?: string };

/** Bulk select tables: omit inline col widths — CSS colClass SSOT (2FA parity; inline % expands 36px select). */
function colgroupColsWithoutInlineWidth(columns: readonly ColgroupCol[]): ColgroupCol[] {
  return columns.map(({ key, colClass }) => ({ key, colClass }));
}

/** Shared colgroup builder for HubDirectoryTableShell directory tables. */
export function buildDirectoryColgroup(
  columns: readonly ColgroupCol[],
  options?: DirectoryColgroupOptions,
): ReactNode {
  const includeSelect = options?.includeSelect ?? true;
  return createElement(
    "colgroup",
    null,
    includeSelect
      ? createElement("col", {
          className: "hub-users-col--select",
          style: { width: HUB_DIRECTORY_SELECT_COLGROUP_WIDTH },
        })
      : null,
    ...columns.map((col) =>
      createElement("col", {
        key: col.key,
        className: col.colClass,
        style: col.width ? { width: col.width } : undefined,
      }),
    ),
    ...(options?.trailingCols?.map((col) =>
      createElement("col", {
        key: col.colClass,
        className: col.colClass,
        style: col.width ? { width: col.width } : undefined,
      }),
    ) ?? []),
  );
}

/** Colgroup with select column synced to shell row select (bulk vs read-only-directory). */
export function buildDirectoryColgroupForShell(
  columns: readonly ColgroupCol[],
  options: DirectoryColgroupForShellOptions,
): ReactNode {
  const { showSelect, trailingCols, ...rest } = options;
  if (!showSelect) {
    return buildDirectoryColgroup(columns, { ...rest, trailingCols, includeSelect: false });
  }

  return buildDirectoryColgroup(colgroupColsWithoutInlineWidth(columns), {
    ...rest,
    trailingCols: trailingCols?.map(({ colClass }) => ({ colClass })),
    includeSelect: true,
  });
}

export const HUB_DIRECTORY_FRAME_CLASS = "hub-directory-frame";
export const HUB_DIRECTORY_FRAME_TABLE_CLASS = "hub-directory-frame-table";

export function hubDirectoryFrameTableClass(variant: HubDirectoryTableVariant = "6"): string {
  return `${hubDirectoryTableClass(variant)} hub-users-table--sheet ${HUB_DIRECTORY_FRAME_TABLE_CLASS}`;
}

export function hubDirectoryTableClass(variant: HubDirectoryTableVariant = "default"): string {
  if (variant === "default") return HUB_DIRECTORY_TABLE_BASE_CLASS;
  if (variant === "groups") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--directory-5`;
  }
  if (variant === "fb-accounts") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--directory-fb-accounts`;
  }
  if (variant === "pages") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--directory-pages`;
  }
  if (variant === "users-credentials") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--users-credentials`;
  }
  if (variant === "hub-tools") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--hub-tools`;
  }
  if (variant === "dashboard-screens") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--dashboard-screens`;
  }
  if (variant === "agent-context") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--agent-context`;
  }
  if (variant === "tool-versions") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--tool-versions`;
  }
  if (variant === "tool-links") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--tool-links`;
  }
  if (variant === "sheet") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--sheet`;
  }
  if (variant === "folders") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--folders`;
  }
  if (variant === "cookie-routes") {
    return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--cookie-routes`;
  }
  return `${HUB_DIRECTORY_TABLE_BASE_CLASS} hub-users-table--directory-${variant}`;
}

/** Panel-fill row divisor — always `pageSize` so search/filter partial pages keep compact rows under thead (not 100% stretch). */
export function resolveDirectoryPanelFillRows(pageSize: number, _visibleRowCount = 0): number {
  return Math.max(1, pageSize);
}
