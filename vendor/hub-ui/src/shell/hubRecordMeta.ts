import type { HubTableColumnHeaderProps } from "../content/HubTableColumnHeader";

/** Fixed record metadata labels — any entity detail modal (vault row, CRM row, …). */
export const HUB_RECORD_META_LABELS = {
  vaultId: "Vault ID",
  created: "Created",
  updated: "Update",
} as const;

export const HUB_RECORD_META_FIELD_HEADERS: Record<
  keyof typeof HUB_RECORD_META_LABELS,
  HubTableColumnHeaderProps
> = {
  vaultId: { label: HUB_RECORD_META_LABELS.vaultId, role: "vault" },
  created: { label: HUB_RECORD_META_LABELS.created, role: "created" },
  updated: { label: HUB_RECORD_META_LABELS.updated, role: "updated" },
};
