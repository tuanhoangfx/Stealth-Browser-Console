import { routerHttp } from "./router-client";
import type { RouterSettings } from "./router-settings";
import type { WorkflowConfig } from "./workflow-types";
import {
  buildFewShotExamples,
  buildWorkflowGeneratorSystemPrompt,
  buildWorkflowUserMessage
} from "./workflow-ai-prompt";
import { extractJsonFromModelText, sanitizeGeneratedWorkflow } from "./sanitize-generated-workflow";

const ROUTER_TIMEOUT_MS = 120_000;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type GenerateWorkflowOptions = {
  currentWorkflow?: WorkflowConfig | null;
  fewShotWorkflows?: WorkflowConfig[];
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
    const detail = body.trim() || (response.status ? `HTTP ${response.status}` : "Failed to fetch");
    throw new Error(`9Router ${response.status || "network"}: ${detail.slice(0, 400)}`);
  }

  const json = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(`9Router returned empty content (${model})`);
  }
  return content;
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

  const fewShots = buildFewShotExamples(options.fewShotWorkflows);
  const userMessage = buildWorkflowUserMessage(prompt, options.currentWorkflow ?? null);

  const messages: ChatMessage[] = [
    { role: "system", content: buildWorkflowGeneratorSystemPrompt(fewShots) },
    { role: "user", content: userMessage }
  ];

  const models = [settings.model, ...settings.fallbacks].filter(Boolean);
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const rawText = await callRouterChat(settings, messages, model);
      const parsed = extractJsonFromModelText(rawText);
      const workflow = sanitizeGeneratedWorkflow(parsed, prompt);
      return { workflow, modelUsed: model, rawText };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("9Router workflow generation failed.");
}
