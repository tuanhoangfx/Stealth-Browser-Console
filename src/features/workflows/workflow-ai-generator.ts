import { routerHttp } from "./router-client";
import { formatRouterError, isRouterRetryableModelError } from "./router-errors";
import type { RouterSettings } from "./router-settings";
import type { WorkflowConfig } from "./workflow-types";
import {
  buildFewShotExamples,
  buildStepSetGeneratorSystemPrompt,
  buildStepSetUserMessage,
  buildWorkflowGeneratorSystemPrompt,
  buildWorkflowUserMessage,
} from "./workflow-ai-prompt";
import {
  extractJsonFromModelText,
  parseRouterChatCompletionBody,
  sanitizeGeneratedSteps,
  sanitizeGeneratedWorkflow,
} from "./sanitize-generated-workflow";

const ROUTER_TIMEOUT_MS = 120_000;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiGenerateScope = "workflow" | "step-set";

export type GenerateWorkflowOptions = {
  scope?: AiGenerateScope;
  currentWorkflow?: WorkflowConfig | null;
  fewShotWorkflows?: WorkflowConfig[];
  selectedStepId?: string | null;
};

async function callRouterChat(settings: RouterSettings, messages: ChatMessage[], model: string) {
  const response = await routerHttp(settings, "chat/completions", {
    method: "POST",
    timeoutMs: ROUTER_TIMEOUT_MS,
    body: {
      model,
      messages,
      max_tokens: settings.maxTokens,
      temperature: settings.temperature
    }
  });

  const body = response.body;
  if (!response.ok) {
    throw new Error(formatRouterError(response.status, body, model));
  }

  return parseRouterChatCompletionBody(body);
}

function mergeStepSetIntoWorkflow(
  current: WorkflowConfig,
  generatedSteps: WorkflowConfig["steps"],
  selectedStepId: string | null | undefined,
  raw: unknown,
): WorkflowConfig["steps"] {
  const data = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (Array.isArray(data.steps) && data.steps.length > 0) {
    return generatedSteps;
  }
  if (data.step && selectedStepId && generatedSteps.length === 1) {
    const next = generatedSteps[0];
    return current.steps.map((step) => (step.id === selectedStepId ? { ...next, id: step.id } : step));
  }
  return generatedSteps.length ? generatedSteps : current.steps;
}

export async function generateWorkflowFromPrompt(
  settings: RouterSettings,
  userPrompt: string,
  options: GenerateWorkflowOptions = {}
): Promise<{ workflow: WorkflowConfig; modelUsed: string; rawText: string }> {
  const prompt = userPrompt.trim();
  if (!prompt) throw new Error("Describe the steps you want in this workflow.");
  if (!settings.apiKey.trim()) {
    throw new Error("9Router API key is missing. Add config/router.local.json or Settings → 9Router AI.");
  }

  const scope = options.scope ?? "workflow";
  const current = options.currentWorkflow ?? null;
  const fewShots = buildFewShotExamples(options.fewShotWorkflows);

  const messages: ChatMessage[] =
    scope === "step-set"
      ? [
          { role: "system", content: buildStepSetGeneratorSystemPrompt() },
          {
            role: "user",
            content: buildStepSetUserMessage(prompt, current, options.selectedStepId ?? null),
          },
        ]
      : [
          { role: "system", content: buildWorkflowGeneratorSystemPrompt(fewShots) },
          { role: "user", content: buildWorkflowUserMessage(prompt, current) },
        ];

  const models = [settings.model, ...settings.fallbacks].filter(Boolean);
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const rawText = await callRouterChat(settings, messages, model);
      const parsed = extractJsonFromModelText(rawText);
      if (scope === "step-set" && current) {
        const targetUrl = current.targetUrl;
        const generatedSteps = sanitizeGeneratedSteps(parsed, targetUrl);
        const steps = mergeStepSetIntoWorkflow(current, generatedSteps, options.selectedStepId, parsed);
        const workflow: WorkflowConfig = { ...current, steps };
        return { workflow, modelUsed: model, rawText };
      }
      const workflow = sanitizeGeneratedWorkflow(parsed, prompt);
      return { workflow, modelUsed: model, rawText };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      lastError = err;
      const retryable =
        isRouterRetryableModelError(0, err.message) ||
        /json|valid json|non-whitespace character/i.test(err.message);
      if (!retryable) break;
    }
  }

  throw lastError ?? new Error("9Router workflow generation failed.");
}
