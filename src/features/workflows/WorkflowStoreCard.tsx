import { CalendarDays, Globe2, Layers3 } from "lucide-react";
import {
  HubDirectoryCardCheckbox,
  HubDirectoryCardHeader,
  HubDirectoryCardLeadingIcon,
  HubDirectoryCardMetaRow,
  HubDirectoryInteractiveCard,
} from "@tool-workspace/hub-ui";
import { resolveHubBrandIconByMatch } from "@tool-workspace/hub-ui";
import { resolveHubBrandAssetSrc } from "../../lib/hub-brand-asset-src";
import {
  formatLastOpenedRelativeAge,
  formatLastOpenedStaleDate,
  lastOpenedAgeTone,
} from "../profiles/profile-directory-cell-helpers";
import { workflowPlatformIconFor } from "./workflow-display";
import { workflowStoreUpdatedMs } from "./workflow-store-meta";
import type { WorkflowStoreEntry } from "./workflow-store-types";
import {
  WorkflowStoreInstalledChip,
  WorkflowStoreLocalChip,
  WorkflowStoreSourceChip,
} from "./workflow-store-source-brand";

function formatStoreUpdatedLabel(entry: WorkflowStoreEntry) {
  const ms = workflowStoreUpdatedMs(entry);
  if (ms == null) return "—";
  const tone = lastOpenedAgeTone(ms);
  return tone === "stale" ? formatLastOpenedStaleDate(ms) : formatLastOpenedRelativeAge(ms);
}

export type WorkflowStoreCardProps = {
  entry: WorkflowStoreEntry;
  selected: boolean;
  localIds: Set<string>;
  installedIds: Set<string>;
  busy: boolean;
  onToggleSelect: (id: string) => void;
  onInstall: (entry: WorkflowStoreEntry) => void;
};

/** Golden card — HubToolCard / AgentContextCard parity (hub-chrome-type meta + brand chips). */
export function WorkflowStoreCard({
  entry,
  selected,
  localIds,
  installedIds,
  busy,
  onToggleSelect,
  onInstall,
}: WorkflowStoreCardProps) {
  const brand = resolveHubBrandIconByMatch(entry.platform);
  const platformImageSrc = brand?.src ? resolveHubBrandAssetSrc(brand.src) : "";
  const FallbackIcon = platformImageSrc ? undefined : workflowPlatformIconFor(entry.platform) ?? Globe2;
  const hasLocal = localIds.has(entry.id);
  const wasInstalled = installedIds.has(entry.id);

  return (
    <HubDirectoryInteractiveCard
      variant="grid"
      selected={selected}
      ariaLabel={`Install ${entry.name}`}
      className={busy ? "opacity-70" : undefined}
      onActivate={() => onInstall(entry)}
    >
      <HubDirectoryCardCheckbox
        checked={selected}
        label={`Select ${entry.name}`}
        onChange={() => onToggleSelect(entry.id)}
      />
      <div className="flex flex-1 flex-col p-4">
        <HubDirectoryCardHeader
          leading={
            platformImageSrc ? (
              <span className="hub-directory-card-leading-tile hub-directory-card-leading-tile--muted">
                <img src={platformImageSrc} alt="" className="hub-directory-card-leading-glyph" />
              </span>
            ) : (
              <HubDirectoryCardLeadingIcon icon={FallbackIcon ?? Globe2} tone="indigo" />
            )
          }
          badges={
            <span className="hub-chrome-type--micro rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-semibold text-[var(--muted)]">
              v{entry.version}
            </span>
          }
          title={entry.name}
          subtitle={entry.description || entry.id}
        />

        <div className="min-h-[var(--hub-card-meta-min-h)] shrink-0 space-y-1.5 text-xs text-[var(--muted)]">
          <HubDirectoryCardMetaRow icon={Globe2} tint="#38bdf8">
            {entry.platform}
          </HubDirectoryCardMetaRow>
          <HubDirectoryCardMetaRow icon={Layers3} tint="#a78bfa">
            {entry.group}
          </HubDirectoryCardMetaRow>
          <HubDirectoryCardMetaRow icon={CalendarDays} tint="#f472b6">
            {formatStoreUpdatedLabel(entry)}
          </HubDirectoryCardMetaRow>
        </div>

        <div className="mt-auto shrink-0 pt-3">
          <div className="flex min-h-[var(--hub-card-chip-row-min-h)] flex-wrap items-center gap-1.5">
            {hasLocal ? <WorkflowStoreLocalChip /> : null}
            {wasInstalled ? <WorkflowStoreInstalledChip /> : null}
            <WorkflowStoreSourceChip source={entry.source} />
          </div>
        </div>
      </div>
    </HubDirectoryInteractiveCard>
  );
}
