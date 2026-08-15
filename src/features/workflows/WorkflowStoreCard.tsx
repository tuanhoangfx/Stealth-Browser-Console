import { Globe2 } from "lucide-react";
import type { ReactNode } from "react";
import {
  HubDirectoryCardCheckbox,
  HubDirectoryCardHeader,
  HubDirectoryCardLeadingIcon,
  HubDirectoryInteractiveCard,
  HUB_DIRECTORY_CARD_META_TYPO_SSOT,
} from "@tool-workspace/hub-ui";
import { resolveHubBrandIconByMatch } from "@tool-workspace/hub-ui";
import { resolveHubBrandAssetSrc } from "../../lib/hub-brand-asset-src";
import { STEALTH_WORKFLOW_STORE_COLUMN_STICKER } from "../../lib/stealth-column-stickers";
import {
  formatLastOpenedRelativeAge,
  formatLastOpenedStaleDate,
  lastOpenedAgeTone,
} from "../profiles/profile-directory-cell-helpers";
import { storeStatusLabel } from "./workflow-store-directory-cells";
import { workflowPlatformIconFor } from "./workflow-display";
import { workflowStoreUpdatedMs } from "./workflow-store-meta";
import type { WorkflowStoreEntry } from "./workflow-store-types";
import {
  WorkflowStoreInstalledChip,
  WorkflowStoreLocalChip,
} from "./workflow-store-source-brand";
import type { WorkflowStoreDirectoryColumnKey } from "./workflow-store-directory-prefs";

function formatStoreUpdatedLabel(entry: WorkflowStoreEntry) {
  const ms = workflowStoreUpdatedMs(entry);
  if (ms == null) return "—";
  const tone = lastOpenedAgeTone(ms);
  return tone === "stale" ? formatLastOpenedStaleDate(ms) : formatLastOpenedRelativeAge(ms);
}

function StoreCardStickerMeta({ emoji, children }: { emoji: string; children: ReactNode }) {
  return (
    <div className={`flex items-center gap-2 ${HUB_DIRECTORY_CARD_META_TYPO_SSOT}`}>
      <span className="hub-users-th-emoji shrink-0 leading-none" aria-hidden>
        {emoji}
      </span>
      <div className="min-w-0 flex-1 truncate">{children}</div>
    </div>
  );
}

export type WorkflowStoreCardProps = {
  entry: WorkflowStoreEntry;
  selected: boolean;
  localIds: Set<string>;
  installedIds: Set<string>;
  busy: boolean;
  visibleColumnKeys: readonly WorkflowStoreDirectoryColumnKey[];
  onToggleSelect: (id: string) => void;
  onInstall: (entry: WorkflowStoreEntry) => void;
};

/** Golden card — meta rows follow Display → Table column visibility + sticker SSOT. */
export function WorkflowStoreCard({
  entry,
  selected,
  localIds,
  installedIds,
  busy,
  visibleColumnKeys,
  onToggleSelect,
  onInstall,
}: WorkflowStoreCardProps) {
  const visible = new Set(visibleColumnKeys);
  const brand = resolveHubBrandIconByMatch(entry.platform);
  const platformImageSrc = brand?.src ? resolveHubBrandAssetSrc(brand.src) : "";
  const FallbackIcon = platformImageSrc ? undefined : workflowPlatformIconFor(entry.platform) ?? Globe2;
  const hasLocal = localIds.has(entry.id);
  const wasInstalled = installedIds.has(entry.id);
  const status = storeStatusLabel(entry, localIds, installedIds);

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
            visible.has("platform") ? (
              platformImageSrc ? (
                <span className="hub-directory-card-leading-tile hub-directory-card-leading-tile--muted">
                  <img src={platformImageSrc} alt="" className="hub-directory-card-leading-glyph" />
                </span>
              ) : (
                <HubDirectoryCardLeadingIcon icon={FallbackIcon ?? Globe2} tone="indigo" />
              )
            ) : (
              <HubDirectoryCardLeadingIcon icon={Globe2} tone="sky" />
            )
          }
          badges={
            visible.has("version") ? (
              <span className="hub-chrome-type--micro rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-semibold text-[var(--muted)]">
                v{entry.version}
              </span>
            ) : null
          }
          title={entry.name}
          subtitle={entry.description || entry.id}
        />

        <div className={`min-h-[var(--hub-card-meta-min-h)] shrink-0 space-y-1.5 ${HUB_DIRECTORY_CARD_META_TYPO_SSOT}`}>
          {visible.has("platform") ? (
            <StoreCardStickerMeta emoji={STEALTH_WORKFLOW_STORE_COLUMN_STICKER.platform}>
              {entry.platform}
            </StoreCardStickerMeta>
          ) : null}
          {visible.has("group") ? (
            <StoreCardStickerMeta emoji={STEALTH_WORKFLOW_STORE_COLUMN_STICKER.group}>
              {entry.group}
            </StoreCardStickerMeta>
          ) : null}
          {visible.has("updated") ? (
            <StoreCardStickerMeta emoji={STEALTH_WORKFLOW_STORE_COLUMN_STICKER.updated}>
              {formatStoreUpdatedLabel(entry)}
            </StoreCardStickerMeta>
          ) : null}
          {visible.has("status") ? (
            <StoreCardStickerMeta emoji={STEALTH_WORKFLOW_STORE_COLUMN_STICKER.status}>
              {status.label}
            </StoreCardStickerMeta>
          ) : null}
          {visible.has("source") ? (
            <StoreCardStickerMeta emoji={STEALTH_WORKFLOW_STORE_COLUMN_STICKER.source}>
              {entry.source}
            </StoreCardStickerMeta>
          ) : null}
        </div>

        <div className="mt-auto shrink-0 pt-3">
          <div className="flex min-h-[var(--hub-card-chip-row-min-h)] flex-wrap items-center gap-1.5">
            {visible.has("status") && hasLocal ? <WorkflowStoreLocalChip /> : null}
            {visible.has("status") && wasInstalled ? <WorkflowStoreInstalledChip /> : null}
          </div>
        </div>
      </div>
    </HubDirectoryInteractiveCard>
  );
}
