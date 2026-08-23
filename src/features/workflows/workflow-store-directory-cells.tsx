import {
  DirectoryTableBodyCell,
  HubDirectoryIconCell,
  HubDirectoryTimestampLabel,
  HubUsersStatusLabel,
  type HubDirectoryColumnDef,
} from "@tool-workspace/hub-ui";
import { resolveHubBrandIconByMatch } from "@tool-workspace/hub-ui";
import { Globe2 } from "lucide-react";
import type { StealthWorkflowStoreColumnKey } from "../../lib/directory-column-meta";
import { DIRECTORY_CELL_TRUNCATE } from "../../lib/directory-cell-format";
import { resolveHubBrandAssetSrc } from "../../lib/hub-brand-asset-src";
import { workflowPlatformIconFor } from "./workflow-display";
import { workflowStoreUpdatedMs } from "./workflow-store-meta";
import { resolveStoreEntryPresence } from "./workflow-store-kpi-items";
import type { WorkflowStoreEntry } from "./workflow-store-types";
import type { WorkflowStoreSortKey } from "./WorkflowStoreDirectoryTable";
import { WorkflowStoreSourceDirectoryCell } from "./workflow-store-source-brand";

function renderStoreUpdatedCell(entry: WorkflowStoreEntry) {
  const ms = workflowStoreUpdatedMs(entry);
  if (ms == null) {
    return <span className="hub-directory-table-body-text">—</span>;
  }
  return <HubDirectoryTimestampLabel at={ms} />;
}

export function storeStatusLabel(entry: WorkflowStoreEntry, localIds: Set<string>, installedIds: Set<string>) {
  const presence = resolveStoreEntryPresence(entry.id, localIds, installedIds);
  if (presence === "local") return { label: "Local", tone: "online" as const };
  if (presence === "installed") return { label: "Installed", tone: "active" as const };
  return { label: "Available", tone: "idle" as const };
}

type RenderStoreCellOpts = {
  localIds: Set<string>;
  installedIds: Set<string>;
};

/** Golden: one line per column — no stacked subtitle/badges in Name (P0004 Hub tools). */
export function renderWorkflowStoreDirectoryBodyCell(
  col: HubDirectoryColumnDef<WorkflowStoreSortKey>,
  entry: WorkflowStoreEntry,
  opts: RenderStoreCellOpts,
) {
  const { key, colClass } = col;
  const brand = resolveHubBrandIconByMatch(entry.platform);
  const platformImageSrc = brand?.src ? resolveHubBrandAssetSrc(brand.src) : "";
  const FallbackIcon = platformImageSrc ? undefined : workflowPlatformIconFor(entry.platform) ?? Globe2;

  switch (key as StealthWorkflowStoreColumnKey) {
    case "platform":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubDirectoryIconCell
            icon={FallbackIcon ?? undefined}
            imageSrc={platformImageSrc || undefined}
            imageShell={brand?.shell}
            label={entry.platform}
          />
        </DirectoryTableBodyCell>
      );
    case "name":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="stealth-workflow-name-cell min-w-0">
            <span className={`hub-users-name-title ${DIRECTORY_CELL_TRUNCATE}`}>{entry.name}</span>
          </span>
        </DirectoryTableBodyCell>
      );
    case "version":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass} typographyClass="hub-users-cell-muted">
          <span className={DIRECTORY_CELL_TRUNCATE}>v{entry.version}</span>
        </DirectoryTableBodyCell>
      );
    case "group":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className={`hub-directory-table-body-text ${DIRECTORY_CELL_TRUNCATE}`}>{entry.group}</span>
        </DirectoryTableBodyCell>
      );
    case "status": {
      const status = storeStatusLabel(entry, opts.localIds, opts.installedIds);
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <HubUsersStatusLabel label={status.label} tone={status.tone} capitalize={false} />
        </DirectoryTableBodyCell>
      );
    }
    case "source":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <WorkflowStoreSourceDirectoryCell source={entry.source} />
        </DirectoryTableBodyCell>
      );
    case "updated":
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          {renderStoreUpdatedCell(entry)}
        </DirectoryTableBodyCell>
      );
    default:
      return (
        <DirectoryTableBodyCell key={key} colClass={colClass}>
          <span className="hub-directory-table-body-text">—</span>
        </DirectoryTableBodyCell>
      );
  }
}
