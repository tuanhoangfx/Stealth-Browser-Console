import { clampConcurrency } from "../../app/constants";
import type { ScriptStep, ScriptStepKind } from "../../types";
import type { WorkflowConfig, WorkflowIconKey } from "./workflow-types";
import { createStep, hydrateWorkflowSteps, workflowSteps } from "./workflow-defaults";
import type { WorkflowExecutorAction } from "./workflow-executors";

const STEP_KINDS = new Set<ScriptStepKind>([
  "navigate",
  "wait",
  "click",
  "type",
  "delay",
  "scroll",
  "screenshot",
  "condition",
  "action"
]);

const ICONS = new Set<WorkflowIconKey>(["play", "globe", "camera", "shield", "education", "layers"]);
const GROUPS = new Set(["Core", "Account Check", "Appeal"]);
const ACTIONS = new Set<WorkflowExecutorAction>(["open-url", "google-form-ag-appeal"]);

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "https://example.com";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function parseSteps(raw: unknown, targetUrl: string): ScriptStep[] {
  if (!Array.isArray(raw)) {
    return workflowSteps(targetUrl, true);
  }
  const mapped: ScriptStep[] = raw
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const row = item as Record<string, unknown>;
      const kind = String(row.kind || "wait");
      if (!STEP_KINDS.has(kind as ScriptStepKind)) return null;
      return createStep(kind as ScriptStepKind, {
        name: String(row.name || kind),
        selector: row.selector !== undefined ? String(row.selector) : undefined,
        value: row.value !== undefined ? String(row.value) : undefined,
        timeoutMs: Number(row.timeoutMs) || undefined,
        enabled: row.enabled !== false
      });
    })
    .filter(Boolean) as ScriptStep[];

  const preset = workflowSteps(targetUrl, true);
  return hydrateWorkflowSteps(mapped, preset, targetUrl);
}

export function sanitizeGeneratedWorkflow(raw: unknown, promptHint: string): WorkflowConfig {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const targetUrl = normalizeUrl(String(data.targetUrl || ""));
  const actionRaw = String(data.action || "open-url");
  const action = ACTIONS.has(actionRaw as WorkflowExecutorAction) ? (actionRaw as WorkflowExecutorAction) : "open-url";
  const iconRaw = String(data.icon || "play");
  const icon = ICONS.has(iconRaw as WorkflowIconKey) ? (iconRaw as WorkflowIconKey) : "play";
  const groupRaw = String(data.group || "Core");
  const group = GROUPS.has(groupRaw as WorkflowConfig["group"]) ? (groupRaw as WorkflowConfig["group"]) : "Core";

  const name = String(data.name || "").trim() || `AI: ${promptHint.slice(0, 48)}`;
  const description = String(data.description || "").trim() || promptHint.slice(0, 240);

  return {
    id: `workflow-ai-${Date.now()}`,
    name,
    description,
    icon,
    group,
    platform: String(data.platform || "Generic").trim() || "Generic",
    action,
    targetUrl,
    takeScreenshot: Boolean(data.takeScreenshot ?? true),
    closeWhenDone: Boolean(data.closeWhenDone ?? false),
    inspectMode: Boolean(data.inspectMode ?? false),
    concurrency: clampConcurrency(Number(data.concurrency ?? 1)),
    steps: parseSteps(data.steps, targetUrl)
  };
}

export function extractJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) return JSON.parse(fence[1].trim());
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Model response is not valid JSON.");
  }
}
