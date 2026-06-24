import { clampConcurrency, clampTimeout } from "../../app/constants";
import { normalizeStartupUrl } from "../../lib/startup-url";
import type { ScriptStep, ScriptStepKind } from "../../types";
import type { WorkflowConfig, WorkflowId } from "./workflow-types";
import { ensureWorkflowTimestamps } from "./workflow-meta";
import { workflowDisplayId } from "./workflow-display";

export const WORKFLOWS_KEY = "stealth-console-workflows";
export const ACTIVE_WORKFLOW_KEY = "stealth-console-active-workflow";
export const PURGED_BUILTIN_WORKFLOW_IDS = new Set<string>(["screen-resolution-real"]);

export type ScriptStepCategoryKey = "page" | "interact" | "capture" | "logic";

export function scriptStepCategoryLabel(cat: ScriptStepCategoryKey): string {
  switch (cat) {
    case "page":
      return "Page & wait";
    case "interact":
      return "Interact";
    case "capture":
      return "Capture";
    case "logic":
      return "Logic";
    default:
      return "";
  }
}

export const SCRIPT_STEP_HEADER_GROUPS: {
  cat: ScriptStepCategoryKey;
  kinds: ScriptStepKind[];
}[] = [
  { cat: "page", kinds: ["navigate", "wait"] },
  { cat: "interact", kinds: ["click", "type", "delay", "scroll"] },
  { cat: "capture", kinds: ["screenshot"] },
  { cat: "logic", kinds: ["condition", "action"] }
];

export function createStep(kind: ScriptStepKind, patch: Partial<ScriptStep> = {}): ScriptStep {
  const defaults: Record<ScriptStepKind, Pick<ScriptStep, "name" | "timeoutMs">> = {
    navigate: { name: "Navigate", timeoutMs: 60000 },
    wait: { name: "Wait selector", timeoutMs: 15000 },
    click: { name: "Click", timeoutMs: 10000 },
    type: { name: "Type", timeoutMs: 10000 },
    delay: { name: "Delay", timeoutMs: 1000 },
    scroll: { name: "Scroll", timeoutMs: 1000 },
    screenshot: { name: "Screenshot", timeoutMs: 10000 },
    condition: { name: "Condition", timeoutMs: 5000 },
    action: { name: "Special action", timeoutMs: 60000 }
  };

  return {
    id: crypto.randomUUID(),
    kind,
    name: defaults[kind].name,
    timeoutMs: defaults[kind].timeoutMs,
    enabled: true,
    ...patch
  };
}

export function workflowSteps(targetUrl: string, screenshot = true): ScriptStep[] {
  return [
    createStep("navigate", { value: targetUrl }),
    createStep("wait", { name: "Wait for page idle", timeoutMs: 15000 }),
    ...(screenshot ? [createStep("screenshot", { name: "Capture evidence" })] : [])
  ];
}

/** Step `value` slugs dropped from product — stripped on load/import/duplicate */
const OBSOLETE_SCRIPT_STEP_VALUES = new Set<string>(["set-screen-resolution-real"]);

export function stripObsoleteScriptSteps(steps: ScriptStep[]): ScriptStep[] {
  return steps.filter((step) => !OBSOLETE_SCRIPT_STEP_VALUES.has(String(step.value ?? "").trim()));
}

/** Drop deprecated steps, remap ids & timeouts; refill from preset if nothing left */
export function hydrateWorkflowSteps(raw: ScriptStep[], preset: ScriptStep[], fallbackUrl: string): ScriptStep[] {
  let base = stripObsoleteScriptSteps(raw);
  if (!base.length) base = stripObsoleteScriptSteps(preset);
  if (!base.length) base = workflowSteps(fallbackUrl || "https://example.com", false);
  return base.map((step) => ({
    ...step,
    id: step.id || crypto.randomUUID(),
    enabled: Boolean(step.enabled ?? true),
    timeoutMs: clampTimeout(Number(step.timeoutMs ?? 10000))
  }));
}

export const DEFAULT_WORKFLOWS: WorkflowConfig[] = [
  {
    id: "open-url",
    name: "Open URL",
    description: "Open a target page and optionally capture a screenshot.",
    icon: "play",
    group: "Core",
    platform: "Generic",
    action: "open-url",
    targetUrl: "https://browserleaks.com/ip",
    takeScreenshot: true,
    closeWhenDone: false,
    inspectMode: false,
    concurrency: 2,
    steps: workflowSteps("https://browserleaks.com/ip", true)
  },
  {
    id: "ip-check",
    name: "IP Check",
    description: "Inspect network identity on BrowserLeaks.",
    icon: "globe",
    group: "Account Check",
    platform: "Generic",
    action: "open-url",
    targetUrl: "https://browserleaks.com/ip",
    takeScreenshot: true,
    closeWhenDone: true,
    inspectMode: false,
    concurrency: 2,
    steps: workflowSteps("https://browserleaks.com/ip", true)
  },
  {
    id: "screenshot-check",
    name: "Screenshot Audit",
    description: "Open a page, save evidence, then close the profile.",
    icon: "camera",
    group: "Core",
    platform: "Generic",
    action: "open-url",
    targetUrl: "https://example.com",
    takeScreenshot: true,
    closeWhenDone: true,
    inspectMode: false,
    concurrency: 1,
    steps: workflowSteps("https://example.com", true)
  },
  {
    id: "github-education",
    name: "GitHub Education",
    description: "Check GitHub Education benefit status.",
    icon: "education",
    group: "Account Check",
    platform: "GitHub",
    action: "open-url",
    targetUrl: "https://github.com/settings/education/benefits",
    takeScreenshot: true,
    closeWhenDone: false,
    inspectMode: false,
    concurrency: 2,
    steps: workflowSteps("https://github.com/settings/education/benefits", true)
  },
  {
    id: "google-one-ai",
    name: "Google One AI",
    description: "Check Google One AI plan and credit activity.",
    icon: "layers",
    group: "Account Check",
    platform: "Google",
    action: "open-url",
    targetUrl: "https://one.google.com/u/0/ai/activity",
    takeScreenshot: true,
    closeWhenDone: false,
    inspectMode: false,
    concurrency: 2,
    steps: [
      createStep("navigate", { value: "https://one.google.com/u/0/ai/activity" }),
      createStep("wait", { name: "Wait after navigate", timeoutMs: 15000 }),
      createStep("screenshot", { name: "Capture evidence" })
    ]
  },
  {
    id: "ag-appeal-form",
    name: "AG Appeal Form",
    description: "Select Email, confirm understanding, then submit the AG appeal form.",
    icon: "shield",
    group: "Appeal",
    platform: "Google Forms",
    action: "google-form-ag-appeal",
    targetUrl: "https://forms.gle/hGzM9MEUv2azZsrb9",
    takeScreenshot: true,
    closeWhenDone: true,
    inspectMode: true,
    concurrency: 1,
    steps: [
      createStep("navigate", { value: "https://forms.gle/hGzM9MEUv2azZsrb9" }),
      createStep("action", { name: "Complete AG appeal form", value: "google-form-ag-appeal", timeoutMs: 60000 }),
      createStep("screenshot", { name: "Capture result" })
    ]
  },
  {
    id: "chatgpt-login",
    name: "ChatGPT Login",
    description: "Open ChatGPT login and capture the account entry state.",
    icon: "play",
    group: "Account Check",
    platform: "OpenAI",
    action: "open-url",
    targetUrl: "https://chatgpt.com",
    takeScreenshot: true,
    closeWhenDone: false,
    inspectMode: false,
    concurrency: 1,
    steps: [createStep("navigate", { value: "https://chatgpt.com" })]
  },
  {
    id: "microsoft-hotmail-login",
    name: "Login Microsoft Hotmail",
    description: "Open Microsoft account login for Hotmail/Outlook accounts.",
    icon: "play",
    group: "Account Check",
    platform: "Microsoft",
    action: "open-url",
    targetUrl: "https://login.live.com/",
    takeScreenshot: false,
    closeWhenDone: false,
    inspectMode: false,
    concurrency: 1,
    steps: [createStep("navigate", { value: "https://login.live.com/" })]
  },
  {
    id: "microsoft-hotmail-mail",
    name: "Check Mail Microsoft Hotmail",
    description: "Open Outlook web mail inbox for Hotmail/Outlook accounts.",
    icon: "play",
    group: "Account Check",
    platform: "Microsoft",
    action: "open-url",
    targetUrl: "https://outlook.live.com/mail/0/",
    takeScreenshot: false,
    closeWhenDone: false,
    inspectMode: false,
    concurrency: 1,
    steps: [createStep("navigate", { value: "https://outlook.live.com/mail/0/" })]
  },
  {
    id: "higgsfield-change-password",
    name: "Higgsfield Change Password",
    description: "Open Higgsfield password reset, send reset code, then enter code and new password.",
    icon: "shield",
    group: "Account Check",
    platform: "Higgsfield",
    action: "open-url",
    targetUrl: "https://higgsfield.ai/",
    takeScreenshot: false,
    closeWhenDone: false,
    inspectMode: true,
    concurrency: 1,
    steps: [
      createStep("navigate", { value: "https://higgsfield.ai/" }),
      createStep("wait", { name: "Wait homepage", timeoutMs: 15000 }),
      createStep("click", { name: "Open Login modal", selector: 'button:has-text("Login"), a:has-text("Login")', timeoutMs: 15000 }),
      createStep("click", { name: "Continue with Email", selector: 'button:has-text("Continue with Email")', timeoutMs: 15000 }),
      createStep("click", { name: "Open Forgot password", selector: 'text="Forgot password?"', timeoutMs: 15000 }),
      createStep("type", {
        name: "Type account email",
        selector: 'input[placeholder="Email"], input[type="email"]',
        value: "{{higgsfieldEmail}}",
        timeoutMs: 10000
      }),
      createStep("click", { name: "Send reset code", selector: 'button:has-text("Send code")', timeoutMs: 15000 }),
      createStep("type", {
        name: "Type reset code",
        selector: 'input[placeholder="Code"]',
        value: "{{higgsfieldResetCode}}",
        timeoutMs: 10000
      }),
      createStep("type", {
        name: "Type new password",
        selector: 'input[placeholder="New password"], input[type="password"]',
        value: "{{higgsfieldNewPassword}}",
        timeoutMs: 10000
      }),
      createStep("click", { name: "Change password", selector: 'button:has-text("Change password")', timeoutMs: 15000 }),
      createStep("click", { name: "Skip browser save password", selector: 'text="Never"', timeoutMs: 5000, enabled: false })
    ]
  }
];

export function normalizeUrl(value: string) {
  return normalizeStartupUrl(value) || "";
}

export function sameWorkflowUrl(left?: string, right?: string) {
  const first = String(left || "").trim();
  const second = String(right || "").trim();
  if (!first || !second) return first === second;
  return first === second || normalizeUrl(first) === normalizeUrl(second);
}

export function syncFirstNavigateStep(steps: ScriptStep[], previousTargetUrl: string, nextTargetUrl: string) {
  let synced = false;
  return steps.map((step) => {
    if (synced || step.kind !== "navigate") return step;
    synced = true;

    const value = String(step.value || "").trim();
    if (value && value !== "{{targetUrl}}" && !sameWorkflowUrl(value, previousTargetUrl)) return step;
    return { ...step, value: nextTargetUrl };
  });
}

export function workflowStepsForRun(workflow: WorkflowConfig, targetUrl: string) {
  const defaultWorkflow = DEFAULT_WORKFLOWS.find((item) => item.id === workflow.id);
  let synced = false;

  return stripObsoleteScriptSteps(workflow.steps).map((step) => {
    if (synced || step.kind !== "navigate") return step;
    synced = true;

    const value = String(step.value || "").trim();
    if (!value || value === "{{targetUrl}}" || sameWorkflowUrl(value, workflow.targetUrl) || sameWorkflowUrl(value, defaultWorkflow?.targetUrl)) {
      return { ...step, value: targetUrl };
    }

    return step;
  });
}

export function readStoredActiveWorkflow(): WorkflowId {
  const stored = localStorage.getItem(ACTIVE_WORKFLOW_KEY) || "open-url";
  if (PURGED_BUILTIN_WORKFLOW_IDS.has(stored)) return "open-url";
  return stored;
}

export function readStoredWorkflows(): WorkflowConfig[] {
  try {
    const stored = JSON.parse(localStorage.getItem(WORKFLOWS_KEY) || "[]") as Partial<WorkflowConfig>[];
    const storedCustom = stored.filter(
      (item) =>
        item.id &&
        !PURGED_BUILTIN_WORKFLOW_IDS.has(String(item.id)) &&
        !DEFAULT_WORKFLOWS.some((workflow) => workflow.id === item.id)
    );
    const merged = [
      ...DEFAULT_WORKFLOWS.map((workflow) => {
        const override = stored.find((item) => item.id === workflow.id);
        return {
          ...workflow,
          ...override,
          id: workflow.id,
          icon: override?.icon || workflow.icon,
          group: override?.group || workflow.group,
          platform: override?.platform || workflow.platform,
          action: override?.action || workflow.action,
          inspectMode: Boolean(override?.inspectMode ?? workflow.inspectMode),
          concurrency: clampConcurrency(Number(override?.concurrency ?? workflow.concurrency)),
          steps: hydrateWorkflowSteps(
            Array.isArray(override?.steps) && override.steps.length ? (override.steps as ScriptStep[]) : workflow.steps,
            workflow.steps,
            workflow.targetUrl || ""
          )
        };
      }),
      ...storedCustom
    ];

    const sanitized = merged.filter(
      (workflow) =>
        workflow.id &&
        String(workflow.id).length &&
        !PURGED_BUILTIN_WORKFLOW_IDS.has(String(workflow.id)) &&
        (workflow.action as string) !== "set-screen-resolution-real"
    );

    return sanitized.map((workflow, index) => {
      const fallback = DEFAULT_WORKFLOWS.find((item) => item.id === workflow.id);
      const preset = fallback?.steps || workflowSteps(workflow.targetUrl || "", false);
      const raw = Array.isArray(workflow.steps) && workflow.steps.length ? workflow.steps : preset;
      return ensureWorkflowTimestamps(
        {
          ...(fallback || DEFAULT_WORKFLOWS[0]),
          ...workflow,
          id: workflow.id || `workflow-${crypto.randomUUID()}`,
          icon: workflow.icon || fallback?.icon || "play",
          group: workflow.group || fallback?.group || "Core",
          platform: workflow.platform || fallback?.platform || "Generic",
          action: workflow.action || fallback?.action || "open-url",
          inspectMode: Boolean(workflow.inspectMode ?? fallback?.inspectMode ?? false),
          concurrency: clampConcurrency(Number(workflow.concurrency ?? fallback?.concurrency ?? 1)),
          steps: hydrateWorkflowSteps(raw, preset, workflow.targetUrl || ""),
        },
        Date.now() - index * 86_400_000,
      );
    });
  } catch {
    return DEFAULT_WORKFLOWS;
  }
}

export function workflowExportPayload(workflows: WorkflowConfig[]) {
  return workflows.map((workflow) => ({
    displayId: workflowDisplayId(workflow.id, DEFAULT_WORKFLOWS),
    ...workflow
  }));
}
