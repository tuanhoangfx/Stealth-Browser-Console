import {
  colHint,
  withFilterLabelHints,
  type FilterDef,
  type HubDirectoryColumnHintContent,
} from "@tool-workspace/hub-ui";
import { stealthFilterSticker } from "./stealth-column-stickers";
import type { StealthWorkflowPanelColumnKey, StealthWorkflowStoreColumnKey } from "./directory-column-keys";
import {
  stealthDisplayPrefHintContent,
  stealthProfileColumnHintContent,
  stealthWorkflowColumnHintContent,
  stealthWorkflowStoreColumnHintContent,
} from "./stealth-directory-column-hints";

export type StealthFilterHintScope = "profiles" | "workflow" | "workflow-store" | "system-extensions";

function asFilterBarHint(base: HubDirectoryColumnHintContent): HubDirectoryColumnHintContent {
  return {
    ...base,
    description: [base.description, "Shown in the filter bar when enabled in Display."]
      .filter(Boolean)
      .join(" "),
  };
}

const PROFILE_FILTER_COLUMN_MAP = {
  group: "group",
} as const;

const WORKFLOW_FILTER_COLUMN_MAP = {
  platform: "platform",
} as const satisfies Partial<Record<string, StealthWorkflowPanelColumnKey>>;

const WORKFLOW_STORE_FILTER_COLUMN_MAP: Record<string, StealthWorkflowStoreColumnKey> = {
  group: "group",
  platform: "platform",
  source: "source",
};

/** FilterBar facet hint — directory / display SSOT + filter-bar suffix. */
export function stealthFilterHintContent(
  filterKey: string,
  label: string,
  scope: StealthFilterHintScope,
): HubDirectoryColumnHintContent {
  if (scope === "profiles") {
    const columnKey = PROFILE_FILTER_COLUMN_MAP[filterKey as keyof typeof PROFILE_FILTER_COLUMN_MAP];
    if (columnKey) {
      return asFilterBarHint(stealthProfileColumnHintContent(columnKey, label));
    }
    if (filterKey === "status") {
      return asFilterBarHint(stealthDisplayPrefHintContent("status", "profiles", label));
    }
  }

  if (scope === "workflow") {
    const columnKey = WORKFLOW_FILTER_COLUMN_MAP[filterKey as keyof typeof WORKFLOW_FILTER_COLUMN_MAP];
    if (columnKey) {
      return asFilterBarHint(stealthWorkflowColumnHintContent(columnKey, label));
    }
    if (filterKey === "group") {
      return asFilterBarHint(stealthDisplayPrefHintContent("group", "workflow", label));
    }
  }

  if (scope === "workflow-store") {
    const columnKey = WORKFLOW_STORE_FILTER_COLUMN_MAP[filterKey];
    if (columnKey) {
      return asFilterBarHint(stealthWorkflowStoreColumnHintContent(columnKey, label));
    }
  }

  if (scope === "system-extensions" && filterKey === "kind") {
    return asFilterBarHint(colHint(label, "Store cache vs local unpacked folder."));
  }

  return colHint(label, "Filter facet shown in the toolbar when enabled in Display.");
}

export function applyStealthFilterLabelHints(
  filters: readonly FilterDef[],
  scope: StealthFilterHintScope,
): FilterDef[] {
  const stickered = filters.map((filter) => {
    const triggerEmoji = stealthFilterSticker(filter.key, scope);
    if (!triggerEmoji) return filter;
    return { ...filter, triggerEmoji, suppressDefaultTriggerIcon: true };
  });
  return withFilterLabelHints(stickered, (key, filterLabel) =>
    stealthFilterHintContent(key, filterLabel, scope),
  );
}
