import type { HubTableColumn } from "../content/HubDataTable";

/** Modal tool-access table (User Access · ≤5 columns, no horizontal scroll). */
export const HUB_USER_TOOLS_MODAL_TABLE_CLASS =
  "hub-users-table hub-users-table--hub-tools hub-users-table--hub-tools-modal";

export const HUB_USER_TOOLS_MODAL_TABLE_WRAP_CLASS =
  "hub-users-table-wrap min-w-0 overflow-hidden rounded-xl border border-white/5";

/** Full Hub tools directory table. */
export const HUB_USER_TOOLS_DIRECTORY_TABLE_CLASS = "hub-users-table hub-users-table--hub-tools";

export const HUB_USER_TOOLS_COL = {
  select: "hub-users-col--select",
  code: "hub-users-col--hub-code",
  name: "hub-users-col--hub-project",
  category: "hub-users-col--hub-status",
  access: "hub-users-col--hub-version",
} as const;

export const HUB_USER_TOOLS_MODAL_COLUMN_DEFS = {
  code: {
    key: "code",
    label: "Tool",
    className: HUB_USER_TOOLS_COL.code,
    role: "code" as const,
  },
  name: {
    key: "name",
    label: "Name",
    className: HUB_USER_TOOLS_COL.name,
    role: "name" as const,
  },
  category: {
    key: "category",
    label: "Category",
    className: HUB_USER_TOOLS_COL.category,
    role: "category" as const,
  },
  access: {
    key: "access",
    label: "Access",
    className: HUB_USER_TOOLS_COL.access,
    role: "access" as const,
  },
} satisfies Record<string, HubTableColumn>;

export function buildHubUserToolsModalColumns(showSelect: boolean): HubTableColumn[] {
  return [
    ...(showSelect
      ? [{ key: "select", label: "", className: HUB_USER_TOOLS_COL.select }]
      : []),
    HUB_USER_TOOLS_MODAL_COLUMN_DEFS.code,
    HUB_USER_TOOLS_MODAL_COLUMN_DEFS.name,
    HUB_USER_TOOLS_MODAL_COLUMN_DEFS.category,
    HUB_USER_TOOLS_MODAL_COLUMN_DEFS.access,
  ];
}

export const HUB_USER_TOOLS_SKELETON_WRAP_CLASS =
  "hub-users-table-wrap min-w-0 overflow-hidden rounded-xl border border-white/5";

export function hubUserToolsModalColumnCount(showSelect: boolean) {
  return showSelect ? 5 : 4;
}
