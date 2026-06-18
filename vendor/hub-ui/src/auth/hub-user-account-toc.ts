import { buildSemanticTocIcon } from "../lib/semantic-icon-registry";
import type { HubTocNavItem } from "../shell/HubTocSectionNav";
import type { SemanticIconKey } from "../types/semantic-icon";

export type HubUserAccountTocEntry = {
  id: string;
  label: string;
  semanticKey: SemanticIconKey;
};

export const HUB_WORKSPACE_USER_ACCOUNT_TOC: HubUserAccountTocEntry[] = [
  { id: "hub-user-account", label: "Account", semanticKey: "user.account" },
  { id: "hub-user-session", label: "Session", semanticKey: "user.session" },
];

export const HUB_FULL_USER_ACCOUNT_TOC: HubUserAccountTocEntry[] = [
  { id: "hub-user-account", label: "Account", semanticKey: "user.account" },
];

export function hubUserAccountTocItems(entries: readonly HubUserAccountTocEntry[]): HubTocNavItem[] {
  return entries.map(({ id, label, semanticKey }) => ({
    id,
    label,
    icon: buildSemanticTocIcon(semanticKey),
  }));
}

export function hubUserAccountSectionIcon(entries: readonly HubUserAccountTocEntry[], id: string) {
  const entry = entries.find((item) => item.id === id);
  return entry ? buildSemanticTocIcon(entry.semanticKey) : undefined;
}
