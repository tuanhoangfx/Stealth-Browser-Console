import { Bot, GitBranch, ListTree, Loader2, Wand2 } from "lucide-react";
import { memo, useEffect, useState } from "react";
import {
  HubAlert,
  HubBulkActionButton,
  HubSegmentToggle,
  compactIconSize,
  hubSegmentIconSize,
} from "@tool-workspace/hub-ui";
import { generateWorkflowFromPrompt, type AiGenerateScope } from "./workflow-ai-generator";
import { bootstrapRouterSettings, pingRouter } from "./router-settings";
import type { ScriptStep } from "../../types";
import type { WorkflowConfig } from "./workflow-types";

type WorkflowAiStepsPanelProps = {
  activeWorkflowConfig: WorkflowConfig;
  selectedScriptStep: ScriptStep | null;
  defaultWorkflows: WorkflowConfig[];
  onApply: (generated: WorkflowConfig) => void;
  onSave: () => void;
};

const SCOPE_OPTIONS = [
  {
    value: "step-set" as const,
    label: "Steps",
    icon: <ListTree size={hubSegmentIconSize()} aria-hidden />,
  },
  {
    value: "workflow" as const,
    label: "Workflow",
    icon: <GitBranch size={hubSegmentIconSize()} aria-hidden />,
  },
];

export const WorkflowAiStepsPanel = memo(function WorkflowAiStepsPanel({
  activeWorkflowConfig,
  selectedScriptStep,
  defaultWorkflows,
  onApply,
  onSave,
}: WorkflowAiStepsPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState<AiGenerateScope>("step-set");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [routerStatus, setRouterStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    bootstrapRouterSettings()
      .then(async (settings) => {
        if (cancelled) return;
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
    setSuccess("");
    try {
      const settings = await bootstrapRouterSettings();
      const result = await generateWorkflowFromPrompt(settings, prompt, {
        scope,
        currentWorkflow: activeWorkflowConfig,
        fewShotWorkflows: defaultWorkflows,
        selectedStepId: selectedScriptStep?.id ?? null,
      });
      onApply(result.workflow);
      onSave();
      const label =
        scope === "step-set"
          ? `${result.workflow.steps.length} steps updated`
          : result.workflow.name || "Workflow updated";
      setSuccess(`${label} · ${result.modelUsed}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  const statusMessage = error || routerStatus;
  const scopeLabel = scope === "step-set" ? "AI Steps Assistant" : "AI Workflow Assistant";

  return (
    <section className="workflow-ai-composer workflow-ai-composer--compact" aria-label="AI workflow assistant">
      <div className="workflow-ai-composer__head">
        <span className="workflow-ai-composer__label">
          <Bot size={compactIconSize(14)} aria-hidden />
          {scopeLabel}
        </span>
        <div className={busy ? "pointer-events-none opacity-55" : undefined} title="AI assist scope">
          <HubSegmentToggle value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
        </div>
      </div>

      <div className="workflow-ai-composer__row">
        <textarea
          id="workflow-ai-prompt-input"
          className="workflow-ai-composer__input hub-input"
          rows={5}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={
            scope === "step-set"
              ? "Describe step changes (e.g. add 2 checkbox clicks after navigate, update wait timeout…)"
              : "Describe a full workflow (e.g. auto-register ChatGPT via Gmail sync…)"
          }
          disabled={busy}
        />
        <div className="workflow-ai-composer__actions">
          <HubBulkActionButton
            icon={busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Wand2 size={14} aria-hidden />}
            label="Gen"
            title="Generate and apply to workflow"
            tone="indigo"
            disabled={busy || !prompt.trim()}
            iconSpinning={busy}
            onClick={() => void handleGenerate()}
          />
        </div>
      </div>

      {success ? <HubAlert tone="info">{success}</HubAlert> : null}

      {statusMessage ? <HubAlert tone="danger">{statusMessage}</HubAlert> : null}
    </section>
  );
});
