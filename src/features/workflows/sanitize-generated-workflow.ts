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

function mapRawSteps(raw: unknown, targetUrl: string): ScriptStep[] {
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
        enabled: row.enabled !== false,
      });
    })
    .filter(Boolean) as ScriptStep[];

  const preset = workflowSteps(targetUrl, true);
  return hydrateWorkflowSteps(mapped, preset, targetUrl);
}

function parseSteps(raw: unknown, targetUrl: string): ScriptStep[] {
  return mapRawSteps(raw, targetUrl);
}

export function sanitizeGeneratedSteps(raw: unknown, targetUrl: string): ScriptStep[] {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (Array.isArray(raw)) return mapRawSteps(raw, targetUrl);
  if (data.step && typeof data.step === "object") {
    return mapRawSteps([data.step], targetUrl);
  }
  return mapRawSteps(data.steps, targetUrl);
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

/** Find end index of JSON value starting at `start` (tracks nested `{}` and `[]`). */
function findJsonEnd(text: string, start: number): number | null {
  const first = text[start];
  if (first !== "{" && first !== "[") return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      const expected = stack.pop();
      if (!expected || ch !== expected) return null;
      if (stack.length === 0) return i;
    }
  }

  return null;
}

function collectJsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const out: string[] = [];
  const seen = new Set<string>();

  function push(candidate: string | null | undefined) {
    const value = candidate?.trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  }

  for (const match of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    push(match[1]);
    const inner = match[1]?.trim();
    if (inner) {
      for (let i = 0; i < inner.length; i += 1) {
        if (inner[i] !== "{" && inner[i] !== "[") continue;
        const end = findJsonEnd(inner, i);
        if (end !== null) push(inner.slice(i, end + 1));
      }
    }
  }

  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] !== "{" && trimmed[i] !== "[") continue;
    const end = findJsonEnd(trimmed, i);
    if (end !== null) push(trimmed.slice(i, end + 1));
  }

  return out;
}

export function extractJsonFromModelText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Model response is empty.");

  const candidates = collectJsonCandidates(trimmed);
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("Model response is not valid JSON. Try a shorter prompt or Gen again.");
}

/** Parse OpenAI-style chat completion HTTP body. */
export function parseRouterChatCompletionBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("9Router returned an empty response.");

  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = JSON.parse(trimmed) as typeof payload;
  } catch {
    const candidate = collectJsonCandidates(trimmed)[0];
    if (!candidate) throw new Error("9Router response is not valid JSON.");
    payload = JSON.parse(candidate) as typeof payload;
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("9Router returned empty model content.");
  }
  return content;
}
