import type { KpiTileData } from "@tool-workspace/hub-ui";
import { isLocalCalendarToday } from "../../lib/local-calendar-today";
import { STEALTH_WORKFLOW_STORE_KPI_STICKER } from "../../lib/stealth-column-stickers";
import type { WorkflowStoreEntry } from "./workflow-store-types";

export const WORKFLOW_STORE_KPI_KEYS = [
  "total",
  "create_today",
  "update_today",
  "local",
  "installed",
  "available",
  "selected",
] as const;

export type WorkflowStoreKpiKey = (typeof WORKFLOW_STORE_KPI_KEYS)[number];

export const DEFAULT_WORKFLOW_STORE_KPI_KEYS = new Set<string>(WORKFLOW_STORE_KPI_KEYS);

/** Saved Store strip before Local was split from Installed. */
const LEGACY_STORE_KPI_MERGED_INSTALLED = new Set([
  "total",
  "create_today",
  "update_today",
  "installed",
  "available",
  "selected",
]);

export type StoreEntryPresence = "local" | "installed" | "available";

export type WorkflowStoreKpiNumbers = {
  total: number;
  createToday: number;
  updateToday: number;
  local: number;
  installed: number;
  available: number;
  selected: number;
};

const STORE_KPI_TILES: Array<{
  key: WorkflowStoreKpiKey;
  label: string;
  tone: NonNullable<KpiTileData["tone"]>;
  pick: (k: WorkflowStoreKpiNumbers) => number;
}> = [
  { key: "total", label: "Store", tone: "sky", pick: (k) => k.total },
  { key: "create_today", label: "Create today", tone: "emerald", pick: (k) => k.createToday },
  { key: "update_today", label: "Update today", tone: "amber", pick: (k) => k.updateToday },
  { key: "local", label: "Local", tone: "indigo", pick: (k) => k.local },
  { key: "installed", label: "Installed", tone: "emerald", pick: (k) => k.installed },
  { key: "available", label: "Available", tone: "cyan", pick: (k) => k.available },
  { key: "selected", label: "Selected", tone: "violet", pick: (k) => k.selected },
];

function isExactKeySet(stored: Set<string>, expected: Set<string>): boolean {
  if (stored.size !== expected.size) return false;
  for (const key of expected) if (!stored.has(key)) return false;
  return true;
}

/** Same priority as the Store Status column — Local, then catalog Installed, else Available. */
export function resolveStoreEntryPresence(
  id: string,
  localIds: ReadonlySet<string>,
  installedIds: ReadonlySet<string>,
): StoreEntryPresence {
  if (localIds.has(id)) return "local";
  if (installedIds.has(id)) return "installed";
  return "available";
}

export function matchesStoreActivity(
  entry: WorkflowStoreEntry,
  key: string | null,
  localIds: ReadonlySet<string>,
  installedIds: ReadonlySet<string>,
  now = new Date(),
): boolean {
  if (!key || key === "total" || key === "selected") return true;
  switch (key) {
    case "create_today":
      return isLocalCalendarToday(entry.createdAt, now);
    case "update_today":
      return isLocalCalendarToday(entry.updatedAt, now);
    case "local":
    case "installed":
    case "available":
      return resolveStoreEntryPresence(entry.id, localIds, installedIds) === key;
    default:
      return true;
  }
}

export function computeWorkflowStoreKpiNumbers(
  entries: readonly WorkflowStoreEntry[],
  localIds: ReadonlySet<string>,
  installedIds: ReadonlySet<string>,
  selectedCount: number,
  now = new Date(),
): WorkflowStoreKpiNumbers {
  let createToday = 0;
  let updateToday = 0;
  let local = 0;
  let installed = 0;
  let available = 0;
  for (const entry of entries) {
    if (isLocalCalendarToday(entry.createdAt, now)) createToday += 1;
    if (isLocalCalendarToday(entry.updatedAt, now)) updateToday += 1;
    const presence = resolveStoreEntryPresence(entry.id, localIds, installedIds);
    if (presence === "local") local += 1;
    else if (presence === "installed") installed += 1;
    else available += 1;
  }
  return {
    total: entries.length,
    createToday,
    updateToday,
    local,
    installed,
    available,
    selected: selectedCount,
  };
}

export function buildWorkflowStoreKpiItems(kpis: WorkflowStoreKpiNumbers): KpiTileData[] {
  return STORE_KPI_TILES.map((row) => ({
    prefKey: row.key,
    label: row.label,
    value: row.pick(kpis),
    emojiGlyph: STEALTH_WORKFLOW_STORE_KPI_STICKER[row.key],
    tone: row.tone,
  }));
}

export function resolveWorkflowStoreKpiVisibleKeys(stored: Set<string> | null): Set<string> {
  if (!stored) return DEFAULT_WORKFLOW_STORE_KPI_KEYS;
  if (isExactKeySet(stored, LEGACY_STORE_KPI_MERGED_INSTALLED)) return DEFAULT_WORKFLOW_STORE_KPI_KEYS;
  const known = WORKFLOW_STORE_KPI_KEYS as readonly string[];
  const recognized = [...stored].filter((key) => known.includes(key));
  const hasForeign = [...stored].some((key) => !known.includes(key));
  if (recognized.length === 0) return DEFAULT_WORKFLOW_STORE_KPI_KEYS;
  if (hasForeign && !recognized.some((key) => key !== "total")) return DEFAULT_WORKFLOW_STORE_KPI_KEYS;
  return new Set(recognized);
}
