import { buildSemanticTocIcon } from "../lib/semantic-icon-registry";
import type { HubTocNavItem } from "../shell/HubTocSectionNav";
import type { SemanticIconKey } from "../types/semantic-icon";

export type HubUserChangeTocEntry = {
  id: string;
  label: string;
  semanticKey: SemanticIconKey;
};

export const HUB_CHANGE_EMAIL_TOC: HubUserChangeTocEntry[] = [
  { id: "hub-change-email-address", label: "Address", semanticKey: "user.linkEmail" },
  { id: "hub-change-email-confirm", label: "Confirmation", semanticKey: "user.session" },
];

export const HUB_CHANGE_PASSWORD_TOC: HubUserChangeTocEntry[] = [
  { id: "hub-change-password-email", label: "Email", semanticKey: "user.linkEmail" },
  { id: "hub-change-password-verify", label: "Verify", semanticKey: "user.security" },
];

export function hubUserChangeTocItems(entries: readonly HubUserChangeTocEntry[]): HubTocNavItem[] {
  return entries.map(({ id, label, semanticKey }) => ({
    id,
    label,
    icon: buildSemanticTocIcon(semanticKey),
  }));
}

export function hubUserChangeSectionIcon(entries: readonly HubUserChangeTocEntry[], id: string) {
  const entry = entries.find((item) => item.id === id);
  return entry ? buildSemanticTocIcon(entry.semanticKey) : undefined;
}
