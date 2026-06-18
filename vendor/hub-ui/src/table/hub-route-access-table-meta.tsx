import type { HubTableColumn } from "../content/HubDataTable";

/** Modal route-access table — same shell as User Access tools table. */
export const HUB_ROUTE_ACCESS_MODAL_TABLE_CLASS = "hub-users-table hub-users-table--route-access-modal";

export const HUB_ROUTE_ACCESS_MODAL_TABLE_WRAP_CLASS =
  "hub-users-table-wrap min-w-0 overflow-x-auto rounded-xl border border-white/5";

/** Full-width directory variant (non-modal). */
export const HUB_ROUTE_ACCESS_TABLE_CLASS = "hub-users-table hub-users-table--route-access";

export const HUB_ROUTE_ACCESS_TABLE_WRAP_CLASS = "min-w-0 overflow-x-auto";

export type HubRouteAccessColumnLayout = "expanded" | "compact";

export const HUB_ROUTE_ACCESS_COL = {
  select: "hub-users-col--select",
  user: "hub-route-access-col--user",
  role: "hub-route-access-col--role",
  syncAt: "hub-route-access-col--sync-at",
  loadAt: "hub-route-access-col--load-at",
  perm: "hub-route-access-col--perm",
  activity: "hub-route-access-col--activity",
  rights: "hub-route-access-col--rights",
  route: "hub-route-access-col--route",
  addedAt: "hub-route-access-col--added-at",
  expires: "hub-route-access-col--expires",
} as const;

export type HubRouteAccessModalColumnOptions = {
  layout?: HubRouteAccessColumnLayout;
  showRouteColumn?: boolean;
};

export const HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS = {
  user: {
    key: "user",
    label: "User",
    className: HUB_ROUTE_ACCESS_COL.user,
    role: "user" as const,
  },
  role: {
    key: "role",
    label: "Access",
    className: HUB_ROUTE_ACCESS_COL.role,
    role: "access" as const,
  },
  syncAt: {
    key: "syncAt",
    label: "Synced",
    className: HUB_ROUTE_ACCESS_COL.syncAt,
    role: "synced" as const,
  },
  loadAt: {
    key: "loadAt",
    label: "Loaded",
    className: HUB_ROUTE_ACCESS_COL.loadAt,
    role: "load" as const,
  },
  permLoad: {
    key: "permLoad",
    label: "Load",
    className: HUB_ROUTE_ACCESS_COL.perm,
    role: "load" as const,
  },
  permSync: {
    key: "permSync",
    label: "Sync",
    className: HUB_ROUTE_ACCESS_COL.perm,
    role: "sync" as const,
  },
  activity: {
    key: "activity",
    label: "Act.",
    className: HUB_ROUTE_ACCESS_COL.activity,
    role: "activity" as const,
  },
  rights: {
    key: "rights",
    label: "Shared",
    className: HUB_ROUTE_ACCESS_COL.rights,
    role: "access" as const,
  },
  route: {
    key: "route",
    label: "Route",
    className: HUB_ROUTE_ACCESS_COL.route,
    role: "route" as const,
  },
  addedAt: {
    key: "addedAt",
    label: "Add",
    className: HUB_ROUTE_ACCESS_COL.addedAt,
    role: "created" as const,
  },
  expires: {
    key: "expires",
    label: "Expires",
    className: HUB_ROUTE_ACCESS_COL.expires,
    role: "expires" as const,
  },
} satisfies Record<string, HubTableColumn>;

export function buildHubRouteAccessModalColumns(
  showSelect: boolean,
  options: HubRouteAccessModalColumnOptions = {},
): HubTableColumn[] {
  const layout = options.layout ?? "expanded";
  const showRouteColumn = options.showRouteColumn ?? layout === "expanded";

  if (layout === "compact") {
    return [
      ...(showSelect ? [{ key: "select", label: "", className: HUB_ROUTE_ACCESS_COL.select }] : []),
      HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.user,
      HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.role,
      HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.activity,
      ...(showRouteColumn ? [HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.route] : []),
      HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.addedAt,
      HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.expires,
    ];
  }

  return [
    ...(showSelect ? [{ key: "select", label: "", className: HUB_ROUTE_ACCESS_COL.select }] : []),
    HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.user,
    HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.role,
    HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.syncAt,
    HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.loadAt,
    ...(showRouteColumn ? [HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.route] : []),
    HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.addedAt,
    HUB_ROUTE_ACCESS_MODAL_COLUMN_DEFS.expires,
  ];
}

export function hubRouteAccessModalColumnCount(
  showSelect: boolean,
  options: HubRouteAccessModalColumnOptions = {},
) {
  const layout = options.layout ?? "expanded";
  const showRouteColumn = options.showRouteColumn ?? layout === "expanded";

  if (layout === "compact") {
    const dataCols = showRouteColumn ? 6 : 5;
    return showSelect ? dataCols + 1 : dataCols;
  }

  const dataCols = showRouteColumn ? 7 : 6;
  return showSelect ? dataCols + 1 : dataCols;
}

export function hubRouteAccessModalTableClass(options: HubRouteAccessModalColumnOptions = {}) {
  const layout = options.layout ?? "expanded";
  const showRouteColumn = options.showRouteColumn ?? layout === "expanded";
  const modifiers = [
    layout === "expanded" ? "hub-users-table--route-access-modal--expanded" : "",
    layout === "compact" && showRouteColumn ? "hub-users-table--route-access-modal--with-route" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return modifiers ? `${HUB_ROUTE_ACCESS_MODAL_TABLE_CLASS} ${modifiers}` : HUB_ROUTE_ACCESS_MODAL_TABLE_CLASS;
}

export const HUB_ROUTE_ACCESS_SKELETON_WRAP_CLASS = HUB_ROUTE_ACCESS_MODAL_TABLE_WRAP_CLASS;

/** @deprecated Use modal col defs — kept for HubDirectoryTableShell callers. */
export type HubRouteAccessColumnKey = "user" | "role";

export type HubRouteAccessSortKey =
  | "user"
  | "role"
  | "syncAt"
  | "loadAt"
  | "activity"
  | "route"
  | "addedAt"
  | "expires";
