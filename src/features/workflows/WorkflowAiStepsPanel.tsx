import { Bot, Check, Loader2, Wand2 } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { HubAlert, HubBulkActionButton, compactIconSize } from "@tool-workspace/hub-ui";
import { generateWorkflowFromPrompt } from "./workflow-ai-generator";
import { bootstrapRouterSettings, pingRouter, readRouterSettings } from "./router-settings";
import type { WorkflowConfig } from "./workflow-types";

type WorkflowAiStepsPanelProps = {
  activeWorkflowConfig: WorkflowConfig;
  defaultWorkflows: WorkflowConfig[];
  onApply: (generated: WorkflowConfig) => void;
  onSave: () => void;
};

export const WorkflowAiStepsPanel = memo(function WorkflowAiStepsPanel({
  activeWorkflowConfig,
  defaultWorkflows,
  onApply,
  onSave,
}: WorkflowAiStepsPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [modelUsed, setModelUsed] = useState("");
  const [preview, setPreview] = useState<WorkflowConfig | null>(null);
  const [routerReady, setRouterReady] = useState(false);
  const [routerStatus, setRouterStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    bootstrapRouterSettings()
      .then(async (settings) => {
        if (cancelled) return;
        setRouterReady(true);
        const ping = await pingRouter(settings);
        if (!cancelled) setRouterStatus(ping.ok ? "" : ping.message);
      })
      .catch((err) => {
        if (!cancelled) setRouterStatus(err instanceof Error ? err.message : "9Router setup failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGenerate() {
    setBusy(true);
    setError("");
    setPreview(null);
    setModelUsed("");
    try {
      let settings = routerReady ? readRouterSettings() : await bootstrapRouterSettings();
      if (!settings.apiKey.trim()) {
        settings = await bootstrapRouterSettings();
      }
      const result = await generateWorkflowFromPrompt(settings, prompt, {
        currentWorkflow: activeWorkflowConfig,
        fewShotWorkflows: defaultWorkflows,
      });
      setPreview(result.workflow);
      setModelUsed(result.modelUsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  function handleApply() {
    if (!preview) return;
    onApply(preview);
    onSave();
    setPreview(null);
    setError("");
  }

  const statusMessage = error || routerStatus;

  return (
    <section className="workflow-ai-composer workflow-ai-composer--compact" aria-label="AI workflow assistant">
      <div className="workflow-ai-composer__row">
        <span className="workflow-ai-composer__label">
          <Bot size={compactIconSize(14)} aria-hidden />
          AI Step Assistant
        </span>
        <textarea
          id="workflow-ai-prompt-input"
          className="workflow-ai-composer__input hub-input"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe a step change (e.g. add 15s wait after navigate, switch URL to GitHub Education…)"
          disabled={busy}
        />
        <div className="workflow-ai-composer__actions">
          <HubBulkActionButton
            icon={busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Wand2 size={14} aria-hidden />}
            label="Gen"
            title="Generate workflow steps"
            tone="neutral"
            disabled={busy || !prompt.trim()}
            iconSpinning={busy}
            onClick={() => void handleGenerate()}
          />
          <HubBulkActionButton
            icon={<Check size={14} aria-hidden />}
            label="Apply"
            title="Apply to canvas"
            tone="indigo"
            disabled={!preview || busy}
            onClick={handleApply}
          />
        </div>
      </div>

      {preview ? (
        <div className="workflow-ai-composer__preview" title={preview.description}>
          <strong>{preview.name}</strong>
          <span>{preview.steps.length} steps</span>
          {modelUsed ? <span className="workflow-ai-composer__model">{modelUsed}</span> : null}
        </div>
      ) : null}

      {statusMessage ? <HubAlert tone="danger">{statusMessage}</HubAlert> : null}
    </section>
  );
});
