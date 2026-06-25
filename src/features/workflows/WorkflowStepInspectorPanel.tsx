import type { LucideIcon } from "lucide-react";
import { CircleDot, Clock, Hash, Link2, MousePointerClick, Type } from "lucide-react";
import type { ReactNode } from "react";
import { HubFormFieldLabel, HubSingleFilterDropdown } from "@tool-workspace/hub-ui";
import type { ScriptStep, ScriptStepKind } from "../../types";
import { catalogEntryForKind } from "./script-step-catalog";

const STEP_STATUS_OPTIONS = [
  { value: "active", label: "Active", title: "Step runs during workflow execution" },
  { value: "inactive", label: "Inactive", title: "Step is skipped at runtime" },
] as const;

function InspectorInlineField({
  label,
  icon,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  icon?: LucideIcon;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`workflow-inspector-inline-field${className ? ` ${className}` : ""}`}>
      <HubFormFieldLabel icon={icon} className="workflow-inspector-inline-field__label">
        {htmlFor ? <span id={`${htmlFor}-label`}>{label}</span> : label}
      </HubFormFieldLabel>
      <div className="workflow-inspector-inline-field__control">{children}</div>
    </div>
  );
}

export type WorkflowStepInspectorPanelProps = {
  step: ScriptStep;
  scriptStepKinds: ScriptStepKind[];
  onSetEnabled: (enabled: boolean) => void;
  onUpdate: (patch: Partial<ScriptStep>) => void;
};

export function WorkflowStepInspectorPanel({
  step,
  scriptStepKinds,
  onSetEnabled,
  onUpdate,
}: WorkflowStepInspectorPanelProps) {
  const typeOptions = scriptStepKinds.map((kind) => {
    const entry = catalogEntryForKind(kind);
    return { value: kind, label: entry?.label ?? kind };
  });

  const statusOptions = STEP_STATUS_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    title: option.title,
  }));

  return (
    <div className="workflow-step-inspector">
      <div className="workflow-step-inspector__form script-inspector-form script-inspector-form--inline">
        <div className="workflow-inspector-row">
          <InspectorInlineField label="Name" icon={Type} htmlFor={`script-step-name-${step.id}`}>
            <input
              id={`script-step-name-${step.id}`}
              className="hub-input w-full min-w-0"
              aria-labelledby={`script-step-name-${step.id}-label`}
              value={step.name}
              onChange={(event) => onUpdate({ name: event.target.value })}
            />
          </InspectorInlineField>
          <InspectorInlineField label="Type" icon={MousePointerClick}>
            <HubSingleFilterDropdown
              filterKey={`step-type-${step.id}`}
              label="Type"
              options={typeOptions}
              value={step.kind}
              onChange={(value) => onUpdate({ kind: value as ScriptStepKind })}
              triggerFormat="value"
              className="workflow-step-inspector__filter w-full min-w-0"
              triggerClassName="w-full min-w-0"
            />
          </InspectorInlineField>
          <InspectorInlineField label="Status" icon={CircleDot}>
            <HubSingleFilterDropdown
              filterKey={`step-status-${step.id}`}
              label="Status"
              options={statusOptions}
              value={step.enabled ? "active" : "inactive"}
              onChange={(value) => onSetEnabled(value === "active")}
              triggerFormat="value"
              className="workflow-step-inspector__filter w-full min-w-0"
              triggerClassName="w-full min-w-0"
            />
          </InspectorInlineField>
        </div>

        <div className="workflow-inspector-row">
          <InspectorInlineField label="Timeout" icon={Clock} htmlFor={`script-step-timeout-${step.id}`}>
            <input
              id={`script-step-timeout-${step.id}`}
              className="hub-input w-full min-w-0"
              aria-labelledby={`script-step-timeout-${step.id}-label`}
              type="number"
              min={0}
              max={120000}
              value={step.timeoutMs ?? 0}
              onChange={(event) => onUpdate({ timeoutMs: Number(event.target.value) })}
            />
          </InspectorInlineField>
          <InspectorInlineField
            label="Selector"
            icon={Hash}
            htmlFor={`script-step-selector-${step.id}`}
            className="workflow-inspector-inline-field--wide"
          >
            <input
              id={`script-step-selector-${step.id}`}
              className="hub-input w-full min-w-0"
              aria-labelledby={`script-step-selector-${step.id}-label`}
              value={step.selector || ""}
              onChange={(event) => onUpdate({ selector: event.target.value })}
              placeholder="css=button[type=submit]"
            />
          </InspectorInlineField>
          <InspectorInlineField
            label="Value"
            icon={Link2}
            htmlFor={`script-step-value-${step.id}`}
            className="workflow-inspector-inline-field--wide"
          >
            <input
              id={`script-step-value-${step.id}`}
              className="hub-input w-full min-w-0"
              aria-labelledby={`script-step-value-${step.id}-label`}
              value={step.value || ""}
              onChange={(event) => onUpdate({ value: event.target.value })}
              placeholder="URL, text, pixels, or action id"
            />
          </InspectorInlineField>
        </div>
      </div>
    </div>
  );
}
