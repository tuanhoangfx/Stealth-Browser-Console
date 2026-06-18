/**
 * HUB_UI_SCAFFOLD — directory table column contract (HubDirectoryTableShell golden).
 * Copy pattern into Tool/P00xx-*/src/features/*/*DirectoryTable.tsx — do not import in production bundles.
 *
 * SSOT pipeline: directory-column-meta (width%) → buildDirectoryColumns → buildDirectoryColgroup → DirectoryTableBodyCell
 */
import { useMemo } from "react";
import {
  DirectoryTableBodyCell,
  HubCopyBadge,
  HubDirectoryTableShell,
  buildDirectoryColgroup,
  buildDirectoryColumns,
  hubDirectoryTableClass,
  type HubDirectoryColumnMetaInput,
  type HubSortDir,
} from "@tool-workspace/hub-ui";

type DemoRow = { id: string; label: string };

type DemoSortKey = "label" | "id";

const DEMO_COLUMN_KEYS: DemoSortKey[] = ["label", "id"];

/** Per-tool: move to src/lib/directory-column-meta.ts — unique colClass + width per key (sum ≤ 100%). */
const DEMO_COLUMN_META: Record<string, HubDirectoryColumnMetaInput> = {
  label: {
    label: "Name",
    colClass: "hub-users-col--name",
    role: "name",
    width: "70%",
  },
  id: {
    label: "ID",
    colClass: "hub-users-col--id",
    role: "id",
    width: "30%",
  },
};

const COLUMNS = buildDirectoryColumns(DEMO_COLUMN_KEYS, DEMO_COLUMN_META);

function renderDemoBodyCell(key: DemoSortKey, row: DemoRow) {
  const col = COLUMNS.find((c) => c.key === key);
  if (!col) return null;
  switch (key) {
    case "label":
      return (
        <DirectoryTableBodyCell key={key} colClass={col.colClass}>
          <span className="hub-users-name-title truncate">{row.label}</span>
        </DirectoryTableBodyCell>
      );
    case "id":
      return (
        <DirectoryTableBodyCell key={key} colClass={col.colClass}>
          <HubCopyBadge value={row.id} />
        </DirectoryTableBodyCell>
      );
    default:
      return null;
  }
}

type Props = {
  rows: DemoRow[];
  sortKey: DemoSortKey;
  sortDir: HubSortDir;
  onSort: (key: DemoSortKey) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
};

export function GoldenDirectoryTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  selectedIds,
  onToggleSelect,
}: Props) {
  const colgroup = useMemo(
    () => buildDirectoryColgroup(COLUMNS, { includeSelect: true }),
    [],
  );

  return (
    <HubDirectoryTableShell
      items={rows}
      ariaLabel="Golden directory table"
      tableClassName={hubDirectoryTableClass("default")}
      colgroup={colgroup}
      columns={COLUMNS}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      getRowKey={(row) => row.id}
      selectedIds={selectedIds}
      onToggleSelect={onToggleSelect}
      selectAllLabel="Select all on this page"
      emptyMessage="No rows."
      renderRowCells={(row) => <>{DEMO_COLUMN_KEYS.map((key) => renderDemoBodyCell(key, row))}</>}
    />
  );
}
