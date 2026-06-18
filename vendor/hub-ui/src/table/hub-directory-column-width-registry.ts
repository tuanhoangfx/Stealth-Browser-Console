import type { HubTableColumnRole } from "./hub-table-column-meta";

/** Fixed (px/rem) vs fluid (%) directory column width tier — bulk tables use CSS tokens, not inline colgroup %. */
export type HubDirectoryColumnWidthKind = "fixed" | "fluid";

export type HubDirectoryColumnWidthSpec = {
  kind: HubDirectoryColumnWidthKind;
  /** CSS width token for variant stylesheets (`col` / `th` / `td`). */
  token: string;
};

/**
 * SSOT: chrome columns (status, timestamp, counts) → fixed rem/px; content columns → fluid %.
 * Bulk tables (`showSelect: true`): apply via variant CSS — never inline % on fixed roles in colgroup.
 */
export const HUB_DIRECTORY_COLUMN_WIDTH_REGISTRY: Partial<
  Record<HubTableColumnRole, HubDirectoryColumnWidthSpec>
> = {
  status: { kind: "fixed", token: "6.5rem" },
  drift: { kind: "fixed", token: "3.75rem" },
  created: { kind: "fixed", token: "6.25rem" },
  activity: { kind: "fixed", token: "6.25rem" },
  updated: { kind: "fixed", token: "6.25rem" },
  expires: { kind: "fixed", token: "6.25rem" },
  role: { kind: "fixed", token: "5rem" },
  tools: { kind: "fixed", token: "3.75rem" },
  version: { kind: "fixed", token: "5.5rem" },
  category: { kind: "fixed", token: "5.5rem" },
  access: { kind: "fixed", token: "5.5rem" },
  type: { kind: "fixed", token: "5.5rem" },
  kind: { kind: "fixed", token: "4.5rem" },
  layer: { kind: "fixed", token: "5rem" },
  lines: { kind: "fixed", token: "3.25rem" },
  mode: { kind: "fixed", token: "5rem" },
  period: { kind: "fixed", token: "5rem" },
  sync: { kind: "fixed", token: "5rem" },
  load: { kind: "fixed", token: "5rem" },
  actions: { kind: "fixed", token: "8.5rem" },
  code: { kind: "fixed", token: "4.5rem" },
  bots: { kind: "fixed", token: "3.75rem" },
  members: { kind: "fixed", token: "5rem" },
  active: { kind: "fixed", token: "5rem" },
};

export const HUB_DIRECTORY_SELECT_WIDTH_SPEC: HubDirectoryColumnWidthSpec = {
  kind: "fixed",
  token: "36px",
};

/** Playwright / visual regression bands (px) for fixed chrome columns. */
export const HUB_DIRECTORY_FIXED_COL_WIDTH_BANDS = {
  select: { min: 34, max: 40, target: 36 },
  /** rem token + 10px L/R cell pad on hub-tools variant */
  status: { min: 88, max: 135, target: 104 },
  timestamp: { min: 88, max: 130, target: 100 },
} as const;

export function resolveDirectoryColumnWidthSpec(role: HubTableColumnRole): HubDirectoryColumnWidthSpec {
  return HUB_DIRECTORY_COLUMN_WIDTH_REGISTRY[role] ?? { kind: "fluid", token: "auto" };
}

export function isFixedDirectoryColumnRole(role: HubTableColumnRole): boolean {
  return resolveDirectoryColumnWidthSpec(role).kind === "fixed";
}

export function isFluidDirectoryColumnWidth(width: string): boolean {
  const trimmed = width.trim();
  return trimmed.endsWith("%") || trimmed === "auto";
}

export function isFixedDirectoryColumnWidth(width: string): boolean {
  const trimmed = width.trim();
  return /^\d+(\.\d+)?(px|rem)$/.test(trimmed);
}

/** Fail when meta assigns % to a fixed-tier role (bulk CSS should use registry token). */
export function validateDirectoryColumnWidthMeta(
  columns: readonly { role: HubTableColumnRole; width: string; key?: string }[],
): void {
  for (const col of columns) {
    const spec = resolveDirectoryColumnWidthSpec(col.role);
    if (spec.kind !== "fixed") continue;
    if (isFluidDirectoryColumnWidth(col.width)) {
      const label = col.key ? `"${col.key}" (${col.role})` : col.role;
      throw new Error(
        `Directory column ${label}: role "${col.role}" is fixed-width SSOT (${spec.token}) — meta width must not be %`,
      );
    }
  }
}
