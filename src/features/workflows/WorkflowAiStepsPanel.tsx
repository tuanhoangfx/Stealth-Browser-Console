import { Bot, Check, Loader2, Sparkles, Wand2 } from "lucide-react";
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
    <section className="workflow-ai-composer" aria-label="AI workflow assistant">
      <header className="workflow-ai-composer__head">
        <span className="workflow-ai-composer__brand" aria-hidden>
          <Bot size={compactIconSize(14)} />
        </span>
        <div className="workflow-ai-composer__titles">
          <h3 className="workflow-ai-composer__title">AI Step Assistant</h3>
          <p className="workflow-ai-composer__subtitle">Describe steps in plain language — Gen previews, Apply commits.</p>
        </div>
        <Sparkles size={compactIconSize(14)} className="workflow-ai-composer__sparkle" aria-hidden />
      </header>

      <div className="workflow-ai-composer__body">
        <textarea
          id="workflow-ai-prompt-input"
          className="workflow-ai-composer__input hub-input"
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Mô tả bước (VD: thêm wait 15s sau navigate, đổi URL sang GitHub Education…)"
          disabled={busy}
        />
      </div>

      <footer className="workflow-ai-composer__foot">
        {preview ? (
          <div className="workflow-ai-composer__preview" title={preview.description}>
            <strong>{preview.name}</strong>
            <span>{preview.steps.length} steps</span>
            {modelUsed ? <span className="workflow-ai-composer__model">{modelUsed}</span> : null}
          </div>
        ) : (
          <span className="workflow-ai-composer__foot-spacer" />
        )}
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
      </footer>

      {statusMessage ? <HubAlert tone="danger">{statusMessage}</HubAlert> : null}
    </section>
  );
});
