import type { KpiTileData } from "@tool-workspace/hub-ui";
import { isLocalCalendarToday, isWithinLocalDays } from "../../lib/local-calendar-today";
import { STEALTH_WORKFLOW_KPI_STICKER } from "../../lib/stealth-column-stickers";
import type { WorkflowConfig } from "./workflow-types";

export const WORKFLOW_SCRIPT_KPI_KEYS = [
  "total",
  "create_today",
  "create_week",
  "update_today",
  "ran_today",
  "with_steps",
  "idle",
  "empty",
] as const;

export type WorkflowScriptKpiKey = (typeof WORKFLOW_SCRIPT_KPI_KEYS)[number];

export const DEFAULT_WORKFLOW_KPI_KEYS = new Set<string>(WORKFLOW_SCRIPT_KPI_KEYS);

const LEGACY_6_WORKFLOW_KPI_KEYS = new Set([
  "total",
  "create_today",
  "update_today",
  "ran_today",
  "idle",
  "empty",
]);

function isExactKeySet(stored: Set<string>, expected: Set<string>): boolean {
  if (stored.size !== expected.size) return false;
  for (const key of expected) if (!stored.has(key)) return false;
  return true;
}

export type WorkflowKpiNumbers = {
  total: number;
  createToday: number;
  createWeek: number;
  updateToday: number;
  ranToday: number;
  withSteps: number;
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
  { key: "create_week", label: "Create This Week", tone: "indigo", pick: (k) => k.createWeek },
  { key: "update_today", label: "Update today", tone: "amber", pick: (k) => k.updateToday },
  { key: "ran_today", label: "Ran today", tone: "emerald", pick: (k) => k.ranToday },
  { key: "with_steps", label: "Ready Scripts", tone: "sky", pick: (k) => k.withSteps },
  { key: "idle", label: "Idle", tone: "amber", pick: (k) => k.idle },
  { key: "empty", label: "Empty", tone: "rose", pick: (k) => k.empty },
];

/** Catalog-wide Scripts KPI — 8-KPI SSOT (count does not shrink on tile click). */
export function computeWorkflowKpiNumbers(workflows: readonly WorkflowConfig[], now = new Date()): WorkflowKpiNumbers {
  let createToday = 0;
  let createWeek = 0;
  let updateToday = 0;
  let ranToday = 0;
  let withSteps = 0;
  let idle = 0;
  let empty = 0;
  for (const workflow of workflows) {
    if (isLocalCalendarToday(workflow.createdAt, now)) createToday += 1;
    if (isWithinLocalDays(workflow.createdAt, now, 7)) createWeek += 1;
    if (isLocalCalendarToday(workflow.updatedAt, now)) updateToday += 1;
    if (isLocalCalendarToday(workflow.lastRunAt, now)) ranToday += 1;
    if (workflow.steps.length > 0) withSteps += 1;
    if (!workflow.lastRunAt?.trim()) idle += 1;
    if (workflow.steps.length === 0) empty += 1;
  }
  return { total: workflows.length, createToday, createWeek, updateToday, ranToday, withSteps, idle, empty };
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
  if (isExactKeySet(stored, LEGACY_6_WORKFLOW_KPI_KEYS)) return DEFAULT_WORKFLOW_KPI_KEYS;
  const known = WORKFLOW_SCRIPT_KPI_KEYS as readonly string[];
  const recognized = [...stored].filter((key) => known.includes(key));
  const hasForeign = [...stored].some((key) => !known.includes(key));
  if (recognized.length === 0) return DEFAULT_WORKFLOW_KPI_KEYS;
  if (hasForeign && !recognized.some((key) => key !== "total")) return DEFAULT_WORKFLOW_KPI_KEYS;
  return new Set(recognized);
}
