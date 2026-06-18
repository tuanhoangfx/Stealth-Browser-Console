import type { MouseEvent } from "react";
import {
  DirectoryRelativeTimeCell,
  DirectoryTableBodyCell,
  HubCopyBadge,
  HubDirectoryIconCell,
  type HubDirectoryColumnDef,
} from "@tool-workspace/hub-ui";
import type { StealthWorkflowColumnKey } from "../../lib/directory-column-meta";
import {
  workflowDisplayId,
  workflowDisplayPlatform,
  workflowPlatformIconFor,
  workflowPlatformSvgUrl,
  workflowPlatformTone,
} from "./workflow-display";
import { workflowCreatedMs, workflowStepCount, workflowUpdatedMs } from "./workflow-meta";
import type { WorkflowConfig } from "./workflow-types";
import type { StealthWorkflowSortKey } from "./StealthWorkflowDirectoryTable";

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
  const WorkflowIcon = workflowPlatformIconFor(displayPlatform);
  const platformSvgUrl = workflowPlatformSvgUrl(displayPlatform);

  switch (key as StealthWorkflowColumnKey) {
    case "platform":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="workflow-platform-cell">
            <HubDirectoryIconCell
              icon={platformSvgUrl ? undefined : WorkflowIcon}
              imageSrc={platformSvgUrl}
              iconClassName={workflowPlatformTone(displayPlatform)}
              label={displayPlatform}
              title={displayPlatform}
            />
          </span>
        </DirectoryTableBodyCell>
      );
    case "name":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-users-name-title" title={workflow.name}>
            {workflow.name}
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
          <span title={`${workflowStepCount(workflow)} steps`}>{workflowStepCount(workflow)}</span>
        </DirectoryTableBodyCell>
      );
    case "created":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <DirectoryRelativeTimeCell
            className="hub-users-cell-num text-[11px] font-semibold"
            ts={workflowCreatedMs(workflow)}
            title={workflow.createdAt ? new Date(workflow.createdAt).toLocaleString() : undefined}
          />
        </DirectoryTableBodyCell>
      );
    case "updated":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <DirectoryRelativeTimeCell
            className="hub-users-cell-num text-[11px] font-semibold"
            ts={workflowUpdatedMs(workflow)}
            title={workflow.updatedAt ? new Date(workflow.updatedAt).toLocaleString() : undefined}
          />
        </DirectoryTableBodyCell>
      );
    default:
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          —
        </DirectoryTableBodyCell>
      );
  }
}
