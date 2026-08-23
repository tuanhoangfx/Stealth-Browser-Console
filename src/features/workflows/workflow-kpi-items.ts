import type { KpiTileData } from "@tool-workspace/hub-ui";
import { isLocalCalendarToday } from "../../lib/local-calendar-today";
import { STEALTH_WORKFLOW_KPI_STICKER } from "../../lib/stealth-column-stickers";
import type { WorkflowConfig } from "./workflow-types";

export const WORKFLOW_SCRIPT_KPI_KEYS = [
  "total",
  "create_today",
  "update_today",
  "ran_today",
  "idle",
  "empty",
] as const;

export type WorkflowScriptKpiKey = (typeof WORKFLOW_SCRIPT_KPI_KEYS)[number];

export const DEFAULT_WORKFLOW_KPI_KEYS = new Set<string>(WORKFLOW_SCRIPT_KPI_KEYS);

export type WorkflowKpiNumbers = {
  total: number;
  createToday: number;
  updateToday: number;
  ranToday: number;
  idle: number;
  empty: number;
};

const SCRIPT_KPI_TILES: Array<{
  key: WorkflowScriptKpiKey;
  label: string;
  tone: NonNullable<KpiTileData["tone"]>;
  pick: (k: WorkflowKpiNumbers) => number;
}> = [
  { key: "total", label: "Scripts", tone: "indigo", pick: (k) => k.total },
  { key: "create_today", label: "Create today", tone: "emerald", pick: (k) => k.createToday },
  { key: "update_today", label: "Update today", tone: "amber", pick: (k) => k.updateToday },
  { key: "ran_today", label: "Ran today", tone: "emerald", pick: (k) => k.ranToday },
  { key: "idle", label: "Idle", tone: "amber", pick: (k) => k.idle },
  { key: "empty", label: "Empty", tone: "rose", pick: (k) => k.empty },
];

/** Catalog-wide Scripts KPI — P0005 Service analog (count does not shrink on tile click). */
export function computeWorkflowKpiNumbers(workflows: readonly WorkflowConfig[], now = new Date()): WorkflowKpiNumbers {
  let createToday = 0;
  let updateToday = 0;
  let ranToday = 0;
  let idle = 0;
  let empty = 0;
  for (const workflow of workflows) {
    if (isLocalCalendarToday(workflow.createdAt, now)) createToday += 1;
    if (isLocalCalendarToday(workflow.updatedAt, now)) updateToday += 1;
    if (isLocalCalendarToday(workflow.lastRunAt, now)) ranToday += 1;
    if (!workflow.lastRunAt?.trim()) idle += 1;
    if (workflow.steps.length === 0) empty += 1;
  }
  return { total: workflows.length, createToday, updateToday, ranToday, idle, empty };
}

export function buildWorkflowKpiItems(kpis: WorkflowKpiNumbers): KpiTileData[] {
  return SCRIPT_KPI_TILES.map((row) => ({
    prefKey: row.key,
    label: row.label,
    value: row.pick(kpis),
    emojiGlyph: STEALTH_WORKFLOW_KPI_STICKER[row.key],
    tone: row.tone,
  }));
}

/**
 * Shared `kpi=` URL may still hold Profile / legacy Scripts keys.
 * Honor a stored set only when it includes a Scripts-specific key (or only Scripts tiles).
 */
export function resolveWorkflowKpiVisibleKeys(stored: Set<string> | null): Set<string> {
  if (!stored) return DEFAULT_WORKFLOW_KPI_KEYS;
  const known = WORKFLOW_SCRIPT_KPI_KEYS as readonly string[];
  const recognized = [...stored].filter((key) => known.includes(key));
  const hasForeign = [...stored].some((key) => !known.includes(key));
  if (recognized.length === 0) return DEFAULT_WORKFLOW_KPI_KEYS;
  if (hasForeign && !recognized.some((key) => key !== "total")) return DEFAULT_WORKFLOW_KPI_KEYS;
  return new Set(recognized);
}
