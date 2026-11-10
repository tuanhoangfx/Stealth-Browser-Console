import type { MouseEvent } from "react";
import {
  DirectoryTableBodyCell,
  HubCopyBadge,
  HubDirectoryIconCell,
  HubDirectoryTimestampLabel,
  HubDirectoryValuePopover,
  type HubDirectoryColumnDef,
} from "@tool-workspace/hub-ui";
import { DIRECTORY_CELL_TRUNCATE } from "../../lib/directory-cell-format";
import type { StealthWorkflowColumnKey } from "../../lib/directory-column-meta";
import {
  workflowDisplayId,
  workflowDisplayPlatform,
  workflowDirectoryFallbackIcon,
  workflowPlatformBrandMatch,
  workflowPlatformTone,
} from "./workflow-display";
import { resolveHubBrandAssetSrc } from "../../lib/hub-brand-asset-src";
import { workflowCreatedMs, workflowLastRunMs, workflowStepCount, workflowUpdatedMs } from "./workflow-meta";
import type { WorkflowConfig } from "./workflow-types";
import type { StealthWorkflowSortKey } from "./StealthWorkflowDirectoryTable";

function renderWorkflowTimestampCell(ms: number | null) {
  if (ms == null || !Number.isFinite(ms) || !ms) {
    return <span className="hub-directory-table-body-text">—</span>;
  }
  return <HubDirectoryTimestampLabel at={ms} />;
}

type RenderWorkflowCellOpts = {
  defaultWorkflows: WorkflowConfig[];
  onCopyId?: (workflowId: string) => void;
  onContextMenu?: (workflow: WorkflowConfig, event: MouseEvent) => void;
};

export function renderStealthWorkflowDirectoryBodyCell(
  col: HubDirectoryColumnDef<StealthWorkflowSortKey>,
  workflow: WorkflowConfig,
  opts: RenderWorkflowCellOpts,
) {
  const { key, colClass } = col;
  const displayId = workflowDisplayId(workflow.id, opts.defaultWorkflows);
  const displayPlatform = workflowDisplayPlatform(workflow);
  const brand = workflowPlatformBrandMatch(workflow);
  const platformImageSrc = brand?.src ? resolveHubBrandAssetSrc(brand.src) : "";
  const FallbackIcon = platformImageSrc ? undefined : workflowDirectoryFallbackIcon(workflow, displayPlatform);

  switch (key as StealthWorkflowColumnKey) {
    case "platform":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="workflow-platform-cell">
            <HubDirectoryIconCell
              icon={FallbackIcon}
              imageSrc={platformImageSrc || undefined}
              imageShell={brand?.shell}
              iconClassName={workflowPlatformTone(displayPlatform)}
              label={displayPlatform}
            />
          </span>
        </DirectoryTableBodyCell>
      );
    case "name":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="stealth-workflow-name-cell min-w-0">
            <span className="hub-users-name-title truncate">{workflow.name}</span>
          </span>
        </DirectoryTableBodyCell>
      );
    case "id":
      return (
        <td
          key={key}
          className={colClass}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => {
            if (!opts.onContextMenu) return;
            event.preventDefault();
            opts.onContextMenu(workflow, event);
          }}
        >
          <HubCopyBadge value={displayId} title={`Copy ${displayId}`} onCopied={() => opts.onCopyId?.(workflow.id)} />
        </td>
      );
    case "steps":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass} typographyClass="hub-users-cell-num">
          {workflowStepCount(workflow)}
        </DirectoryTableBodyCell>
      );
    case "created":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderWorkflowTimestampCell(workflowCreatedMs(workflow))}
        </DirectoryTableBodyCell>
      );
    case "updated":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderWorkflowTimestampCell(workflowUpdatedMs(workflow))}
        </DirectoryTableBodyCell>
      );
    case "lastRun":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderWorkflowTimestampCell(workflowLastRunMs(workflow))}
        </DirectoryTableBodyCell>
      );
    case "activityLog": {
      const stepsCount = workflowStepCount(workflow);
      const firstStep = workflow.steps[0];
      const stepSummary = firstStep
        ? `${stepsCount} step${stepsCount === 1 ? "" : "s"} · ${firstStep.name || firstStep.kind}`
        : `0 steps · ${workflow.action || "open-url"}`;
      const targetPart = workflow.targetUrl ? ` · ${workflow.targetUrl}` : "";
      const inlineText = `${stepSummary}${targetPart}`;
      const popoverLines = [
        `Script: ${workflow.name} (${displayId})`,
        `Platform: ${displayPlatform} · Group: ${workflow.group || "Default"}`,
        `Entry Action: ${workflow.action || "open-url"}${workflow.targetUrl ? ` → ${workflow.targetUrl}` : ""}`,
        `Steps (${stepsCount}):`,
        ...(workflow.steps.length
          ? workflow.steps
              .slice(0, 8)
              .map((s, idx) => `  ${idx + 1}. [${s.kind}] ${s.name || s.selector || s.value || "Step"}`)
          : ["  (No steps configured)"]),
      ].join("\n");
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryValuePopover value={popoverLines} title="📋 Script Activity & Steps Log">
            <span className={`hub-directory-table-body-text text-[var(--muted)] ${DIRECTORY_CELL_TRUNCATE}`}>
              {inlineText}
            </span>
          </HubDirectoryValuePopover>
        </DirectoryTableBodyCell>
      );
    }
    default:
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          —
        </DirectoryTableBodyCell>
      );
  }
}
