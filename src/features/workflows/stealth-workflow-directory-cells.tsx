import type { MouseEvent } from "react";
import {
  DirectoryTableBodyCell,
  HubCopyBadge,
  HubDirectoryIconCell,
  HubUsersStatusLabel,
  type HubDirectoryColumnDef,
} from "@tool-workspace/hub-ui";
import type { StealthWorkflowColumnKey } from "../../lib/directory-column-meta";
import {
  formatLastOpenedRelativeAge,
  formatLastOpenedStaleDate,
  lastOpenedAgeTone,
  lastOpenedHubTone,
} from "../profiles/profile-directory-cell-helpers";
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

function renderWorkflowTimestampCell(ms: number | null) {
  if (ms == null || !Number.isFinite(ms) || !ms) {
    return <span className="hub-directory-table-body-text">—</span>;
  }
  const tone = lastOpenedAgeTone(ms);
  const label = tone === "stale" ? formatLastOpenedStaleDate(ms) : formatLastOpenedRelativeAge(ms);
  return (
    <HubUsersStatusLabel
      label={label}
      tone={lastOpenedHubTone(tone)}
      capitalize={false}
      title={new Date(ms).toLocaleString()}
    />
  );
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
          <span className="stealth-workflow-name-cell min-w-0" title={workflow.name}>
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
          <span title={`${workflowStepCount(workflow)} steps`}>{workflowStepCount(workflow)}</span>
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
    default:
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          —
        </DirectoryTableBodyCell>
      );
  }
}
