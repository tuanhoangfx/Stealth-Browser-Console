import type { HubBrandIconId } from "@tool-workspace/hub-ui";
import {
  HubBrandIcon,
  HubDirectoryIconCell,
  MetricBadge,
  resolveHubBrandIcon,
  resolveLocalOnlyIcon,
} from "@tool-workspace/hub-ui";
import { resolveHubBrandAssetSrc } from "../../lib/hub-brand-asset-src";
import type { WorkflowStoreSource } from "./workflow-store-types";

/**
 * SSOT — Workflow Store catalog source → Hub brand icon (`hub-brand-icons.registry.json`).
 * Platforms with a registered brand icon use HubBrandIcon chips — not colored status dots.
 */
export const WORKFLOW_STORE_SOURCE_BRAND_ID: Record<WorkflowStoreSource, HubBrandIconId> = {
  supabase: "supabase",
  drive: "google-drive",
};

export function workflowStoreSourceLabel(source: WorkflowStoreSource): string {
  return source === "supabase" ? "Supabase" : "Drive";
}

export function WorkflowStoreSourceChip({ source }: { source: WorkflowStoreSource }) {
  const brandId = WORKFLOW_STORE_SOURCE_BRAND_ID[source];
  const label = workflowStoreSourceLabel(source);
  return (
    <span
      title={source === "drive" ? "Drive manifest (static JSON)" : "Hub Supabase catalog"}
      className="hub-chrome-type--micro inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.03] px-1.5 leading-none text-[var(--muted)]"
    >
      <HubBrandIcon brandId={brandId} size={11} context="filter" title={label} />
      {label}
    </span>
  );
}

/** Directory table Source column — HubDirectoryIconCell parity with Platform column. */
export function WorkflowStoreSourceDirectoryCell({ source }: { source: WorkflowStoreSource }) {
  const brandId = WORKFLOW_STORE_SOURCE_BRAND_ID[source];
  const brand = resolveHubBrandIcon(brandId);
  const label = workflowStoreSourceLabel(source);
  const imageSrc = brand?.src ? resolveHubBrandAssetSrc(brand.src) : "";
  return (
    <HubDirectoryIconCell
      imageSrc={imageSrc || undefined}
      imageShell={brand?.shell}
      label={label}
      title={source === "drive" ? "Drive manifest (static JSON)" : "Hub Supabase catalog"}
    />
  );
}

export function WorkflowStoreLocalChip() {
  return <MetricBadge label="Local" tone="neutral" iconMeta={resolveLocalOnlyIcon()} title="Installed in local workflows" />;
}

export function WorkflowStoreInstalledChip() {
  return <MetricBadge label="Installed" tone="ok" title="Previously installed from Store" />;
}
