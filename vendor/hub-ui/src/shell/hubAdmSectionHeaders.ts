import type { HubTableColumnHeaderProps } from "../content/HubTableColumnHeader";

/** Account detail modal — subsection headings (icon + label, sentence case). */
export type HubAdmSectionKey =
  | "status"
  | "record"
  | "identity"
  | "profile"
  | "device"
  | "plan"
  | "subscription"
  | "exchange"
  | "service"
  | "probe"
  | "browser"
  | "usage";

/** Section stickers are emoji — distinct from field column roles inside each block. */
const HUB_ADM_SECTION_HEADERS: Record<HubAdmSectionKey, HubTableColumnHeaderProps> = {
  status: { label: "Status", headerEmoji: "🚦" },
  record: { label: "Record", headerEmoji: "🗄️" },
  identity: { label: "Identity", headerEmoji: "👤" },
  profile: { label: "Profile", headerEmoji: "📡" },
  device: { label: "Device", headerEmoji: "📱" },
  plan: { label: "Plan", headerEmoji: "💎" },
  subscription: { label: "Subscription", headerEmoji: "💳" },
  exchange: { label: "Exchange", headerEmoji: "🛒" },
  service: { label: "Service", headerEmoji: "💠" },
  probe: { label: "Probe", headerEmoji: "📡" },
  browser: { label: "Browser", headerEmoji: "🖥️" },
  usage: { label: "Quota usage", headerEmoji: "📊" },
};

export function hubAdmSectionHeader(key: HubAdmSectionKey): HubTableColumnHeaderProps {
  return HUB_ADM_SECTION_HEADERS[key];
}

export function hubAdmSectionBlockClass(key: HubAdmSectionKey): string {
  return `hub-adm-section-block hub-adm-section-block--${key}`;
}
