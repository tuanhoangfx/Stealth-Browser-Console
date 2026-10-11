import { Archive, Compass, Package, ScrollText, StickyNote, User, type LucideIcon } from "lucide-react";

/** Account-detail modal section keys — TOC · main panel · note · log rail. */
export type HubAccountDetailSectionKind =
  | "navigate"
  | "record"
  | "credentials"
  | "note"
  | "log"
  | "subscription";

export type HubAccountDetailSectionTone = "indigo" | "emerald" | "amber" | "violet" | "sky";

/**
 * Layout 3 TOC and section titles use these emoji stickers.
 * Do not pass a Lucide `icon` for Account or Job — the Lucide map below is legacy chrome only.
 */
export const HUB_ACCOUNT_DETAIL_NAVIGATE_EMOJI = "🧭";
export const HUB_ACCOUNT_DETAIL_LOG_EMOJI = "📋";
/** Account section — person, same sticker as the Account column. */
export const HUB_ACCOUNT_DETAIL_ACCOUNT_EMOJI = "👤";
/** Job section — folder, same sticker as the Jobs column. */
export const HUB_ACCOUNT_DETAIL_JOB_EMOJI = "📁";

type HubAccountDetailSectionMeta = {
  Icon: LucideIcon;
  tone: HubAccountDetailSectionTone;
};

/** Golden section icon + tone map (P0020 Account · P0003 profile · P0006 tool-detail). */
export const HUB_ACCOUNT_DETAIL_SECTION_META: Record<
  HubAccountDetailSectionKind,
  HubAccountDetailSectionMeta
> = {
  navigate: { Icon: Compass, tone: "indigo" },
  record: { Icon: Archive, tone: "sky" },
  credentials: { Icon: User, tone: "emerald" },
  note: { Icon: StickyNote, tone: "amber" },
  log: { Icon: ScrollText, tone: "violet" },
  subscription: { Icon: Package, tone: "violet" },
};

export function hubAccountDetailSectionIcon(kind: HubAccountDetailSectionKind): LucideIcon {
  return HUB_ACCOUNT_DETAIL_SECTION_META[kind].Icon;
}

export function hubAccountDetailSectionIconClass(kind: HubAccountDetailSectionKind): string {
  const { tone } = HUB_ACCOUNT_DETAIL_SECTION_META[kind];
  return `hub-account-detail-section-icon hub-account-detail-section-icon--${tone}`;
}
