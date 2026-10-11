import type { HubTocNavItem } from "../shell/HubTocSectionNav";

export type HubUserAccountTocEntry = {
  id: string;
  label: string;
  emoji: string;
};

/** Matches `HubUserAccountSections` anchors — P0020 ADM grouping. */
export const HUB_WORKSPACE_USER_ACCOUNT_TOC: HubUserAccountTocEntry[] = [
  { id: "hub-user-credentials", label: "Credentials", emoji: "🔐" },
  { id: "hub-user-identity", label: "Identity", emoji: "👤" },
  { id: "hub-user-status", label: "Status", emoji: "🚦" },
];

export const HUB_FULL_USER_ACCOUNT_TOC: HubUserAccountTocEntry[] = [
  ...HUB_WORKSPACE_USER_ACCOUNT_TOC,
  { id: "hub-user-note", label: "Note", emoji: "📝" },
  { id: "hub-user-log", label: "Log", emoji: "📋" },
];

export function hubUserAccountTocItems(entries: readonly HubUserAccountTocEntry[]): HubTocNavItem[] {
  return entries.map(({ id, label, emoji }) => ({
    id,
    label,
    emoji,
  }));
}

export function hubUserAccountSectionEmoji(entries: readonly HubUserAccountTocEntry[], id: string) {
  return entries.find((item) => item.id === id)?.emoji;
}
