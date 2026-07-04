import { clampConcurrency } from "../../app/constants";
import type { ScriptStep } from "../../types";
import type { WorkflowConfig } from "./workflow-types";
import { DEFAULT_WORKFLOWS, hydrateWorkflowSteps, workflowSteps } from "./workflow-defaults";

export function resolveUniqueWorkflowId(existingIds: Iterable<string>, desiredId: string): string {
  const taken = new Set(existingIds);
  const base = String(desiredId || "workflow").trim() || "workflow";
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export function normalizeImportedWorkflow(
  data: Partial<WorkflowConfig>,
  options?: { forceId?: string },
): WorkflowConfig {
  const url = data.targetUrl || "https://example.com";
  const preset =
    DEFAULT_WORKFLOWS.find((item) => item.id === data.id)?.steps || workflowSteps(url, true);
  const rawId = options?.forceId || data.id || `workflow-${crypto.randomUUID()}`;
  return {
    id: rawId,
    name: data.name || rawId,
    description: data.description || "",
    icon: data.icon || "play",
    group: data.group || "Core",
    platform: data.platform || "Generic",
    action: (data.action as string) === "set-screen-resolution-real" ? "open-url" : data.action || "open-url",
    targetUrl: url,
    takeScreenshot: Boolean(data.takeScreenshot),
    closeWhenDone: Boolean(data.closeWhenDone),
    inspectMode: Boolean(data.inspectMode),
    concurrency: clampConcurrency(Number(data.concurrency || 1)),
    steps: hydrateWorkflowSteps(
      Array.isArray(data.steps) && data.steps.length ? (data.steps as ScriptStep[]) : [],
      preset,
      url,
    ),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export function mergeInstalledWorkflow(
  configs: WorkflowConfig[],
  imported: WorkflowConfig,
  options?: { replaceExisting?: boolean },
): WorkflowConfig[] {
  const existing = configs.find((item) => item.id === imported.id);
  if (!existing) return [...configs, imported];
  if (options?.replaceExisting) {
    return configs.map((item) => (item.id === imported.id ? imported : item));
  }
  const uniqueId = resolveUniqueWorkflowId(
    configs.map((item) => item.id),
    imported.id,
  );
  return [...configs, { ...imported, id: uniqueId, name: `${imported.name} (${uniqueId})` }];
}
