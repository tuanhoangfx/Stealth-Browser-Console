import { Clock, Hash, Link2, MousePointerClick, Type } from "lucide-react";
import { HubFormFieldLabel, HubSingleFilterDropdown } from "@tool-workspace/hub-ui";
import type { ScriptStep, ScriptStepKind } from "../../types";
import { catalogEntryForKind } from "./script-step-catalog";
import { WorkflowStepBulkActionBar } from "./WorkflowStepBulkActionBar";

const STEP_STATUS_OPTIONS = [
  { value: "active", label: "Active", title: "Step runs during workflow execution" },
  { value: "inactive", label: "Inactive", title: "Step is skipped at runtime" },
] as const;

export type WorkflowStepInspectorPanelProps = {
  step: ScriptStep;
  scriptStepKinds: ScriptStepKind[];
  savePulse: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onSetEnabled: (enabled: boolean) => void;
  onUpdate: (patch: Partial<ScriptStep>) => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
};

export function WorkflowStepInspectorPanel({
  step,
  scriptStepKinds,
  savePulse,
  canUndo,
  canRedo,
  onSetEnabled,
  onUpdate,
  onSave,
  onUndo,
  onRedo,
  onMoveUp,
  onMoveDown,
  onDelete,
}: WorkflowStepInspectorPanelProps) {
  const catalogEntry = catalogEntryForKind(step.kind);
  const StepIcon = catalogEntry?.Icon;

  return (
    <div className="workflow-step-inspector">
      <div className="workflow-step-inspector__meta-row">
        <div className="workflow-step-inspector__identity">
          {StepIcon ? (
            <span className="workflow-step-inspector__kind-icon" aria-hidden>
              <StepIcon size={14} />
            </span>
          ) : null}
          <span className="workflow-step-inspector__kind-label">{catalogEntry?.label ?? step.kind}</span>
          <HubSingleFilterDropdown
            filterKey="step-status"
            label="Status"
            options={STEP_STATUS_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
              title: option.title,
            }))}
            value={step.enabled ? "active" : "inactive"}
            onChange={(value) => onSetEnabled(value === "active")}
            className="workflow-step-inspector__status-filter"
          />
        </div>

        <div className="workflow-step-inspector__fields script-inspector-form script-inspector-form--toolbar">
          <div className="inspector-field inspector-field--name">
            <label className="block min-w-0" htmlFor={`script-step-name-${step.id}`}>
              <HubFormFieldLabel icon={Type}>Name</HubFormFieldLabel>
              <input
                id={`script-step-name-${step.id}`}
                className="hub-input w-full min-w-0"
                value={step.name}
                onChange={(event) => onUpdate({ name: event.target.value })}
              />
            </label>
          </div>
          <div className="inspector-field inspector-field--type">
            <label className="block min-w-0" htmlFor={`script-step-type-${step.id}`}>
              <HubFormFieldLabel icon={MousePointerClick}>Type</HubFormFieldLabel>
              <select
                id={`script-step-type-${step.id}`}
                className="hub-input w-full min-w-0"
                value={step.kind}
                onChange={(event) => onUpdate({ kind: event.target.value as ScriptStepKind })}
              >
                {scriptStepKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="inspector-field inspector-field--timeout">
            <label className="block min-w-0" htmlFor={`script-step-timeout-${step.id}`}>
              <HubFormFieldLabel icon={Clock}>Timeout</HubFormFieldLabel>
              <input
                id={`script-step-timeout-${step.id}`}
                className="hub-input w-full min-w-0"
                type="number"
                min={0}
                max={120000}
                value={step.timeoutMs ?? 0}
                onChange={(event) => onUpdate({ timeoutMs: Number(event.target.value) })}
              />
            </label>
          </div>
          <div className="inspector-field inspector-field--selector">
            <label className="block min-w-0" htmlFor={`script-step-selector-${step.id}`}>
              <HubFormFieldLabel icon={Hash}>Selector</HubFormFieldLabel>
              <input
                id={`script-step-selector-${step.id}`}
                className="hub-input w-full min-w-0"
                value={step.selector || ""}
                onChange={(event) => onUpdate({ selector: event.target.value })}
                placeholder="css=button[type=submit]"
              />
            </label>
          </div>
          <div className="inspector-field inspector-field--value">
            <label className="block min-w-0" htmlFor={`script-step-value-${step.id}`}>
              <HubFormFieldLabel icon={Link2}>Value</HubFormFieldLabel>
              <input
                id={`script-step-value-${step.id}`}
                className="hub-input w-full min-w-0"
                value={step.value || ""}
                onChange={(event) => onUpdate({ value: event.target.value })}
                placeholder="URL, text, pixels, or action id"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="workflow-step-inspector__bulk-row">
        <WorkflowStepBulkActionBar
          savePulse={savePulse}
          canUndo={canUndo}
          canRedo={canRedo}
          onSave={onSave}
          onUndo={onUndo}
          onRedo={onRedo}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
