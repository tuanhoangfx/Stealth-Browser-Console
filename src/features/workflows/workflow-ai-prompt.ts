import { DEFAULT_WORKFLOWS } from "./workflow-defaults";
import type { WorkflowConfig } from "./workflow-types";

const FEW_SHOT_IDS = ["ip-check", "ag-appeal-form", "github-education"] as const;

export type WorkflowPromptExample = {
  name: string;
  description: string;
  icon: WorkflowConfig["icon"];
  group: WorkflowConfig["group"];
  platform: string;
  action: WorkflowConfig["action"];
  targetUrl: string;
  takeScreenshot: boolean;
  closeWhenDone: boolean;
  inspectMode: boolean;
  concurrency: number;
  steps: Array<{
    kind: string;
    name: string;
    selector?: string;
    value?: string;
    timeoutMs: number;
    enabled: boolean;
  }>;
};

export function compactWorkflowForPrompt(workflow: WorkflowConfig): WorkflowPromptExample {
  return {
    name: workflow.name,
    description: workflow.description,
    icon: workflow.icon,
    group: workflow.group,
    platform: workflow.platform,
    action: workflow.action,
    targetUrl: workflow.targetUrl,
    takeScreenshot: workflow.takeScreenshot,
    closeWhenDone: workflow.closeWhenDone,
    inspectMode: workflow.inspectMode,
    concurrency: workflow.concurrency,
    steps: workflow.steps.map((step) => ({
      kind: step.kind,
      name: step.name,
      ...(step.selector ? { selector: step.selector } : {}),
      ...(step.value ? { value: step.value } : {}),
      timeoutMs: step.timeoutMs ?? 10000,
      enabled: step.enabled !== false
    }))
  };
}

export function buildFewShotExamples(workflows: WorkflowConfig[] = DEFAULT_WORKFLOWS): WorkflowPromptExample[] {
  const picked: WorkflowPromptExample[] = [];
  for (const id of FEW_SHOT_IDS) {
    const workflow = workflows.find((item) => item.id === id);
    if (workflow) picked.push(compactWorkflowForPrompt(workflow));
  }
  if (!picked.length && workflows[0]) picked.push(compactWorkflowForPrompt(workflows[0]));
  return picked;
}

export function buildWorkflowGeneratorSystemPrompt(fewShots: WorkflowPromptExample[] = buildFewShotExamples()) {
  const examplesBlock = fewShots
    .map((example, index) => `### Example ${index + 1}: ${example.name}\n${JSON.stringify(example, null, 2)}`)
    .join("\n\n");

  return `You are a workflow author for Stealth Browser Console (browser automation via CloakBrowser + Playwright/CDP).

Return ONLY a single JSON object. No markdown fences. No text before or after the JSON.
{
  "name": string,
  "description": string,
  "icon": "play" | "globe" | "camera" | "shield" | "education" | "layers",
  "group": "Core" | "Account Check" | "Appeal",
  "platform": string (short label, e.g. Generic, Google, Microsoft),
  "action": "open-url" | "google-form-ag-appeal",
  "targetUrl": string (https URL),
  "takeScreenshot": boolean,
  "closeWhenDone": boolean,
  "inspectMode": boolean,
  "concurrency": number (1-10),
  "steps": [
    {
      "kind": "navigate" | "wait" | "click" | "type" | "delay" | "scroll" | "screenshot" | "condition" | "action",
      "name": string,
      "selector": string (optional, Playwright selector for interact steps),
      "value": string (optional, URL for navigate or text for type),
      "timeoutMs": number,
      "enabled": boolean
    }
  ]
}

Rules:
- Use action "open-url" unless the user explicitly needs the built-in AG Google Form flow (then use "google-form-ag-appeal" with that form URL).
- Match step naming and timeouts from the library examples when the task is similar (navigate → wait → screenshot).
- For google-form-ag-appeal: navigate to form URL, then action step with value "google-form-ag-appeal", then screenshot — see Example 2.
- Prefer realistic Playwright selectors: button:has-text("..."), text="...", input[type="email"], role=button[name="Submit"].
- Always include navigate to targetUrl as first step when using open-url.
- Use wait after navigate before interact/screenshot when appropriate (15000ms for page idle is common).
- Do NOT invent unsupported action slugs or step kinds.
- concurrency: 1 for fragile/login flows, 2 for normal checks.
- Write name/description in Vietnamese if the user writes in Vietnamese.
- When refining an existing workflow, keep the same intent unless the user asks to change it.

Library examples (from DEFAULT_WORKFLOWS — follow their structure):

${examplesBlock}`;
}

export function buildWorkflowUserMessage(prompt: string, current?: WorkflowConfig | null) {
  const trimmed = prompt.trim();
  if (!current) return trimmed;

  const summary = compactWorkflowForPrompt(current);
  return `Current workflow being edited:
${JSON.stringify(summary, null, 2)}

User request:
${trimmed}`;
}

export function buildStepSetGeneratorSystemPrompt() {
  return `You are a browser automation step author for Stealth Browser Console.

Return ONLY valid JSON — no markdown fences, no commentary before or after.

Preferred shape (full revised step list):
{
  "steps": [
    {
      "kind": "navigate" | "wait" | "click" | "type" | "delay" | "scroll" | "screenshot" | "condition" | "action",
      "name": string,
      "selector": string (optional),
      "value": string (optional),
      "timeoutMs": number,
      "enabled": boolean
    }
  ]
}

When the user asks to change ONLY the selected step, you may return:
{ "step": { ...single step fields... } }

Rules:
- Keep existing steps that the user did not ask to change.
- Use realistic Playwright selectors.
- Do NOT change workflow name, targetUrl, or metadata — steps only.
- Write step names in Vietnamese if the user writes in Vietnamese.`;
}

export function buildStepSetUserMessage(
  prompt: string,
  current: WorkflowConfig | null,
  selectedStepId: string | null,
) {
  const trimmed = prompt.trim();
  if (!current) return trimmed;

  const stepsSummary = current.steps.map((step, index) => ({
    index: index + 1,
    id: step.id,
    kind: step.kind,
    name: step.name,
    selector: step.selector,
    value: step.value,
    timeoutMs: step.timeoutMs,
    enabled: step.enabled !== false,
  }));

  const selected = selectedStepId
    ? current.steps.find((step) => step.id === selectedStepId)
    : null;

  const selectedBlock = selected
    ? `\nSelected step to focus on:\n${JSON.stringify(
        {
          kind: selected.kind,
          name: selected.name,
          selector: selected.selector,
          value: selected.value,
          timeoutMs: selected.timeoutMs,
          enabled: selected.enabled !== false,
        },
        null,
        2,
      )}\n`
    : "";

  return `Current workflow steps (keep unchanged unless the user asks to edit them):
${JSON.stringify(stepsSummary, null, 2)}
${selectedBlock}
User request:
${trimmed}`;
}
